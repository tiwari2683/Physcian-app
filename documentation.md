# Backend Lambda Architecture

## Lambda Functions Overview

| Lambda File | API Endpoint | Purpose |
|-------------|--------------|---------|
| `lambdaForCreateAsWellAsUpdate.js` | `PATIENT_PROCESSOR` | Patient data operations |
| `lambda/appointmentsFunction.js` | `APPOINTMENTS` | Appointment operations |

### Patient Processor Lambda (`lambdaForCreateAsWellAsUpdate.js`)

| Action | Description |
|--------|-------------|
| `searchPatients` | **Search patients by name or phone** (used in appointment booking) |
| `getAllPatients` | Get all patients list |
| `getPatient` | Get single patient with signed URLs |
| `createPatient` | Create new patient |
| `deletePatient` | Delete patient |

### Appointments Lambda (`lambda/appointmentsFunction.js`)

| Method | Description |
|--------|-------------|
| `GET` | Get all appointments |
| `POST` | Create/update appointment |
| `PATCH` | Reschedule appointment |
| `DELETE` | Cancel appointment |

> **⚠️ Important:** Patient search when booking appointments uses **PATIENT_PROCESSOR**, not Appointments Lambda. This is because it queries the Patients table, not Appointments.

---

I have completed the analysis of AsyncStorage usage in your project. It is primarily used for Data Caching, Draft Saving, and State Restoration.

1. State Preservation (Crash Proofing)
The most critical usage is handling Android "Activity Destruction" when using the Camera or File Picker. When the app goes to the background to open the camera, Android may kill the app to free up memory. Keys are used to restore the user exactly where they were:

PICKER_OPERATION_ACTIVE: Flag to indicate a picker is open.
PRE_PICKER_STATE: Stores the entire form state (patient ID, current tab, etc.).
LAST_KNOWN_ROUTE: Remembers which screen was active.
Files: App.tsx, clinical.tsx
2. Clinical Data "Drafts"
It auto-saves text as the user types, so they don't lose work if they accidentally navigate away or the app crashes.

pending_history_{patientId}
new_history_input_{patientId}
Files: clinical.tsx, NewPatientForm.tsx
3. Data Caching (Offline/Performance)
It caches clinical parameters and history so the user sees data immediately, even before the API call finishes (or if offline).

clinical_history_{patientId}: Stores historical vitals/params (INR, Hb, etc.).
clinical_params_{patientId}: Stores current parameter values.
Files: ViewParametersModal.tsx, clinical.tsx
4. Application Flags
clearDiagnosisFlag: Used to coordinate cleanup actions (like clearing the diagnosis tab) after a successful save.
Files: NewPatientForm.tsx

## Bug Fixes and Changelog

### 2025-12-29: Clinical Data Draft Restoration
- **Issue**: Clinical history text drafts were being saved to `AsyncStorage` but were not being restored when the user returned to the form, leading to apparent data loss.
- **Fix**: Updated `useClinicalForm.ts` to include a `useEffect` hook that checks for `new_history_input_{patientId}` or `pending_history_{patientId}` on component mount/patient change and restores the text into the input field.
- **Files Modified**: `Components/NewPatientForm/hooks/useClinicalForm.ts`

### 2025-12-29: Patient-Appointment Integration Refactor
- **Goal**: Resolve data disconnect where appointment patients did not appear in the main patient list.
- **Architectural Change**: Introduced "Pre-Registered" patient status. Appointments are now strictly linked to a `patientId`.
- **New Workflow**: 
  1. **New Appointment Modal**: Now features a "Smart Search". Users search for an existing patient or create a new one instantly.
  2. **Auto-Registration**: Creating a new patient from the appointment modal automatically generates a `PRE_REGISTERED` patient profile in the backend.
  3. **Visual Feedback**: 
      - Dashboard: Shows a `[PRE-REG]` badge for incomplete profiles.
      - Appointment Details: Shows a "Linked Profile" indicator and a "View Patient Profile" button.
- **Files Modified**: 
  - `lambda/appointmentsFunction.js`: Added `patientId` support.
  - `lambda/PatientDataProcessorFunction.js`: Added `status` field support.
  - `Components/Appointments/NewAppointmentModal.tsx`: Complete rewrite for search/create logic.
  - `Components/Appointments/AppointmentDetails.tsx`: Added profile linking navigation.
  - `Components/DoctorDashboard/DoctorDashboard.tsx`: Added status badge.

### 2025-12-30: S3 Upload and Viewing Fixes
- **Issue**: Reports were failing to upload (S3 Access Denied) or appearing as white squares (Private Access Link) in the dashboard.
- **Root Cause**:
  1.  **IAM Permissions**: Lambda role `PatientDataProcessorFunction-role-86qjrw0h` lacked `s3:PutObject` and `s3:GetObject` permissions.
  2.  **Incorrect Bucket/Region**: Code was targeting a different bucket/region than configured.
  3.  **Private File Access**: Files were private by default, preventing the app from displaying them via standard HTTP links.
- **Fixes Implemented**:
  1.  **IAM Policy**: Added inline policy to Lambda role allowing S3 actions on `dr-gawli-patient-files`.
  2.  **Presigned URLs**: Updated `lambdaForCreateAsWellAsUpdate.js` (specifically `handleGetPatient`) to generate secure, time-limited signed URLs for `reportFiles`.
  3.  **UI Refinements**: Cleaned up filenames in `PatientsData.tsx` and fixed label layout issues.
- **Files Modified**:
  - `lambdaForCreateAsWellAsUpdate.js`
  - `Components/PatientsData/PatientsData.tsx`

## Manual Configuration Guide (No Amplify CLI)

If you cannot use the Amplify CLI, follow these steps to set up the backend services manually:

### 1. S3 Storage Setup
1.  Log in to the **AWS Console**.
2.  Go to **S3** and click **Create Bucket**.
3.  Name the bucket: `dr-gawli-patient-files` (or match what is in `Config.ts`).
4.  Region: `ap-southeast-2` (Sydney) or your preferred region.
5.  **Permissions**:
    *   Uncheck "Block all public access" (if you need public read access for reports).
    *   **Bucket Policy**: Use the following JSON to allow public read access (simplest for now). Replace `dr-gawli-patient-files` with your actual bucket name.
        ```json
        {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": "s3:GetObject",
                    "Resource": "arn:aws:s3:::dr-gawli-patient-files/*"
                }
            ]
        }
        ```
6.  **CORS Configuration**:
    *   Go to **Permissions > CORS**.
    *   Paste this JSON to allow your app to upload/view files:
        ```json
        [
            {
                "AllowedHeaders": ["*"],
                "AllowedMethods": ["GET", "PUT", "POST", "HEAD"],
                "AllowedOrigins": ["*"],
                "ExposeHeaders": ["ETag"]
            }
        ]
        ```

### 2. Environment Variables
Copy `.env.example` to `.env` (though for Expo, we currently use `Config.ts` directly).
Update `Config.ts` with your new bucket name and URL prefix.

```typescript
export const AWS_CONFIG = {
  REGION: "ap-southeast-2", // Match your bucket region
  S3_BUCKET: "dr-gawli-patient-files",
  S3_URL_PREFIX: "https://dr-gawli-patient-files.s3.ap-southeast-2.amazonaws.com/",
};
```

---

## Patient Data Flow - Draft System & Storage

### Overview
This section explains the complete flow of patient data from creation to storage, including what is stored in **AsyncStorage (local)** vs **DynamoDB (cloud)**.

### Storage Locations

#### 📱 AsyncStorage (Local - Device Only)
**Purpose:** Temporary draft storage to prevent data loss during form filling

**What's Stored:**
- Incomplete patient forms (drafts)
- Auto-saved form data (every 1 second)
- Patient data fields (name, age, diagnosis, etc.)
- Clinical parameters (INR, HB, WBC, etc.)
- Medications list (unsaved prescriptions)
- Report file metadata (file URIs, names)
- Section completion status

**Storage Format:**
```javascript
Key: "DRAFT_PATIENT_<patientId>"
Value: {
  patientId: "P00123" or "draft_1234567890_abc",
  lastUpdatedAt: 1735654800000,
  status: "DRAFT",
  patientData: { name, age, sex, diagnosis, ... },
  clinicalParameters: { inr, hb, wbc, ... },
  medications: [...],
  reportFiles: [...],
  savedSections: { basic: true, clinical: false, ... }
}
```

**Lifecycle:**
- **Created:** When user starts filling form
- **Updated:** Auto-save every 1 second on changes
- **Deleted:** On successful submission, manual deletion, or auto-cleanup after 30 days

#### ☁️ DynamoDB (Cloud - Permanent Storage)
**Purpose:** Permanent patient records

**What's Stored:**
- Complete patient records (finalized only)
- Patient demographics (name, age, sex, mobile, address)
- Medical history (with timestamps)
- Diagnosis entries (current and historical)
- Advised investigations
- Clinical parameters (with dates)
- Medications (prescribed drugs with timing)
- Report files (S3 URLs after upload)
- Metadata (createdAt, updatedAt, status)

### Complete Patient Flow

#### New Patient Creation
1. **Form Initialization:**
   - User opens NewPatientForm
   - Generate temp draft ID: `draft_1735654800_abc123`
   - Initialize usePatientForm hook

2. **User Fills Basic Info:**
   - User types: Name, Age, Sex, Mobile, Address
   - onChange triggers updateField()
   - Auto-save effect saves to AsyncStorage (1s debounce)
   - Draft stored: `DRAFT_PATIENT_draft_1735654800_abc123`

3. **Navigate Between Tabs:**
   - User switches tabs: Basic → Clinical → Diagnosis → Prescription
   - Each tab auto-saves to AsyncStorage
   - Data restored when returning to tabs

4. **Final Submission:**
   - User clicks "Save Patient"
   - Collect all form data into single payload
   - Process medications and report files
   - Send to API endpoint (PATIENT_PROCESSOR)

5. **API Processing:**
   - Lambda receives payload
   - Create patient record in DynamoDB
   - Generate permanent ID: `P00123`
   - Upload files to S3
   - Update DynamoDB with S3 URLs
   - Return success with patientId

6. **Post-Save Cleanup:**
   - Delete draft from AsyncStorage
   - Navigate to DoctorDashboard
   - Patient now appears in patient list

#### Editing Existing Patient
1. User clicks "Prescribe" on existing patient
2. Load patient data from DynamoDB
3. Use patient ID (`P00123`) as draft ID
4. User edits data → Auto-save to AsyncStorage
5. Click "Update Patient" → Submit to API
6. Update DynamoDB record
7. Delete draft from AsyncStorage

### Auto-Save Behavior

**Triggers:**
- Any change to: patientData, clinicalParameters, medications, reportFiles, savedSections
- Debounced by 1 second to avoid excessive saves

**What Gets Saved:**
- Every keystroke (after 1s delay)
- Every dropdown change
- Every medication added/removed
- Every file uploaded
- Every tab completion

### Draft Cleanup

**Automatic Cleanup:**
- Runs when DoctorDashboard loads
- Deletes drafts older than 30 days
- Based on `lastUpdatedAt` timestamp
- Runs in background (non-blocking)

**Manual Cleanup:**
- User can delete drafts from dashboard
- Confirmation alert before deletion

### Summary Table

| Data Type | AsyncStorage | DynamoDB | When |
|-----------|-------------|----------|------|
| Draft patient data | ✅ Yes | ❌ No | During form filling |
| Completed patient | ❌ No | ✅ Yes | After save |
| Temp file URIs | ✅ Yes | ❌ No | Before upload |
| S3 file URLs | ❌ No | ✅ Yes | After upload |
| Auto-save (1s) | ✅ Yes | ❌ No | Continuous |
| Final save | ❌ No | ✅ Yes | On submit |
| Old drafts (30+ days) | 🗑️ Deleted | ❌ N/A | Auto-cleanup |

### Key Files
- **DraftService.ts:** Core draft management (save, load, delete, cleanup)
- **usePatientForm.ts:** Auto-save logic, draft lifecycle management
- **NewPatientForm.tsx:** Form submission, API integration
- **DoctorDashboard.tsx:** Draft listing, cleanup trigger