# EMR Data Dictionary: Chronic vs Acute

This dictionary defines the lifecycle of patient data fields to enforce separation between global patient history and session-specific consultation data.

## 1. Chronic Fields (Preserved)
*Persistent across all visits. Must NEVER be wiped during session initialization.*

| Field | Description | Storage Key |
| :--- | :--- | :--- |
| **Name** | Full name of the patient | `name` |
| **Age** | Current age (updated as needed) | `age` |
| **Sex** | Biological sex | `sex` |
| **Mobile** | Primary contact number | `mobile` |
| **Address** | Residential address | `address` |
| **Medical History** | Longitudinal text of past conditions/surgeries | `medicalHistory` |

## 2. Acute Fields (Wiped/Archived)
*Session-specific. Must be nullified or cleared when a new visit is initiated for a COMPLETED patient.*

| Field | Description | Storage Key |
| :--- | :--- | :--- |
| **Status** | Current state in the state machine | `status` |
| **Treatment** | Sub-status/progress indicator | `treatment` |
| **Clinical Parameters**| Vitals (HB, BP, INR, etc.) | `clinicalParameters` |
| **Diagnosis** | Acute diagnosis for this visit | `diagnosis` |
| **Prescription** | Medications prescribed in this session | `medications` |
| **Advised Tests** | Investigations/labs requested | `advisedInvestigations` |
| **Report Files** | Files/images uploaded during this visit | `reportFiles` |
| **Completion Date** | Timestamp of visit closure | `visitCompletedAt` |
| **Lock Date** | Date of visit closure for edit-prevention | `lastLockedVisitDate` |

---

## 3. The "Archive" Strategy
When a visit is "Wiped" from the Acute fields, it is preserved in the following history tables:
*   `ClinicalParametersHistory`
*   `DiagnosisHistoryEntries`
*   `MedicalHistoryEntries` (for cumulative notes)
