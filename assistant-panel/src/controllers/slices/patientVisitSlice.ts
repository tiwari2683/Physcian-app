import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type {
    PatientBasic,
    ClinicalData,
    DiagnosisData,
    Medication,
    VisitHistoryItem
} from '../../models';

export interface PatientVisitState {
    patientId: string | null;
    draftId: string | null;
    activeTab: number;

    // Current Form State
    basic: PatientBasic;
    clinical: ClinicalData;
    diagnosis: DiagnosisData;
    prescription: {
        medications: Medication[];
        isAssistant: boolean;
    };

    // History State (Independent arrays as per refinements)
    clinicalHistory: VisitHistoryItem[];
    medicalHistory: VisitHistoryItem[];
    diagnosisHistory: VisitHistoryItem[];
    investigationsHistory: VisitHistoryItem[];

    // Logic Flags
    isVisitLocked: boolean;
    lastLockedVisitDate: string | null;
    lastSavedAt: string | null;
    isLoading: boolean;
    error: string | null;
}

const initialState: PatientVisitState = {
    patientId: null,
    draftId: null,
    activeTab: 0,

    basic: {
        fullName: '',
        age: '',
        mobileNumber: '',
        sex: 'Male',
        address: '',
    },
    clinical: {
        historyText: '',
        vitals: {},
        reports: [],
    },
    diagnosis: {
        diagnosisText: '',
        selectedInvestigations: [],
        customInvestigations: '',
    },
    prescription: {
        medications: [],
        isAssistant: true, // Role Restriction
    },

    clinicalHistory: [],
    medicalHistory: [],
    diagnosisHistory: [],
    investigationsHistory: [],

    isVisitLocked: false,
    lastLockedVisitDate: null,
    lastSavedAt: null,
    isLoading: false,
    error: null,
};

const patientVisitSlice = createSlice({
    name: 'patientVisit',
    initialState,
    reducers: {
        updateBasicDetails: (state, action: PayloadAction<Partial<PatientBasic>>) => {
            if (!state.isVisitLocked) {
                state.basic = { ...state.basic, ...action.payload };
            }
        },
        updateClinicalDetails: (state, action: PayloadAction<Partial<ClinicalData>>) => {
            if (!state.isVisitLocked) {
                state.clinical = { ...state.clinical, ...action.payload };
            }
        },
        updateDiagnosisDetails: (state, action: PayloadAction<Partial<DiagnosisData>>) => {
            if (!state.isVisitLocked) {
                state.diagnosis = { ...state.diagnosis, ...action.payload };
            }
        },
        setMedications: (state, action: PayloadAction<Medication[]>) => {
            if (!state.isVisitLocked) {
                state.prescription.medications = action.payload;
            }
        },
        setActiveTab: (state, action: PayloadAction<number>) => {
            state.activeTab = action.payload;
        },

        // Visit Lock Logic
        setVisitLock: (state, action: PayloadAction<{ isLocked: boolean; lastLockedDate: string | null }>) => {
            state.isVisitLocked = action.payload.isLocked;
            state.lastLockedVisitDate = action.payload.lastLockedDate;
        },

        // Loading full history payload
        setFullPatientHistory: (state, action: PayloadAction<{
            clinicalHistory: any[];
            medicalHistory: any[];
            diagnosisHistory: any[];
            investigationsHistory: any[];
            patientData: Partial<PatientBasic>;
            lastLockedVisitDate?: string;
        }>) => {
            state.clinicalHistory = action.payload.clinicalHistory;
            state.medicalHistory = action.payload.medicalHistory;
            state.diagnosisHistory = action.payload.diagnosisHistory;
            state.investigationsHistory = action.payload.investigationsHistory;
            state.basic = { ...state.basic, ...action.payload.patientData };

            // Automatic Lock Detection
            if (action.payload.lastLockedVisitDate) {
                const today = new Date().toISOString().split('T')[0];
                const lockedDate = action.payload.lastLockedVisitDate.split('T')[0];
                if (lockedDate >= today) {
                    state.isVisitLocked = true;
                    state.lastLockedVisitDate = action.payload.lastLockedVisitDate;
                }
            }
        },

        markDraftSaved: (state, action: PayloadAction<string>) => {
            state.draftId = action.payload;
            state.lastSavedAt = new Date().toISOString();
        },

        restoreFromDraft: (state, action: PayloadAction<any>) => {
            return {
                ...state,
                ...action.payload,
                prescription: { ...action.payload.prescription, isAssistant: true }
            };
        },

        clearVisitSession: () => initialState,
    },
});

export const {
    updateBasicDetails,
    updateClinicalDetails,
    updateDiagnosisDetails,
    setMedications,
    setActiveTab,
    setVisitLock,
    setFullPatientHistory,
    markDraftSaved,
    restoreFromDraft,
    clearVisitSession,
} = patientVisitSlice.actions;

export default patientVisitSlice.reducer;
