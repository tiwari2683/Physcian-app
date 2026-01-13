import { FitnessCertificateProps } from "../Types/FitnessCertificateTypes";

// FEATURE FLAG: Enable/Disable cloud sync
export const ENABLE_CLOUD_SYNC = true;

/**
 * Saves a generated fitness certificate to the backend for persistence.
 * This is a "fire-and-forget" operation that should not block the UI.
 */
export const saveFitnessCertificateToBackend = async (
    apiUrl: string,
    patientId: string,
    certificateData: any
): Promise<boolean> => {
    if (!ENABLE_CLOUD_SYNC) {
        console.log("☁️ Cloud sync disabled via feature flag");
        return false;
    }

    try {
        console.log(`☁️ Syncing certificate to cloud for patient: ${patientId}`);

        // Construct simplified payload for backend
        // We send the entire form state plus metadata
        const payload = {
            action: "saveFitnessCertificate",
            patientId: patientId,
            data: {
                certificateId: certificateData.certificateId || Date.now().toString(),
                createdAt: new Date().toISOString(),
                ...certificateData // Spread the full form data
            }
        };

        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            // Log but do not throw - we don't want to crash the UI for background sync
            console.warn(`☁️ Backend save failed with status: ${response.status}`);
            return false;
        }

        const result = await response.json();
        if (result.success) {
            console.log("✅ Certificate synced to cloud successfully");
            return true;
        } else {
            console.warn("☁️ Backend reported failure:", result.error || result.message);
            return false;
        }
    } catch (error) {
        // Swallow the error to prevent UI disruption
        console.error("❌ Error syncing certificate to cloud:", error);
        return false;
    }
};

/**
 * Retrieves the history of fitness certificates for a patient.
 */
export const getFitnessCertificateHistory = async (
    apiUrl: string,
    patientId: string
): Promise<any[]> => {
    if (!ENABLE_CLOUD_SYNC) {
        return [];
    }

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                action: "getFitnessCertificates",
                patientId: patientId
            }),
        });

        if (!response.ok) {
            return [];
        }

        const result = await response.json();
        if (result.success && Array.isArray(result.certificates)) {
            return result.certificates;
        }
        return [];
    } catch (error) {
        console.error("❌ Error fetching certificate history:", error);
        return [];
    }
};
