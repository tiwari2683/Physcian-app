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


export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface PatientVisitState {
    patientId: string | null;
    draftId: string | null;
    /**
     * Set when the draft has been persisted to the cloud at least once.
     * Subsequent cloud saves use this ID in UPDATE mode instead of creating
     * a brand-new DynamoDB record every time.
     */
    cloudPatientId: string | null;
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

    // ── Layer 3: Cloud Auto-Save UX ──────────────────────────────────────────
    /** Drives the Google-Forms-style save indicator in FormFooter */
    saveStatus: SaveStatus;
}

const getInitialState = (): PatientVisitState => ({
    patientId: null,
    draftId: null,
    cloudPatientId: null,
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
        isAssistant: true,
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

    saveStatus: 'idle',
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

        // ── Layer 3 UX ───────────────────────────────────────────────────────
        /**
         * Manually set the cloud save status.
         * Called by the 8s autosave effect before dispatching the cloud thunk,
         * and by the thunk's fulfilled/rejected handlers via extraReducers.
         */
        setSaveStatus: (state, action: PayloadAction<SaveStatus>) => {
            state.saveStatus = action.payload;
        },

        /**
         * Store the cloud patient ID returned by the first successful cloud save.
         * All subsequent saves will use this in UPDATE mode.
         */
        setCloudPatientId: (state, action: PayloadAction<string>) => {
            state.cloudPatientId = action.payload;
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
            Object.assign(state, getInitialState());
            state.draftId = action.payload || DraftService.generateDraftId();
            state.visitStatus = 'DRAFT';
        },

        initializeExistingVisit: (state, action: PayloadAction<string>) => {
            Object.assign(state, getInitialState());
            state.patientId = action.payload;
            state.visitStatus = 'DRAFT';
        },

        loadDraftIntoState: (state, action: PayloadAction<DraftPatient>) => {
            const { patientData } = action.payload;

            state.patientId = patientData.patientId;
            state.draftId = patientData.draftId;
            state.cloudPatientId = patientData.cloudPatientId || null;
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
            state.saveStatus = 'saved'; // Hydrated from storage = already saved
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
    setSaveStatus,
    setCloudPatientId,
    setVisitLock,
    setFullPatientHistory,
    initializeNewVisit,
    initializeExistingVisit,
    loadDraftIntoState,
    clearVisitSession,
} = patientVisitSlice.actions;

export default patientVisitSlice.reducer;
