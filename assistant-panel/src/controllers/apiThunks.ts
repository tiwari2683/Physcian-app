import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Patient, Appointment } from '../models';
import { API_ENDPOINTS } from '../config';
import type { RootState } from './store';

// Helper to get auth token
const getAuthHeaders = async () => {
    try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();
        return {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        };
    } catch (e) {
        console.warn("Could not fetch auth session token", e);
        return { 'Content-Type': 'application/json' };
    }
};

export const sendToWaitingRoom = createAsyncThunk<any, any>(
    'patients/sendToWaitingRoom',
    async (patientData, { rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();

            const isDraftId = patientData.patientId?.startsWith('draft_') ||
                patientData.patientId?.startsWith('checkin_');

            // ── GUARDRAIL: Use actual cloudPatientId if available ──────────
            // sendToWaitingRoom is the FINAL submit. It overwrites status → WAITING.
            const resolvedPatientId = isDraftId
                ? (patientData.cloudPatientId || null)   // promote draft to real record
                : patientData.patientId;

            const payload: any = {
                // Basic Info
                name: patientData.basic?.fullName || '',
                age: patientData.basic?.age ? Number(patientData.basic.age) : 0,
                sex: patientData.basic?.sex || 'Male',
                mobile: patientData.basic?.mobileNumber || '',
                address: patientData.basic?.address || '',

                // Clinical Info
                medicalHistory: patientData.clinical?.historyText || '',
                clinicalParameters: patientData.clinical?.vitals || {},
                reportFiles: patientData.clinical?.reports || [],

                // Diagnosis Info
                diagnosis: patientData.diagnosis?.diagnosisText || '',
                advisedInvestigations: JSON.stringify([
                    ...(patientData.diagnosis?.selectedInvestigations || []),
                    ...(patientData.diagnosis?.customInvestigations ? [patientData.diagnosis.customInvestigations] : [])
                ]),

                // ── FINAL STATUS: promotes draft to live queue ────────────
                status: "WAITING",
                treatment: "WAITING",

                medications: [],
            };

            if (resolvedPatientId) {
                payload.patientId = resolvedPatientId;
                payload.updateMode = true;
                payload.action = "updatePatientData";
            } else {
                payload.patientId = null;
            }

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
// First call: creates a new record → returns patientId → stored as cloudPatientId
// Subsequent calls: uses cloudPatientId in UPDATE mode (no duplicate records).
// ============================================================================
export const autoSaveDraftToCloud = createAsyncThunk<
    { cloudPatientId: string },   // fulfilled return type
    void,                          // thunk arg
    { state: RootState }
>(
    'patientVisit/cloudSave',
    async (_, { getState, rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const patientData = getState().patientVisit;

            // Don't cloud-save if visit is completed or locked
            if (patientData.isVisitLocked || patientData.visitStatus === 'COMPLETED') {
                return rejectWithValue('Visit is locked — cloud save skipped');
            }

            // Don't cloud-save if there's no meaningful data yet
            if (!patientData.basic?.fullName) {
                return rejectWithValue('No patient name — cloud save skipped');
            }

            const payload: any = {
                name: patientData.basic?.fullName || '',
                age: patientData.basic?.age ? Number(patientData.basic.age) : 0,
                sex: patientData.basic?.sex || 'Male',
                mobile: patientData.basic?.mobileNumber || '',
                address: patientData.basic?.address || '',

                medicalHistory: patientData.clinical?.historyText || '',
                clinicalParameters: patientData.clinical?.vitals || {},
                reportFiles: patientData.clinical?.reports || [],

                diagnosis: patientData.diagnosis?.diagnosisText || '',
                advisedInvestigations: JSON.stringify([
                    ...(patientData.diagnosis?.selectedInvestigations || []),
                    ...(patientData.diagnosis?.customInvestigations ? [patientData.diagnosis.customInvestigations] : [])
                ]),

                // ── GUARDRAIL: Always 'DRAFT' — never enters live queue ──
                status: 'DRAFT',
                treatment: 'DRAFT',

                medications: [],
            };

            if (patientData.cloudPatientId) {
                // UPDATE MODE: reuse the same DynamoDB record
                payload.patientId = patientData.cloudPatientId;
                payload.updateMode = true;
                payload.action = 'updatePatientData';
            } else {
                // CREATE MODE: first cloud save — Lambda generates a new patientId
                payload.patientId = null;
            }

            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, payload, { headers });
            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            // Extract the DynamoDB-assigned patientId for subsequent UPDATE calls
            const cloudPatientId =
                responseData?.patientId ||
                responseData?.patient?.patientId ||
                patientData.cloudPatientId;

            if (!cloudPatientId) {
                throw new Error('No patientId returned from cloud save');
            }

            console.log('[CloudSave] Saved draft to cloud:', cloudPatientId);
            return { cloudPatientId };
        } catch (error: any) {
            return rejectWithValue(error.response?.data || error.message || 'Cloud save failed');
        }
    }
);

export const fetchPatients = createAsyncThunk<Patient[], void>(
    'patients/fetchAll',
    async (_, { rejectWithValue }) => {
        try {
            const headers = await getAuthHeaders();
            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
                action: 'getAllPatients'
            }, { headers });

            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            // ── GUARDRAIL: Strip DRAFT records from the live patient list ──
            // DRAFT patients must not appear in Waiting Room or Patients page.
            const allPatients: Patient[] = responseData.patients || [];
            return allPatients.filter((p: any) =>
                p.status !== 'DRAFT' && p.treatment !== 'DRAFT'
            );
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Failed to fetch patients');
        }
    }
);

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
