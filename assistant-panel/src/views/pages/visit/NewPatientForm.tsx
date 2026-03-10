import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import {
    setActiveTab,
    initializeNewVisit,
    initializeExistingVisit,
    loadDraftIntoState
} from '../../../controllers/slices/patientVisitSlice';
import { BasicTab } from './BasicTab';
import { ClinicalTab } from './ClinicalTab';
import { DiagnosisTab } from './DiagnosisTab';
import { PrescriptionTab } from './PrescriptionTab';
import { FormFooter } from './FormFooter';
import { DraftService } from '../../../services/draftService';
import { Stethoscope, ClipboardList, Activity, FileText } from 'lucide-react';

const TABS = [
    { id: 0, label: 'Basic', icon: Stethoscope },
    { id: 1, label: 'Clinical', icon: Activity },
    { id: 2, label: 'Diagnosis', icon: ClipboardList },
    { id: 3, label: 'Prescription', icon: FileText },
];

// A valid local draft starts with 'draft_' or 'checkin_'.
// Server-side patient IDs (e.g., 'patient_abc123') must NOT be auto-saved locally.
const isLocalDraftId = (id: string | null | undefined): boolean => {
    if (!id) return false;
    return id.startsWith('draft_') || id.startsWith('checkin_');
};

export const NewPatientForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const patientVisitState = useAppSelector((state) => state.patientVisit);
    const { activeTab, isVisitLocked, patientId, draftId, basic } = patientVisitState;

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    /**
     * Guard flag: MUST be true before autosave fires.
     * Prevents blank drafts from being written while Redux hydrates.
     */
    const isInitialized = useRef(false);

    // =========================================================================
    // FIX A + B: INITIALIZATION & HYDRATION HOOK
    //
    // LocalStorage is the single authoritative source of truth for local drafts.
    // We NO LONGER dispatch initializeNewVisit() inside the /visit/new redirect
    // because that dispatch triggers the autosave with empty state (blank draft bug).
    // =========================================================================
    useEffect(() => {
        // Arm the guard — autosave is blocked while we load
        isInitialized.current = false;

        // SCENARIO 1: URL has a specific stable ID (e.g., draft_xxx or checkin_xxx)
        if (id && id !== 'new') {
            const savedDraft = DraftService.getDraft(id);

            if (savedDraft) {
                // Draft found in LocalStorage — hydrate Redux from it.
                // This handles: first Check-In, page refresh, and Resume button clicks.
                console.log('[Form] Hydrating from LocalStorage:', id, '| Patient:', savedDraft.patientData?.basic?.fullName || '(none)');
                dispatch(loadDraftIntoState(savedDraft));
            } else if (isLocalDraftId(id)) {
                // Local draft ID in URL but nothing saved yet — fresh new visit.
                // This happens when /visit/new redirected here and no draft exists.
                console.log('[Form] New local draft ID with no saved data. Initializing:', id);
                dispatch(initializeNewVisit(id));
            } else {
                // Server-side patient ID — fetch from AWS (future implementation)
                console.log('[Form] Server patient ID, loading fresh state for:', id);
                dispatch(initializeExistingVisit(id));
            }

            // Unblock autosave now that initialization is complete
            isInitialized.current = true;
        }
        // SCENARIO 2: Pure /visit/new URL
        // FIX A: Do NOT dispatch initializeNewVisit here — that dispatch was
        // triggering the autosave immediately with empty state (the blank draft bug).
        // Instead, just generate the ID and redirect. The re-run of this effect
        // with the new stable ID will handle initialization cleanly above.
        else {
            const newDraftId = DraftService.generateDraftId();
            console.log('[Form] /visit/new — redirecting to stable draft ID:', newDraftId);
            // ⚠️ NO dispatch here — redirect only
            navigate(`/visit/${newDraftId}`, { replace: true });
            // isInitialized stays false; the re-run handles it
        }

    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps


    // =========================================================================
    // FIX B + C: DEBOUNCED AUTOSAVE ENGINE
    //
    // Three guards prevent blank drafts:
    //   1. isInitialized.current — blocks saves until hydration is complete
    //   2. isLocalDraftId(currentId) — only saves local drafts, not server patients
    //   3. 5000ms delay — gives Redux state time to fully stabilize after hydration
    // =========================================================================
    useEffect(() => {
        // Guard 1: Block autosave if hydration isn't complete
        if (!isInitialized.current) return;

        // Guard 2: Never autosave server-side patient records
        const currentId = draftId || patientId;
        if (!isLocalDraftId(currentId)) return;

        if (isVisitLocked) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        // FIX C: 5000ms delay ensures Redux stabilizes before the first write
        timeoutRef.current = setTimeout(() => {
            if (!currentId) return;
            DraftService.saveDraft(currentId, {
                patientId: currentId,
                status: 'DRAFT',
                patientData: patientVisitState,
                lastUpdatedAt: Date.now(),
                savedSections: {
                    basic: !!basic.fullName,
                    clinical: false,
                    diagnosis: false,
                    prescription: false,
                }
            });
            console.log('[Form] Autosaved draft:', currentId, '| Patient:', basic.fullName || '(unnamed)');
        }, 5000);

        return () => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [patientVisitState, isVisitLocked, patientId, draftId]);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8 pb-32">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-type-heading">Patient Visit</h1>
                    <p className="text-type-body">Record clinical details and manage health records</p>
                </div>
                {isVisitLocked && (
                    <div className="bg-status-warning/10 text-status-warning px-4 py-2 rounded-full border border-status-warning font-semibold">
                        Visit Locked (Read-Only)
                    </div>
                )}
            </div>

            {/* Tabs Header */}
            <div className="flex border-b border-borderColor mb-6 overflow-x-auto">
                {TABS.map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => dispatch(setActiveTab(tab.id))}
                            className={`tab-button flex items-center gap-2 whitespace-nowrap ${isActive ? 'tab-button-active' : 'tab-button-inactive'}`}
                        >
                            <Icon size={18} />
                            {tab.label}
                        </button>
                    );
                })}
            </div>

            {/* Tab Content */}
            <div className="transition-all duration-300">
                {activeTab === 0 && <BasicTab />}
                {activeTab === 1 && <ClinicalTab />}
                {activeTab === 2 && <DiagnosisTab />}
                {activeTab === 3 && <PrescriptionTab />}
            </div>

            {/* Navigation Buttons */}
            <div className="mt-8 flex justify-end gap-4">
                {activeTab > 0 && (
                    <button
                        onClick={() => dispatch(setActiveTab(activeTab - 1))}
                        className="btn-secondary"
                    >
                        Previous
                    </button>
                )}
                {activeTab < 3 && (
                    <button
                        onClick={() => dispatch(setActiveTab(activeTab + 1))}
                        className="btn-primary"
                    >
                        Next Step
                    </button>
                )}
            </div>

            {/* Sticky Form Footer */}
            <FormFooter />
        </div>
    );
};
