export interface DraftPatient {
    patientId: string;
    lastUpdatedAt: number;
    status: "DRAFT";
    patientData: any; // Aggregated state of the 4 tabs
    savedSections: {
        basic: boolean;
        clinical: boolean;
        diagnosis: boolean;
        prescription: boolean;
    };
}

const DRAFT_PREFIX = 'DRAFT_PATIENT_';

export const DraftService = {
    generateDraftId: (): string => {
        return `draft_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    },

    saveDraft: (patientId: string, data: DraftPatient): void => {
        if (!patientId) return;
        const key = `${DRAFT_PREFIX}${patientId}`;
        const draftData = {
            ...data,
            lastUpdatedAt: Date.now(),
        };
        localStorage.setItem(key, JSON.stringify(draftData));
    },

    getDraft: (patientId: string): DraftPatient | null => {
        if (!patientId) return null;
        const key = `${DRAFT_PREFIX}${patientId}`;
        const saved = localStorage.getItem(key);
        if (!saved) return null;

        try {
            return JSON.parse(saved) as DraftPatient;
        } catch (e) {
            console.error("Failed to parse draft", e);
            return null;
        }
    },

    deleteDraft: (patientId: string): void => {
        if (!patientId) return;
        const key = `${DRAFT_PREFIX}${patientId}`;
        localStorage.removeItem(key);
    },

    getAllDrafts: (): DraftPatient[] => {
        const drafts: DraftPatient[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(DRAFT_PREFIX)) {
                const saved = localStorage.getItem(key);
                if (saved) {
                    try {
                        drafts.push(JSON.parse(saved) as DraftPatient);
                    } catch (e) {
                        console.warn("Invalid draft format for key:", key);
                    }
                }
            }
        }
        return drafts.sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt);
    }
};
