import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import {
    setActiveTab,
    initializeNewVisit,
    initializeExistingVisit,
    loadDraftIntoState,
    setSaveStatus,
    setCloudPatientId,
} from '../../../controllers/slices/patientVisitSlice';
import { autoSaveDraftToCloud, initiateVisitThunk, fetchPatientDataThunk } from '../../../controllers/apiThunks';
import { BasicTab } from './BasicTab';
import { ClinicalTab } from './ClinicalTab';
import { DiagnosisTab } from './DiagnosisTab';
import { OverviewTab } from './OverviewTab';
import { DraftService } from '../../../services/draftService';
import { HistoryDrawer } from './components/HistoryDrawer';
import { Stethoscope, ClipboardList, Activity, FileText, CheckCircle2, Clock, AlertCircle } from 'lucide-react';

const TABS = [
    { id: 0, label: 'Basic', icon: Stethoscope },
    { id: 1, label: 'Clinical', icon: Activity },
    { id: 2, label: 'Diagnosis', icon: ClipboardList },
    { id: 3, label: 'Overview', icon: FileText },
];

/** Only local draft IDs (draft_xxx or checkin_xxx) should be autosaved locally. */
const isLocalDraftId = (id: string | null | undefined): boolean => {
    if (!id) return false;
    return id.startsWith('draft_') || id.startsWith('checkin_');
};

export const NewPatientForm: React.FC = () => {
    const { patientId: id } = useParams<{ patientId: string }>();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const patientVisitState = useAppSelector((state) => state.patientVisit);
    const { activeTab, isVisitLocked, visitId, patientId, draftId, cloudPatientId, basic, saveStatus, isHistoryDrawerOpen, isSubmitting } = patientVisitState;

    // Helper for Save Status UI
    const getSaveStatusDisplay = () => {
        if (isVisitLocked) return null;

        switch (saveStatus) {
            case 'saving':
                return (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-[#6B7280]">
                        <Clock size={16} className="animate-spin text-[#9CA3AF]" />
                        <span>Saving...</span>
                    </div>
                );
            case 'saved':
                return (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-[#10B981] bg-[#ECFDF5] px-2.5 py-1 rounded-full border border-[#D1FAE5]">
                        <CheckCircle2 size={16} />
                        <span>Saved ✓</span>
                    </div>
                );
            case 'error':
                return (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-[#EF4444] bg-[#FEF2F2] px-2 py-1 rounded-full border border-[#FEE2E2]">
                        <AlertCircle size={16} />
                        <span>Cloud save failed</span>
                    </div>
                );
            default:
                // Idle state — imply local save is ready
                return (
                    <div className="flex items-center gap-1.5 text-sm font-medium text-[#9CA3AF]">
                        <CheckCircle2 size={16} />
                        <span>Draft ready</span>
                    </div>
                );
        }
    };

    // Guard flag: prevents both autosave effects from firing during hydration
    const isInitialized = useRef(false);
    const localSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const cloudSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

    /**
     * A ref that always holds the LATEST Redux state.
     * Used in the flush-save cleanup so it reads current data even inside a
     * `useEffect(..., [])` closure that would otherwise capture stale values.
     */
    const patientVisitStateRef = useRef(patientVisitState);
    useEffect(() => {
        patientVisitStateRef.current = patientVisitState;
    });

    // =========================================================================
    // INITIALIZATION & HYDRATION HOOK
    //
    // 3-Step Priority Order:
    //   Step A: Redux already has matching data → skip any reload (fastest path).
    //           This is the key fix for navigation: when user goes Dashboard →
    //           /visit/:id, Redux still has the draft in memory — no reload needed.
    //   Step B: Redux is empty/stale → load from LocalStorage (page refresh path).
    //   Step C: Nothing saved → initialize fresh blank form.
    // =========================================================================
    useEffect(() => {
        isInitialized.current = false;

        if (id && id !== 'new') {
            // ── STEP A: Redux fast-path ──────────────────────────────────────
            // If Redux already has the right draft loaded (e.g., user navigated
            // away to Dashboard and came back), there is NO need to reload.
            // Reloading would overwrite any unsaved changes still in Redux!
            if (draftId === id || patientId === id) {
                console.log('[Form] Step A: Redux already has draft', id, '— skipping reload');
                isInitialized.current = true;
                return;
            }

            // ── STEP B: LocalStorage path (page refresh or first mount) ──────
            const savedDraft = DraftService.getDraft(id);
            if (savedDraft) {
                console.log('[Form] Step B: Loading from LocalStorage:', id, '| Patient:', savedDraft.patientData?.basic?.fullName || '(none)');
                dispatch(loadDraftIntoState(savedDraft));
            } else if (isLocalDraftId(id)) {
                // ── STEP C: New local draft with no saved data ───────────────
                console.log('[Form] Step C: New local draft — initializing blank form:', id);
                dispatch(initializeNewVisit(id));
            } else { // This means `id` is NOT a local draft ID, so it's an existing server patient ID
                console.log('[Form] Existing server patient detected — loading master record:', id);
                dispatch(initializeExistingVisit(id));
                dispatch(fetchPatientDataThunk(id));
            }

            isInitialized.current = true;
        } else {
            // /visit/new → generate stable ID and redirect (no dispatch = no blank draft)
            const newDraftId = DraftService.generateDraftId();
            console.log('[Form] /visit/new — redirecting to:', newDraftId);
            navigate(`/visit/${newDraftId}`, { replace: true });
        }

    }, [id, draftId, patientId]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const isExistingServerPatient = patientId && !isLocalDraftId(patientId);
        const hasDemographics = !!basic.fullName;

        if (isInitialized.current && patientId && !visitId && !isVisitLocked) {
            // For existing server patients, wait for fetchPatientDataThunk to hydrate demographics
            if (isExistingServerPatient && !hasDemographics) {
                console.log('[Form] Waiting for demographics before initiating visit...');
                return;
            }

            console.log('[Form] Initiating visit for:', basic.fullName || 'New Patient');
            dispatch(initiateVisitThunk({
                patientId,
                name: basic.fullName,
                age: basic.age,
                sex: basic.sex,
                mobile: basic.mobileNumber,
                address: basic.address
            }));
        }
    }, [isInitialized.current, patientId, visitId, basic.fullName]); // eslint-disable-line react-hooks/exhaustive-deps


    // =========================================================================
    // FLUSH-SAVE ON UNMOUNT (Navigation Guard)
    //
    // THE KEY FIX: When the user navigates away (component unmounts), the 2s
    // autosave timer is cancelled by React. This effect runs its CLEANUP when
    // the component unmounts and immediately writes the current Redux state to
    // localStorage — so no data is lost between the last keystroke and navigation.
    // =========================================================================
    useEffect(() => {
        return () => {
            // This code runs ONLY on unmount (navigation away)
            const snapshot = patientVisitStateRef.current;
            const currentId = snapshot.draftId || snapshot.patientId;
            if (!currentId || !isLocalDraftId(currentId) || snapshot.isVisitLocked || snapshot.isSubmitting) return;

            console.log('[Form] Flush-save on unmount for:', currentId);
            DraftService.saveDraft(currentId, {
                patientId: currentId,
                cloudPatientId: snapshot.cloudPatientId ?? undefined,
                status: 'DRAFT',
                patientData: snapshot,
                lastUpdatedAt: Date.now(),
                savedSections: {
                    basic: !!snapshot.basic?.fullName,
                    clinical: false,
                    diagnosis: false,
                    prescription: false,
                }
            });
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps


    // =========================================================================
    // LAYER 2: LOCAL AUTOSAVE (2 000ms debounce → localStorage)
    //
    // Fast, free, synchronous. Survives Ctrl+R page refresh.
    // Guard: only fires after hydration; only for local draft IDs.
    // =========================================================================
    useEffect(() => {
        if (!isInitialized.current) return;
        const currentId = draftId || patientId;
        if (!isLocalDraftId(currentId)) return;
        if (isVisitLocked) return;
        if (isSubmitting) return;

        if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current);

        localSaveTimerRef.current = setTimeout(() => {
            if (!currentId) return;
            DraftService.saveDraft(currentId, {
                patientId: currentId,
                cloudPatientId: cloudPatientId ?? undefined,
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
            console.log('[Layer 2] Local draft saved:', currentId, '| Patient:', basic.fullName || '(none)');
        }, 2000);

        return () => { if (localSaveTimerRef.current) clearTimeout(localSaveTimerRef.current); };
    }, [patientVisitState, isVisitLocked, patientId, draftId, isSubmitting]); // eslint-disable-line react-hooks/exhaustive-deps


    // =========================================================================
    // LAYER 3: CLOUD AUTOSAVE (8 000ms debounce → DynamoDB via PATIENT_DATA API)
    //
    // Saves with status:'DRAFT' so it never enters the live Waiting Room queue.
    // First call creates a DynamoDB record; subsequent calls UPDATE it via cloudPatientId.
    // Guard: only fires if patient has entered their full name (meaningful data).
    // =========================================================================
    useEffect(() => {
        if (!isInitialized.current) return;
        const currentId = draftId || patientId;
        if (!isLocalDraftId(currentId)) return;
        if (isVisitLocked) return;
        if (!basic.fullName) return; // Don't cloud-save empty drafts
        if (isSubmitting) return;

        if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);

        // Show "Saving..." indicator while debounce is pending
        dispatch(setSaveStatus('saving'));

        cloudSaveTimerRef.current = setTimeout(async () => {
            const result = await dispatch(autoSaveDraftToCloud());

            if (autoSaveDraftToCloud.fulfilled.match(result)) {
                const { cloudPatientId: newCloudId } = result.payload;

                // Persist the cloud ID back to localStorage so refresh also has it
                if (newCloudId && newCloudId !== cloudPatientId) {
                    dispatch(setCloudPatientId(newCloudId));
                    const savedDraft = DraftService.getDraft(currentId!);
                    if (savedDraft) {
                        DraftService.saveDraft(currentId!, { ...savedDraft, cloudPatientId: newCloudId });
                    }
                }
                dispatch(setSaveStatus('saved'));
            } else {
                dispatch(setSaveStatus('error'));
            }
        }, 3000);

        return () => { if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current); };
    }, [patientVisitState, isVisitLocked, patientId, draftId, isSubmitting]); // eslint-disable-line react-hooks/exhaustive-deps


    return (
        <div className="flex w-full h-screen overflow-hidden bg-appBg">
            {/* Main Content Area */}
            <div className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${isHistoryDrawerOpen ? 'mr-0 md:mr-0 lg:pr-[448px]' : 'mr-0'}`}>
                <div className="max-w-6xl mx-auto px-4 py-8">
                    {/* Header */}
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-type-heading">
                                {activeTab === 3 ? 'Final Overview' : 'Patient Visit'}
                            </h1>
                            <p className="text-type-body">Record clinical details and manage health records</p>
                        </div>
                        <div className="flex items-center gap-4">
                            {getSaveStatusDisplay()}

                            {isVisitLocked && (
                                <div className="bg-status-warning/10 text-status-warning px-4 py-2 rounded-full border border-status-warning font-semibold">
                                    Visit Locked (Read-Only)
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Tabs Header */}
                    <div className="flex border-b border-borderColor mb-6 overflow-x-auto">
                        {TABS.map((tab) => {
                            const Icon = tab.icon;
                            const isActive = activeTab === tab.id;
                            const isClinicalTab = tab.id === 1 || tab.id === 2;
                            const isBlocked = isClinicalTab && !visitId && !isVisitLocked;

                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => !isBlocked && dispatch(setActiveTab(tab.id))}
                                    disabled={isBlocked}
                                    title={isBlocked ? "Please fill Basic details to initiate visit" : ""}
                                    className={`tab-button flex items-center gap-2 whitespace-nowrap ${isActive ? 'tab-button-active' : 'tab-button-inactive'} ${isBlocked ? 'opacity-50 cursor-not-allowed grayscale' : ''}`}
                                >
                                    <Icon size={18} />
                                    {tab.label}
                                    {isBlocked && <Clock size={12} className="animate-pulse" />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Tab Content */}
                    <div className="transition-all duration-300">
                        {activeTab === 0 && <BasicTab />}
                        {activeTab === 1 && <ClinicalTab />}
                        {activeTab === 2 && <DiagnosisTab />}
                        {activeTab === 3 && <OverviewTab />}
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
                                onClick={() => {
                                    if (activeTab === 0 && basic.fullName && !isVisitLocked && !isSubmitting) {
                                        dispatch(autoSaveDraftToCloud());
                                    }
                                    dispatch(setActiveTab(activeTab + 1));
                                }}
                                className="btn-primary"
                            >
                                Next Step
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* History Drawer */}
            {isHistoryDrawerOpen && <HistoryDrawer />}
        </div>
    );
};
