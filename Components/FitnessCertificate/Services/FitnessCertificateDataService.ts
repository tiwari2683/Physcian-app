/**
 * Data fetching service for Fitness Certificate feature
 * Extracted from FitnessCertificate.tsx for better organization
 * 
 * IMPORTANT: This is a pure extraction - no logic changes from original implementation
 */

import type { Patient, DiagnosisHistoryEntry, InvestigationsHistoryEntry } from "../Types/FitnessCertificateTypes";

/**
 * Fetch complete patient record from backend
 * @param apiBaseUrl - API endpoint URL
 * @param patientId - Patient identifier
 * @returns Patient object or null on failure
 */
export const fetchPatientData = async (
    apiBaseUrl: string,
    patientId: string
): Promise<Patient | null> => {
    try {
        console.log(`📡 Fetching patient data for ID: ${patientId}`);

        const response = await fetch(apiBaseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "getPatient",
                patientId: patientId,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log(
            "📋 Full patient data response:",
            JSON.stringify(result, null, 2).substring(0, 500)
        );

        // Fix: Parse the body if it's a string
        let parsedData = result;
        if (typeof result.body === "string") {
            try {
                parsedData = JSON.parse(result.body);
                console.log("📋 Parsed response body successfully");
            } catch (parseError) {
                console.error("📋 Error parsing response body:", parseError);
                return null;
            }
        }

        console.log("📋 Patient data response received:", {
            success: parsedData.success,
            hasPatient: !!parsedData.patient,
            patientName: parsedData.patient?.name,
            responseKeys: Object.keys(parsedData),
        });

        if (parsedData.success && parsedData.patient) {
            console.log("✅ Patient data loaded successfully");
            return parsedData.patient;
        } else {
            console.warn("⚠️ Patient data not found or invalid response");
            return null;
        }
    } catch (error) {
        console.error("❌ Error fetching patient data:", error);
        return null;
    }
};

/**
 * Fetch patient's diagnosis history
 * @param apiBaseUrl - API endpoint URL
 * @param patientId - Patient identifier
 * @returns Array of diagnosis entries or empty array
 */
export const fetchDiagnosisHistory = async (
    apiBaseUrl: string,
    patientId: string
): Promise<DiagnosisHistoryEntry[]> => {
    try {
        console.log(`📡 Fetching diagnosis history for ID: ${patientId}`);

        const response = await fetch(apiBaseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "getDiagnosisHistory",
                patientId: patientId,
                includeAll: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // Fix: Parse the body if it's a string
        let parsedData = result;
        if (typeof result.body === "string") {
            try {
                parsedData = JSON.parse(result.body);
            } catch (parseError) {
                console.error(
                    "📋 Error parsing diagnosis history response body:",
                    parseError
                );
                return [];
            }
        }

        console.log("📋 Diagnosis history response received:", {
            success: parsedData.success,
            entriesCount: parsedData.diagnosisHistory?.length || 0,
        });

        if (parsedData.success && parsedData.diagnosisHistory) {
            console.log(
                `✅ Diagnosis history loaded: ${parsedData.diagnosisHistory.length} entries`
            );
            return parsedData.diagnosisHistory;
        } else {
            console.warn("⚠️ Diagnosis history not found or invalid response");
            return [];
        }
    } catch (error) {
        console.error("❌ Error fetching diagnosis history:", error);
        return [];
    }
};

/**
 * Fetch patient's investigations history
 * @param apiBaseUrl - API endpoint URL
 * @param patientId - Patient identifier
 * @returns Array of investigation entries or empty array
 */
export const fetchInvestigationsHistory = async (
    apiBaseUrl: string,
    patientId: string
): Promise<InvestigationsHistoryEntry[]> => {
    try {
        console.log(`📡 Fetching investigations history for ID: ${patientId}`);

        const response = await fetch(apiBaseUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "getInvestigationsHistory",
                patientId: patientId,
                includeAll: true,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();

        // Fix: Parse the body if it's a string
        let parsedData = result;
        if (typeof result.body === "string") {
            try {
                parsedData = JSON.parse(result.body);
            } catch (parseError) {
                console.error(
                    "📋 Error parsing investigations history response body:",
                    parseError
                );
                return [];
            }
        }

        console.log("📋 Investigations history response received:", {
            success: parsedData.success,
            entriesCount: parsedData.investigationsHistory?.length || 0,
        });

        if (parsedData.success && parsedData.investigationsHistory) {
            console.log(
                `✅ Investigations history loaded: ${parsedData.investigationsHistory.length} entries`
            );
            return parsedData.investigationsHistory;
        } else {
            console.warn("⚠️ Investigations history not found or invalid response");
            return [];
        }
    } catch (error) {
        console.error("❌ Error fetching investigations history:", error);
        return [];
    }
};
