# Migration Execution Plan: Master & Active Visit Architecture

This plan outlines the system-wide refactor to move from a "Flat Overwrite" model to a "Patient Master + Active Visit" architecture, strictly enforcing data separation and ensuring total visit history preservation.

---

## Phase 1: Backend & Database (Master/Active Separation)

### 1.1 Database Schema Refactor
*   **Keep `Patients` Table (Master)**:
    *   **Primary Key**: `patientId` (UUID).
    *   **Role**: Stores permanent demographics and chronic data.
    *   **New Attribute**: `visitHistory` (List of Maps). Each map contains a snapshot of a completed visit (`visitId`, `date`, `diagnosis`, `medications`, `vitals_summary`).
*   **New `Visits` Table (Active)**:
    *   **Partition Key**: `visitId` (UUID).
    *   **Global Secondary Index (GSI)**: `patientId-index` (`PK: patientId`, `SK: status`).
    *   **Role**: Stores acute session data (`diagnosis`, `medications`, `clinicalParameters`, `reportFiles`).

### 1.2 Lambda Refactor (`PATIENT_PROCESSOR`)
*   **`initiateVisit`**: Generates a new `visitId`, sets `status: 'WAITING'`, and creates the record in the `Visits` Table.
*   **`getActiveVisit`**: Queries the `Visits` Table GSI for `patientId` where `status` is `WAITING` or `IN_PROGRESS`. Returns exactly one record or null.
*   **`updateVisit`**: Updates the `Visits` record for a specific `visitId`.
*   **`completeVisit` (Atomic Operation)**:
    1.  Update `Visits[visitId]` -> `status: 'COMPLETED'`.
    2.  Update `Patients[patientId]` -> Append `visitId` summary to `visitHistory` list.
    3.  *Success requirement*: Both updates must succeed (TransactWriteItems).

---

## Phase 2: Web Panel (Assistant Intake Refactor)

### 2.1 State Management (`patientVisitSlice.ts`)
*   Introduce `visitId` to the Redux state.
*   Update `initializeNewVisit` and `initializeExistingVisit` to trigger the backend `initiateVisit` call immediately to secure a unique `visitId` for the session.

### 2.2 Intake Submission
*   Modify `autoSaveDraftToCloud` to target the `Visits` table using the `visitId`.
*   Ensure the `status` is always `WAITING` when the Assistant sends the record to the Doctor.

---

## Phase 3: Mobile App (Doctor consultation Refactor)

### 3.1 Hydration Logic (`usePatientForm.ts`)
*   **Dual-Query Initialization**:
    1.  Fetch `Master Record` from `Patients` table (to populate history/demographics).
    2.  Fetch `Active Visit Record` from `Visits` table via `getActiveVisit`.
*   **Form Pre-fill Rule**: 
    *   If `Active Visit` exists: Hydrate all clinical fields.
    *   If `Active Visit` is null: Open form with blank clinical fields. **Never** fallback to Master Record fields for acute inputs.

### 3.2 Completion Logic (`handleSubmit`)
*   Update the final submit call to use the `completeVisit` endpoint.
*   Ensure the payload includes all required clinical data for the Master Record snapshot.

---

## Acknowledgement & Acceptance
I have read and acknowledged the Technical Brief. The core of this migration is transitioning from **Implicit State** (overwriting a single row) to **Explicit Session Identity** (new `visitId` per encounter). 
