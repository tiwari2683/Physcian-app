import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Patient, Appointment } from '../models';
import { API_ENDPOINTS } from '../config';
import type { RootState } from './store';
import { setVisitId, setCloudPatientId, setFullPatientHistory } from './slices/patientVisitSlice';

// ============================================================================
// AUTH HELPER
// Returns headers with Bearer token, or throws if no valid session exists.
// This prevents unauthenticated requests from hitting the API and getting 400s.
// ============================================================================
const getAuthHeaders = async () => {
    try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        if (!token) {
            // No token means user is not authenticated — abort instead of sending
            // a bare request that the API Gateway will reject with 400/401
            throw new Error('No auth token available — user is not authenticated');
        }

        return {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
        };
    } catch (e: any) {
        console.warn('getAuthHeaders failed:', e?.message || e);
        // Re-throw so callers can rejectWithValue instead of sending bad requests
        throw e;
    }
};

// ============================================================================
// VISIT THUNKS
// ============================================================================

export const initiateVisitThunk = createAsyncThunk<
    { visitId: string },
    { patientId: string; name: string; age: string; sex: string; mobile: string; address: string },
    { state: RootState }
>(
    'patientVisit/initiate',
    async (basicInfo, { dispatch, rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const payload = {
                action: 'initiateVisit',
                ...basicInfo
            };

            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, payload, { headers });
            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            if (responseData.success && responseData.visitId) {
                dispatch(setVisitId(responseData.visitId));
                return { visitId: responseData.visitId };
            } else {
                throw new Error(responseData.message || 'Failed to initiate visit');
            }
        } catch (error: any) {
            return rejectWithValue(error.message || 'Failed to initiate visit');
        }
    }
);

export const fetchPatientDataThunk = createAsyncThunk<
    any,
    string,
    { state: RootState }
>(
    'patientVisit/fetchPatient',
    async (patientId, { dispatch, rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
                action: 'getPatient',
                patientId
            }, { headers });

            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            if (responseData.success && responseData.patient) {
                const p = responseData.patient;
                dispatch(setFullPatientHistory({
                    clinicalHistory: responseData.clinicalHistory || [],
                    medicalHistory: responseData.medicalHistory || [],
                    diagnosisHistory: responseData.diagnosisHistory || [],
                    investigationsHistory: responseData.investigationsHistory || [],
                    patientData: {
                        fullName: p.name || '',
                        age: p.age ? String(p.age) : '',
                        sex: (p.sex as any) || 'Male',
                        mobileNumber: p.mobile || '',
                        address: p.address || '',
                    },
                    lastLockedVisitDate: p.lastLockedVisitDate
                }));
                return responseData;
            } else {
                throw new Error(responseData.message || 'Failed to fetch patient data');
            }
        } catch (error: any) {
            return rejectWithValue(error.message || 'Failed to fetch patient data');
        }
    }
);

export const sendToWaitingRoom = createAsyncThunk<any, any, { state: RootState }>(
    'patients/sendToWaitingRoom',
    async (patientData, { getState, rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const state = getState().patientVisit;

            const payload: any = {
                action: 'updateVisit',
                visitId: patientData.visitId || state.visitId,
                patientId: patientData.patientId || state.patientId || state.cloudPatientId,

                // Clinical Info
                medicalHistory: patientData.medicalHistory || patientData.clinical?.historyText || '',
                clinicalParameters: patientData.clinicalParameters || patientData.clinical?.vitals || {},
                reportFiles: patientData.reportFiles || patientData.clinical?.reports || [],

                // Diagnosis Info
                diagnosis: patientData.diagnosis || patientData.diagnosis?.diagnosisText || '',
                advisedInvestigations: patientData.advisedInvestigations || JSON.stringify([
                    ...(patientData.diagnosis?.selectedInvestigations || []),
                    ...(patientData.diagnosis?.customInvestigations ? [patientData.diagnosis.customInvestigations] : [])
                ]),

                // Final status: promotes draft to live queue
                status: 'WAITING',
                treatment: patientData.treatment || 'WAITING',
                medications: patientData.medications || [],

                // Identify this record as pre-filled by the Assistant
                sentByAssistant: true,
            };

            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, payload, { headers });

            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            return responseData;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Failed to send to waiting room');
        }
    }
);

// ============================================================================
// LAYER 3: Cloud Auto-Save Draft (debounced, status: 'DRAFT')
//
// Sends the current visit state to DynamoDB with status='DRAFT'.
// DRAFT records are filtered out of all live queues (Waiting Room, patients list).
//
// First call:       creates a new patient record → returns patientId → stored as cloudPatientId
//                   then initiates a visit → returns visitId → stored in state
// Subsequent calls: uses visitId to UPDATE the existing Visits record (no duplicates).
// ============================================================================
export const autoSaveDraftToCloud = createAsyncThunk<
    { cloudPatientId: string; visitId?: string },
    void,
    { state: RootState }
>(
    'patientVisit/cloudSave',
    async (_, { getState, dispatch, rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const state = getState().patientVisit;

            // Guard: do not save if visit is already locked or completed
            if (state.isVisitLocked || state.visitStatus === 'COMPLETED') {
                return rejectWithValue('Visit is locked — cloud save skipped');
            }

            // Guard: do not save if there is no patient name yet
            if (!state.basic?.fullName) {
                return rejectWithValue('No patient name — cloud save skipped');
            }

            // ── SCENARIO A: We already have a visitId → update Visits table only ──
            if (state.visitId) {
                const payload = {
                    action: 'updateVisit',
                    visitId: state.visitId,
                    clinicalParameters: state.clinical?.vitals || {},
                    diagnosis: state.diagnosis?.diagnosisText || '',
                    reportFiles: state.clinical?.reports || [],
                    advisedInvestigations: JSON.stringify([
                        ...(state.diagnosis?.selectedInvestigations || []),
                        ...(state.diagnosis?.customInvestigations ? [state.diagnosis.customInvestigations] : [])
                    ])
                };
                await axios.post(API_ENDPOINTS.PATIENT_DATA, payload, { headers });
                return { cloudPatientId: state.cloudPatientId!, visitId: state.visitId };
            }

            // ── SCENARIO B: No visitId yet ──

            // B1: No cloudPatientId → create the Patient master record first
            let resolvedPatientId = state.cloudPatientId;
            if (!resolvedPatientId) {
                // NOTE: No `action` field here — Lambda's default case handles plain
                // patient creation via processPatientData() when action is absent.
                // Field names must match what processPatientData() expects: name/age/sex/mobile/address
                const createPayload = {
                    name: state.basic.fullName,
                    age: state.basic.age,
                    sex: state.basic.sex,
                    mobile: state.basic.mobileNumber,
                    address: state.basic.address
                };
                const res = await axios.post(API_ENDPOINTS.PATIENT_DATA, createPayload, { headers });
                const body = typeof res.data.body === 'string' ? JSON.parse(res.data.body) : res.data;
                resolvedPatientId = body.patientId;
                if (!resolvedPatientId) throw new Error('Failed to create patient — no patientId returned');
                dispatch(setCloudPatientId(resolvedPatientId));
            }

            // B2: Initiate a new Visit record for this patient
            const initRes = await dispatch(initiateVisitThunk({
                patientId: resolvedPatientId,
                name: state.basic.fullName,
                age: state.basic.age,
                sex: state.basic.sex,
                mobile: state.basic.mobileNumber,
                address: state.basic.address
            })).unwrap();

            return { cloudPatientId: resolvedPatientId, visitId: initRes.visitId };
        } catch (error: any) {
            return rejectWithValue(error.message || 'Cloud save failed');
        }
    }
);

// ============================================================================
// PATIENT LIST THUNKS
// ============================================================================

export const fetchPatients = createAsyncThunk<Patient[], void>(
    'patients/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
                action: 'getAllPatients'
            }, { headers });

            const body = response.data.body;
            let responseData;

            if (typeof body === 'string') {
                try {
                    responseData = JSON.parse(body);
                } catch (e) {
                    console.error('Failed to parse Patients body', e);
                    responseData = response.data;
                }
            } else {
                responseData = body || response.data;
            }

            const allPatients: Patient[] = responseData.patients || (Array.isArray(responseData) ? responseData : []);

            // Filter out DRAFT records from the main patients list
            return allPatients.filter((p: any) =>
                p.status !== 'DRAFT' && p.treatment !== 'DRAFT'
            );
        } catch (error: any) {
            console.error('fetchPatients error details:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            return rejectWithValue(error.response?.data || error.message || 'Failed to fetch patients');
        }
    }
);

export const fetchWaitingRoom = createAsyncThunk<Patient[], void>(
    'patients/fetchWaitingRoom',
    async (_, { rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
                action: 'getWaitingRoom'
            }, { headers });

            const body = response.data.body;
            let responseData;

            if (typeof body === 'string') {
                try {
                    responseData = JSON.parse(body);
                } catch (e) {
                    console.error('Failed to parse WaitingRoom body', e);
                    responseData = response.data;
                }
            } else {
                responseData = body || response.data;
            }

            return responseData.patients || (Array.isArray(responseData) ? responseData : []);
        } catch (error: any) {
            console.error('fetchWaitingRoom error details:', {
                message: error.message,
                status: error.response?.status,
                data: error.response?.data
            });
            return rejectWithValue(error.response?.data || error.message || 'Failed to fetch waiting room');
        }
    }
);

// ============================================================================
// APPOINTMENT THUNKS
// ============================================================================

export const fetchAppointments = createAsyncThunk<Appointment[], void>(
    'appointments/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const response = await axios.get(API_ENDPOINTS.APPOINTMENTS, { headers });
            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            return responseData;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Failed to fetch appointments');
        }
    }
);

export const createAppointment = createAsyncThunk<Appointment, Partial<Appointment>>(
    'appointments/create',
    async (appointmentData, { dispatch, rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const response = await axios.post(API_ENDPOINTS.APPOINTMENTS, appointmentData, { headers });

            dispatch(fetchAppointments());
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Failed to create appointment');
        }
    }
);