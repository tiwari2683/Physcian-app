// draftService.ts uses any for state right now to decouple from strict types, 
// but we omit the unused PatientVisitState import.
const DRAFT_PREFIX = 'DRAFT_PATIENT_';

export const DraftService = {
    saveDraft: (patientId: string, state: any) => {
        if (!patientId) return;
        const key = `${DRAFT_PREFIX}${patientId}`;
        localStorage.setItem(key, JSON.stringify({
            ...state,
            timestamp: new Date().toISOString()
        }));
    },

    getDraft: (patientId: string): any | null => {
        if (!patientId) return null;
        const key = `${DRAFT_PREFIX}${patientId}`;
        const saved = localStorage.getItem(key);
        return saved ? JSON.parse(saved) : null;
    },

    clearDraft: (patientId: string) => {
        if (!patientId) return;
        const key = `${DRAFT_PREFIX}${patientId}`;
        localStorage.removeItem(key);
    },

    listAllDrafts: () => {
        const drafts = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith(DRAFT_PREFIX)) {
                drafts.push(key);
            }
        }
        return drafts;
    }
};
