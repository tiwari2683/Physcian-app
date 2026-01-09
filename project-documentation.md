# Physician App - Comprehensive Developer Guide & Logic Flows

> **Target Audience**: Developers, Technical Leads, and System Architects.
> **Purpose**: To provide a deep understanding of the system's "Brain", specifically **HOW** data moves, **WHERE** logic lives, and **WHY** certain architectural decisions were made.

---

## 1. System Architecture & Data Strategy

### 1.1 The "Serverless Monolith"
The backend is not a collection of microservices. It is a **Single Lambda Function** (`lambdaForCreateAsWellAsUpdate.js`) that acts as a unified API Gateway.

*   **Why?**: Reduces cold starts, simplifies deployment, and allows shared logic (like `deduplicateReportFiles`) to live in one place without complex dependencies.
*   **Routing**: The `action` field in the request body determines the path.
    *   `{ "action": "getPatient", ... }` -> Routes to `handleGetPatient()`
    *   `{ "action": "confirmFileUpload", ... }` -> Routes to `confirmFileUpload()`

### 1.2 Data Storage Strategy
*   **DynamoDB**: Stores JSON documents.
    *   **Key Design**: We do NOT store "Prescriptions" or "Visits" as separate tables. They are nested arrays *inside* the `Patients` table object.
    *   **Implication**: Fetching a patient gets EVERYTHING. This creates a snappy UI but requires careful partial updates (handled by `processSectionSave`).
*   **S3 (Strict Security)**:
    *   **No Public Access**: All files are private.
    *   **Signed URLs**: We never store `https://s3...` links in the database. We store `s3Key` (e.g., `patient123/report.pdf`). The API generates a temporary, 10-minute validity URL *on read*.

---

## 2. Critical Execution Flows

This section details the exact step-by-step logic for key functionalities. Use this to trace bugs or explain the system.

### 2.1 File Upload Flow (The "Secure Handshake")
*Goal: Upload a large report without crashing the Lambda function.*

1.  **User Action**: Selects a file (Image/PDF) in `ViewUploadedFilesModal`.
2.  **Frontend**:
    *   Reads file info (name, type).
    *   **Request 1**: Calls API `getPresignedUploadUrl`.
3.  **Backend (`generatePresignedUploadUrl`)**:
    *   Validates permission.
    *   Generates a special S3 URL valid for 5 minutes.
    *   Returns `{ uploadUrl, s3Key }`.
4.  **Frontend**:
    *   **Direct Upload**: Performs a `PUT` request directly to the `uploadUrl` (bypassing backend).
    *   *Latency Check*: Waits for 200 OK from S3.
5.  **Frontend**:
    *   **Request 2**: Calls API `confirmFileUpload` with `{ s3Key, patientId }`.
6.  **Backend (`confirmFileUpload`)**:
    *   **Verification**: Does a `HeadObject` call to S3 to prove the file actually exists.
    *   **DB Update**: Appends file metadata to `Patients` table.
7.  **Result**: UI allows the user to see the new file immediately.

### 2.2 Patient Save Flow (The "Master Save")
*Goal: Save complex form data spanning 4 tabs (Basic, Clinical, Diagnosis, Prescription).*

1.  **User Action**: Taps "Save" in `NewPatientForm`.
2.  **Frontend (`handleSave`)**:
    *   **Aggregation**: Pulls state from all contexts (`basicData`, `vitals`, `diagnosis`, `medications`).
    *   **Validation**: Checks required fields (Name, Age, Phone).
    *   **Draft Cleanup**: Deletes local draft since save is initiating.
3.  **Backend (`processPatientData` / `updatePatientData`)**:
    *   **Deduplication**: Checks if `reportFiles` in payload match existing ones to prevent duplicates.
    *   **History Archival**:
        *   If `vitals` changed -> Pushes copy to `ClinicalParametersHistory` table.
        *   If `diagnosis` changed -> Pushes copy to `DiagnosisHistoryEntries` table.
    *   **Primary Update**: overwrites/merges data in `Patients` table.
4.  **Frontend**:
    *   Receives success.
    *   **Invalidation**: Triggers `loadPatients` in Dashboard to refresh list.
    *   Navigates back.

### 2.3 Prescription Generation Flow
*Goal: Create a printable PDF.*

1.  **User Action**: Fills medicines and taps "Print".
2.  **Frontend (`generatePDF` in `generateprescription.tsx`)**:
    *   **HTML Template**: Loads a raw HTML string.
    *   **Injection**: Replaces placeholders (`{{PATIENT_NAME}}`, `{{MEDICINES}}`) with actual data.
    *   **Table Generation**: Loops through `medications` array to build HTML table rows.
3.  **Expo Print**:
    *   Sends HTML to native OS print service.
    *   Android/iOS generates the PDF blob.
4.  **User Action**: Can "Share" (WhatsApp/Email) or "Print" to printer.

### 2.4 Authentication Flow
*Goal: Ensure secure access.*

1.  **App Launch (`App.tsx`)**:
    *   `initializeApp()` runs.
    *   Checks `AsyncStorage` for legacy state.
2.  **Amplify Check**:
    *   Calls `getCurrentUser()`.
3.  **Routing**:
    *   If User -> Set `initialRoute = "DoctorDashboard"`.
    *   If No User -> Set `initialRoute = "Login"`.
4.  **Login Screen**:
    *   User enters creds -> `signIn` -> MFA setup (if required) -> Success.
    *   Updates `AppState` context -> App re-renders -> Navigation switches to Dashboard.

---

## 3. Component Deep Dives

### 3.1 `NewPatientForm.tsx` (The Controller)
This is not just a view; it is a **State Controller**.
*   **Responsibility**: It holds the "Master State" for the patient.
*   **Context Passing**: It passes `patientData` and `setPatientData` down to children tabs (`PrescriptionTab`, `ClinicalTab`).
*   **Draft Service Integration**: Every 30 seconds (or on blur), it dumps the current state to `DraftService`.

### 3.2 `MedicineAutocomplete.tsx` (The Smart Input)
Replaces the old standard dropdown.
*   **Logic**:
    *   Listens to `onChangeText`.
    *   **Filter**: `medications.filter(m => m.name.toLowerCase().startsWith(query))`
    *   **Optimization**: Uses `useMemo` or debouncing to prevent UI freeze on large lists.
    *   **Free Text**: If no match found, renders a "Add 'X'" button to allow custom medicines.

### 3.3 `VisitContextSummary.tsx` (The UI Spacer)
Designed to solve the "Too much scrolling" problem.
*   **State**: `isExpanded` (Boolean).
*   **Logic**:
    *   On Mount: Checks if it's a new or existing patient.
    *   **Collapsed**: Calculates "Hints" -> "3 medicines • 1 report".
    *   **Expanded**: Renders the heavy React Native views for history/reports.
    *   *Performance*: Keeps the heavy views unmounted/hidden until requested.

---

## 4. Backend File Map (`lambdaForCreateAsWellAsUpdate.js`)

If you need to change backend logic, find the right function here:

| Logic Area | Function Name | Description |
|------------|---------------|-------------|
| **Core** | `handler` | Main entry point. Switch statement router. |
| **Parsing** | `unmarshallDynamoDBItem` | Converts DynamoDB JSON (`{"S": "value"}`) to standard JSON. |
| **Files** | `enrichPatientFilesWithSignedUrls` | Adds temporary access URLs to file objects. *Crucial for security.* |
| **Files** | `deduplicateReportFiles` | Compares incoming vs existing files by `s3Key`. Prevents data corruption. |
| **Load** | `handleGetPatient` | The "Heavy" read. Gets patient + all history arrays. |
| **Save** | `updatePatientData` | The "Heavy" write. Complex logic to archive history and valid fields. |

---

## 5. Developer Guide: How to...

### How to Add a New Field (e.g., "Blood Sugar")
1.  **Database**: No change needed (DynamoDB is schema-less).
2.  **Frontend (UI)**:
    *   Open `Components/NewPatientForm/clinical.tsx`.
    *   Add `<TextInput>` for Blood Sugar.
    *   Bind to `patientData.clinical.sugar`.
3.  **Frontend (Print)**:
    *   Open `generateprescription.tsx`.
    *   Add `{{SUGAR}}` to HTML template.
    *   Map `data.clinical.sugar` to the variable.

### How to Debug a "File Not Loading" Issue
1.  **Check Console**: Look for "Enriching files...".
2.  **Verify Backend**: In `lambda`, check `enrichPatientFilesWithSignedUrls`. Ensure it's finding the `s3Key`.
3.  **Check Expiry**: Signed URLs expire in 10-15 mins. If the app has been open longer, a refresh (`pull-to-refresh` on Dashboard) is needed to generate new URLs.

### How to Reset Local Data
*   **Clear Drafts**: Call `DraftService.cleanupOldDrafts(0)`.
*   **Logout**: Clears Amplify session but *not* drafts.

---

## 6. Deployment Checklist

*   [ ] **Environment Variables**: Check `aws-exports.js` aligns with Prod/Dev environment.
*   [ ] **Lambda Memory**: Ensure Lambda has at least 512MB (Image processing is heavy).
*   [ ] **S3 CORS**: Ensure Bucket CORS allows `PUT` from the mobile app's origin (or `*` for development).
*   [ ] **Bundle**: Run `npx expo export` to verify assets bundle correctly.

---

## 7. Developer Cheat Sheet: Function & Logic Map

Use this map to instantly find the logic you need.

### 🔍 Table 1: Features & Logic Map

| Feature | Key Function / Logic | File Location | Line (Approx) |
|:---|:---|:---|:---|
| **Patient Search** | `applyFiltersAndSort` | `Components/PatientsData/PatientsData.tsx` | ~258 |
| **Sorting Patients** | `applyFiltersAndSort` | `Components/PatientsData/PatientsData.tsx` | ~285 |
| **Patient Filter (Male/Female)** | `applyFiltersAndSort` | `Components/PatientsData/PatientsData.tsx` | ~274 |
| **Sorting Appointments** | `getTodaysAppointments` | `Components/Appointments/Appointments.tsx` | ~167 |
| **Appointment Date Parsing** | `parseAppointmentDateTime` | `Components/Appointments/Appointments.tsx` | ~102 |
| **PDF Generation (HTML)** | `generateHtml` | `Components/NewPatientForm/generateprescription.tsx` | ~277 |
| **PDF Print Trigger** | `generatePDF` | `Components/NewPatientForm/generateprescription.tsx` | ~596 |
| **S3 Upload (Backend)** | `generatePresignedUploadUrl` | `lambdaForCreateAsWellAsUpdate.js` | ~35 |
| **S3 Confirmation (Backend)** | `confirmFileUpload` | `lambdaForCreateAsWellAsUpdate.js` | ~95 |
| **Deduplication Logic** | `deduplicateReportFiles` | `lambdaForCreateAsWellAsUpdate.js` | ~596 |
| **Draft Saving** | `saveDraft` | `Components/NewPatientForm/Services/DraftService.ts` | ~36 |
| **Medicine Search** | `medications.filter(...)` | `Components/NewPatientForm/prescription.tsx` (Inside `MedicineAutocomplete`) | N/A |

### 🛠️ Table 2: modification Guide "Where do I look?"

#### 1. "I want to change the PDF layout"
*   **Go to**: `generateprescription.tsx`
*   **Find**: `pdfStyles` constant (Line ~21).
*   **Action**: It is standard CSS string. Edit `.prescription-header`, `.medications-table` directly.

#### 2. "I want to add a new filter to the Patient List"
*   **Go to**: `PatientsData.tsx`
*   **Step 1**: Update `applyFiltersAndSort` function (~Line 258) to accept your new filter string.
*   **Step 2**: Update the UI to call `setFilterBy("your-filter")`.

#### 3. "I want to change how appointments are sorted"
*   **Go to**: `Appointments.tsx`
*   **Find**: `getTodaysAppointments` (~Line 167).
*   **Logic**: It currently sorts by `Emergency` priority first, then `time`.
*   **Modify**: Change the `.sort((a,b) => ...)` comparator logic.

#### 4. "I want to Fix a 'File Not Found' bug"
*   **Go to**: `lambdaForCreateAsWellAsUpdate.js`
*   **Find**: `deduplicateReportFiles` (~Line 596) or `confirmFileUpload` (~Line 95).
*   **Debug**: Check if `uploadedToS3` flag is being set correctly during `confirmFileUpload`.

