import { API_ENDPOINTS } from "../Config";
import { fetchAuthSession } from "@aws-amplify/auth";

/**
 * Helper to get auth headers for API calls
 */
const getAuthHeaders = async () => {
    try {
        const session = await fetchAuthSession();
        const token = session.tokens?.idToken?.toString();

        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
            ...(token ? { "Authorization": `Bearer ${token}` } : {})
        };
    } catch (error) {
        console.warn("⚠️ Failed to get auth session:", error);
        return {
            "Content-Type": "application/json",
            "Accept": "application/json",
        };
    }
};

/**
 * Phase 3: Fetch active visit for a patient
 * Calls the 'getActiveVisit' action on the Lambda
 */
export const fetchActiveVisit = async (patientId: string) => {
    try {
        console.log(`📡 Fetching active visit for patient: ${patientId}`);
        const headers = await getAuthHeaders();

        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers,
            body: JSON.stringify({
                action: "getActiveVisit",
                patientId
            }),
        });

        const result = await response.json();
        const body = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

        if (body.success) {
            return body.activeVisit || null;
        }
        return null;
    } catch (error) {
        console.error("❌ Error fetching active visit:", error);
        return null;
    }
};

/**
 * Phase 3: Complete a visit (Doctor Consultation)
 * Calls the 'completeVisit' action on the Lambda
 */
export const completeVisit = async (payload: {
    patientId: string;
    visitId: string;
    acuteData: {
        diagnosis: string;
        medications: any[];
        clinicalParameters: any;
        reportFiles: any[];
        advisedInvestigations?: string;
    }
}) => {
    try {
        const { patientId, visitId, acuteData } = payload;
        console.log(`🚀 Completing visit ${visitId} for patient ${patientId}`);
        const headers = await getAuthHeaders();

        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers,
            body: JSON.stringify({
                action: "completeVisit",
                patientId,
                visitId,
                acuteData: acuteData
            }),
        });

        const result = await response.json();
        const body = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

        if (body.success) {
            console.log("✅ Visit completed successfully");
            return { success: true, message: body.message };
        } else {
            throw new Error(body.error || body.message || "Failed to complete visit");
        }
    } catch (error: any) {
        console.error("❌ Error completing visit:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Helper to initiate a visit if none exists
 * Mirroring the Assistant's capability for the Doctor app
 */
export const initiateVisit = async (basicInfo: {
    patientId: string;
    name: string;
    age: string;
    sex: string;
    mobile: string;
    address: string;
}) => {
    try {
        console.log(`🎬 Initiating fresh visit for patient: ${basicInfo.patientId}`);
        const headers = await getAuthHeaders();

        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers,
            body: JSON.stringify({
                action: "initiateVisit",
                ...basicInfo
            }),
        });

        const result = await response.json();
        const body = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

        if (body.success && body.visitId) {
            return { success: true, visitId: body.visitId };
        } else {
            throw new Error(body.error || body.message || "Failed to initiate visit");
        }
    } catch (error: any) {
        console.error("❌ Error initiating visit:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Transitions a visit to IN_PROGRESS status
 * Used when a doctor opens a patient from the waiting queue
 */
export const startConsultation = async (visitId: string) => {
    try {
        console.log(`🚀 Starting consultation for visit: ${visitId}`);
        const headers = await getAuthHeaders();

        const response = await fetch(API_ENDPOINTS.PATIENT_PROCESSOR, {
            method: "POST",
            headers,
            body: JSON.stringify({
                action: "updateVisitStatus",
                visitId,
                status: "IN_PROGRESS"
            }),
        });

        const result = await response.json();
        const body = result.body ? (typeof result.body === "string" ? JSON.parse(result.body) : result.body) : result;

        if (body.success) {
            console.log(`✅ Visit ${visitId} status updated to IN_PROGRESS`);
            return true;
        }
        return false;
    } catch (error) {
        console.error("❌ Error starting consultation:", error);
        return false;
    }
};