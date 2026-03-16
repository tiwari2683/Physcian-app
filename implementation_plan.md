# Implementation Plan: "Acute Wipe & Archive" State Machine

This plan outlines the changes to enforce a clean separation between "Patient" (Chronic) and "Visit" (Acute) data, resolving the data-merging bug where old prescriptions pre-fill new visits.

## Proposed Changes

### 1. Backend: State Machine Enforcement
**File**: [lambdaForCreateAsWellAsUpdate.js](file:///e:/InternShip/lasttry/physcian-app/lambdaForCreateAsWellAsUpdate.js)

*   **Logic update in `updatePatientData`**:
    *   Currently, the backend marks `visitCompletedAt` but doesn't transition the `status`.
    *   Change: Explicitly set `status = 'COMPLETED'` when `saveSection === 'prescription'` and `isPartialSave === false`.
    *   This ensures the patient's record is marked as non-active in the DB.

---

### 2. Mobile App: Hydration Guard & Completion Status
**File**: [Components/NewPatientForm/hooks/usePatientForm.ts](file:///e:/InternShip/lasttry/physcian-app/Components/NewPatientForm/hooks/usePatientForm.ts)

*   **Logic update in `initializeData`**:
    *   Add a check for `data.patient.status`.
    *   If `status === 'COMPLETED'`, **Skip hydration** of Acute fields: `diagnosis`, `medications`, `clinicalParameters`, `advisedInvestigations`, `reports`.
    *   Only hydrate Chronic fields: `name`, `age`, `sex`, `mobile`, `address`, `medicalHistory`.
    *   If `status === 'WAITING'`, proceed with full hydration (Assistant-to-Doctor handoff).

**File**: [Components/NewPatientForm/NewPatientForm.tsx](file:///e:/InternShip/lasttry/physcian-app/Components/NewPatientForm/NewPatientForm.tsx)

*   **Logic update in `handleSubmit`**:
    *   When the doctor saves from the Prescription tab, explicitly add `status: 'COMPLETED'` to the payload.

---

### 3. Web Panel: Draft Initialization
**File**: [assistant-panel/src/controllers/slices/patientVisitSlice.ts](file:///e:/InternShip/lasttry/physcian-app/assistant-panel/src/controllers/slices/patientVisitSlice.ts)

*   **Verification**: Audit confirms `initializeExistingVisit` already clears acute fields.
*   **Safety Check**: Ensure `initializeNewVisit` and `initializeExistingVisit` are robustly called when starting any new session from the directory.

---

## Data Dictionary Refresher
*   **Chronic (Preserved)**: `name`, `age`, `sex`, `mobile`, `address`, `medicalHistory`.
*   **Acute (Wiped)**: `clinicalParameters`, `diagnosis`, `medications`, `advisedInvestigations`, `reportFiles`.

---

## Verification Plan

### Automated Tests
*   No existing automated testing framework detected. Verification will rely on manual lifecycle testing.

### Manual Verification
1.  **Scenario: Assistant Starts Fresh Visit**
    *   Search for a completed patient (e.g., Pablo).
    *   Start a new visit.
    *   Verify: Vitals, Diagnosis, and Prescription are empty in the Web Panel.
    *   Send to Doctor (`status: 'WAITING'`).
2.  **Scenario: Doctor Hydration**
    *   Open Pablo's record on the Mobile App.
    *   Verify: Wait state shows ONLY the data sent by the Assistant.
    *   Verify: NO data from Pablo's visit yesterday (e.g., old medications) is pre-filled.
3.  **Scenario: Completion Lifecycle**
    *   Doctor completes the visit.
    *   Verify: DynamoDB `status` transitions to `COMPLETED`.
    *   Verify: `lastLockedVisitDate` is set to today.
4.  **Scenario: Consecutive Visits**
    *   Immediately start *another* visit for Pablo.
    *   Verify: Form is fresh again, despite being saved 1 minute ago.
