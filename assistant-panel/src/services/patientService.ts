import axios from 'axios';
import { API_ENDPOINTS } from '../config';

export const PatientService = {
    getPatientProfile: async (patientId: string) => {
        const response = await axios.get(`${API_ENDPOINTS.PATIENT_DATA}?patientId=${patientId}`);
        return response.data; // Expecting history arrays and patient profile
    },

    saveVisit: async (patientId: string, payload: any) => {
        const response = await axios.post(API_ENDPOINTS.PATIENT_DATA, {
            action: 'processPatientVisit',
            patientId,
            ...payload
        });
        return response.data;
    },

    searchPatients: async (query: string) => {
        const response = await axios.get(`${API_ENDPOINTS.PATIENT_DATA}?search=${query}`);
        return response.data;
    }
};
