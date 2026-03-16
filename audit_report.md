# EMR Architecture Audit Report

**Principal EMR Systems Architect & Lead Auditor Report**

## Executive Summary
This audit confirms a critical architecture flaw where the system lacks a discrete "Visit" entity at the database level. Instead, it relies on a flat "Patient" record that is continuously overwritten. This design, coupled with a failure to enforce state transitions on the Mobile App, is the root cause of the data-merging bug.

---

## Task 1: Database Schema & Storage Audit (DynamoDB)

### The Storage Mechanism: **CONTINUOUS OVERWRITE**
The system **violates** the separation between global chronic data and acute session data at the storage layer. 

*   **Patients Table**: Uses a **flat JSON row** (`PK: patientId`, No Sort Key). Every time a patient is updated (either by the Assistant or the Doctor), the *same row* is overwritten. 
*   **Discrete Visit Records**: No discrete "Visit" object exists in the primary `Patients` table. Each "Visit" is merely a temporary state of the global patient record.
*   **History Logs**: While separate tables exist (e.g., `ClinicalParametersHistory`), they are treated as append-only logs for viewing history, not as the source of truth for the active session.

### Exact Key Structure:
| Entity | Table Name | Partition Key (PK) | Sort Key (SK) |
| :--- | :--- | :--- | :--- |
| **Patient (Global)** | `Patients` | `patientId` (String) | *None* |
| **Clinical History** | `ClinicalParametersHistory` | `patientId` (String) | `date` (Timestamp) |
| **Diagnosis History**| `DiagnosisHistoryEntries` | `patientId` (String) | `date` (Timestamp) |

---

## Task 2: State Machine Lifecycle Audit

### Rule A: Assistant "Send to Doctor" sets `status: 'WAITING'`
*   **Status**: ✅ **ENFORCED**
*   **Verification**: The Web Panel's `sendToWaitingRoom` thunk in `apiThunks.ts` (Line 59) explicitly injects `status: "WAITING"` into the payload. The backend successfully processes this into the `Patients` table.

### Rule B: Doctor "Save/Update" sets `status: 'COMPLETED'`
*   **Status**: ❌ **VIOLATED**
*   **Audit Finding**: The Mobile App's `handleSubmit` logic in `usePatientForm.ts` and `NewPatientForm.tsx` builds a payload for `updatePatientData` but **completely misses** the `status` attribute.
*   **Backend Symptom**: While the backend (`lambdaForCreateAsWellAsUpdate.js`) adds `visitCompletedAt` and `lastLockedVisitDate`, it **does not** explicitly update the `status` attribute to `'COMPLETED'`. Consequently, a patient remains in `'WAITING'` or `'ACTIVE'` status indefinitely, even after the visit is "locked."

---

## Task 3: The Hydration & Pre-fill Audit (The Core Bug)

### The Question: Why is old data pre-filling active boxes?
The Mobile App fails to differentiate between "Last Visit's Data" and "This Visit's Data" during hydration.

### Root Cause Analysis:
In `usePatientForm.ts` (Lines 246–317), the following critical failures were found:
1.  **Blind Merging**: The fetching logic (`getPatient` action) retrieves the flat `Patients` row. It then blindly copies `diagnosis`, `prescription`, `treatment`, and `reports` directly into the current form state if `prefillMode` is enabled.
2.  **Missing Status Check**: The logic **fails to filter by status**. It does not check `if (status === 'WAITING')`. Because the `Patients` table row *always* contains the data from the last visit (since it's overwritten), the app treats yesterday's completed prescription as today's active input.
3.  **Clinical Parameter Leak**: Despite comments suggesting otherwise, `clinicalParameters` are also hydrated from the API (Line 282), causing old vitals to appear in new sessions.

---

## Auditor Conclusion
The system successfully promotes patients from Assistant to Doctor (`WAITING`), but fails to "drain" the acute data back to a clean state once the Doctor completes the visit. 

**I am currently waiting for your specific instructions before writing or modifying any code.** 
