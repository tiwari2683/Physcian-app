import AsyncStorage from "@react-native-async-storage/async-storage";

// Define the structure of a draft
export interface DraftPatient {
    patientId: string;
    lastUpdatedAt: number;
    status: "DRAFT";
    patientData: any;
    clinicalParameters: any;
    medications: any[];
    reportData: any;
    reportFiles: any[];
    savedSections: {
        basic: boolean;
        clinical: boolean;
        prescription: boolean;
        diagnosis: boolean;
    };
}

const DRAFT_PREFIX = "DRAFT_PATIENT_";

export const DraftService = {
    /**
     * Generates a temporary ID for a new patient draft
     */
    generateDraftId: (): string => {
        return `draft_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Saves a draft to AsyncStorage
     * @param patientId Unique ID for the patient (or temporary draft ID)
     * @param data Partial or complete draft data
     */
    saveDraft: async (patientId: string, data: Partial<DraftPatient>): Promise<boolean> => {
        if (!patientId) return false;

        try {
            const key = `${DRAFT_PREFIX}${patientId}`;

            // Get existing draft to merge if needed, though usually we pass full state from hook
            // But it's safer to merge in case we only pass partial updates
            const existingJson = await AsyncStorage.getItem(key);
            const existingData = existingJson ? JSON.parse(existingJson) : {};

            const draftPayload: DraftPatient = {
                ...existingData,
                ...data,
                patientId,
                lastUpdatedAt: Date.now(),
                status: "DRAFT",
            };

            await AsyncStorage.setItem(key, JSON.stringify(draftPayload));
            // console.log(`[DraftService] Saved draft for ${patientId}`);
            return true;
        } catch (error) {
            console.error(`[DraftService] Error saving draft for ${patientId}:`, error);
            return false;
        }
    },

    /**
     * Retrieves a draft by patientId
     * @param patientId 
     */
    getDraft: async (patientId: string): Promise<DraftPatient | null> => {
        if (!patientId) return null;

        try {
            const key = `${DRAFT_PREFIX}${patientId}`;
            const json = await AsyncStorage.getItem(key);
            if (!json) return null;

            return JSON.parse(json) as DraftPatient;
        } catch (error) {
            console.error(`[DraftService] Error getting draft for ${patientId}:`, error);
            return null;
        }
    },

    /**
     * Deletes a draft
     * @param patientId 
     */
    deleteDraft: async (patientId: string): Promise<boolean> => {
        if (!patientId) return false;

        try {
            const key = `${DRAFT_PREFIX}${patientId}`;
            await AsyncStorage.removeItem(key);
            console.log(`[DraftService] Deleted draft for ${patientId}`);
            return true;
        } catch (error) {
            console.error(`[DraftService] Error deleting draft for ${patientId}:`, error);
            return false;
        }
    },

    /**
     * Gets all available drafts
     */
    getAllDrafts: async (): Promise<DraftPatient[]> => {
        try {
            const keys = await AsyncStorage.getAllKeys();
            const draftKeys = keys.filter(key => key.startsWith(DRAFT_PREFIX));

            if (draftKeys.length === 0) return [];

            const pairs = await AsyncStorage.multiGet(draftKeys);
            const drafts: DraftPatient[] = pairs
                .map(([key, value]) => {
                    try {
                        return value ? JSON.parse(value) : null;
                    } catch (e) {
                        return null;
                    }
                })
                .filter(draft => draft !== null)
                .sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt); // Newest first

            return drafts;
        } catch (error) {
            console.error("[DraftService] Error getting all drafts:", error);
            return [];
        }
    }
};
