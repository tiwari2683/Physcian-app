import { createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';
import { fetchAuthSession } from 'aws-amplify/auth';
import type { Patient, Appointment } from '../models';
import { API_ENDPOINTS } from '../config';

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

            // The backend expects a flattened payload, NOT a nested `patientData` object.
            // Map our specific Redux state schema to the DynamoDB model schema
            const isDraftId = patientData.patientId?.startsWith('draft_');

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

                // Status marker indicating it's waiting for the doctor
                status: "WAITING",
                treatment: "WAITING", // Some components refer to treatment="WAITING"

                // Explicitly send an empty prescription list because the assistant cannot prescribe
                medications: [],
            };

            if (!isDraftId && patientData.patientId) {
                // UPDATE Mode: The backend's `updatePatientData` expects `patientId` and `updateMode: true`
                payload.patientId = patientData.patientId;
                payload.updateMode = true;
                payload.action = "updatePatientData";
            } else {
                // CREATE Mode: The backend's `processPatientData` creates the initial record.
                // We omit `patientId` so it generates a new UUID. 
                // Any unhandled action string causes the Lambda to fall back to the default handler loop.
                payload.patientId = null;
            }

            const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, payload, { headers });

            // Ensure consistent response format from Lambda Proxy
            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            return responseData;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Failed to send to waiting room');
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

            // Handle Lambda's stringified body if necessary
            const responseData = typeof response.data.body === 'string'
                ? JSON.parse(response.data.body)
                : response.data;

            return responseData.patients || [];
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
            // Ensure consistent response format from Lambda Proxy
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

            // Fetch latest appointments after a successful creation
            dispatch(fetchAppointments());
            return response.data;
        } catch (error: any) {
            return rejectWithValue(error.response?.data || 'Failed to create appointment');
        }
    }
);
