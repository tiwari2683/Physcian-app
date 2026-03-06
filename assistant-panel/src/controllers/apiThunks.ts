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
            return response.data;
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
