import { createSlice } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import { DraftService, type DraftPatient } from '../../services/draftService';
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
    visitStatus: 'DRAFT' | 'WAITING' | 'COMPLETED';

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
    lastSavedAt: number | null;
    isLoading: boolean;
    error: string | null;
}

const getInitialState = (): PatientVisitState => ({
    patientId: null,
    draftId: null,
    activeTab: 0,
    visitStatus: 'DRAFT',

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
});

const initialState: PatientVisitState = getInitialState();

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
            if (action.payload.isLocked) {
                state.visitStatus = 'COMPLETED';
            }
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
                    state.visitStatus = 'COMPLETED';
                }
            }
        },

        // Draft Management
        initializeNewVisit: (state, action: PayloadAction<string | undefined>) => {
            // Reset state using a factory function approach
            Object.assign(state, getInitialState());

            // If the UI generated a specific draft ID to sync with the URL, use it.
            // Otherwise, fallback to generating one here.
            state.draftId = action.payload || DraftService.generateDraftId();
            state.visitStatus = 'DRAFT';
        },

        initializeExistingVisit: (state, action: PayloadAction<string>) => {
            Object.assign(state, getInitialState());
            state.patientId = action.payload;
            // State will remain in DRAFT until AWS fetch populates it or it gets locked
            state.visitStatus = 'DRAFT';
        },

        loadDraftIntoState: (state, action: PayloadAction<DraftPatient>) => {
            // Overwrite the specific dynamic state portions
            const { patientData } = action.payload;

            state.patientId = patientData.patientId;
            state.draftId = patientData.draftId;
            state.activeTab = patientData.activeTab;
            state.visitStatus = patientData.visitStatus;

            state.basic = patientData.basic;
            state.clinical = patientData.clinical;
            state.diagnosis = patientData.diagnosis;
            state.prescription = { ...patientData.prescription, isAssistant: true };

            state.clinicalHistory = patientData.clinicalHistory || [];
            state.medicalHistory = patientData.medicalHistory || [];
            state.diagnosisHistory = patientData.diagnosisHistory || [];
            state.investigationsHistory = patientData.investigationsHistory || [];

            state.isVisitLocked = patientData.isVisitLocked;
            state.lastLockedVisitDate = patientData.lastLockedVisitDate;
            state.lastSavedAt = action.payload.lastUpdatedAt;
        },

        clearVisitSession: () => getInitialState(),
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
    initializeNewVisit,
    initializeExistingVisit,
    loadDraftIntoState,
    clearVisitSession,
} = patientVisitSlice.actions;

export default patientVisitSlice.reducer;
