import React, { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import {
    setActiveTab,
    clearVisitSession,
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

export const NewPatientForm: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const dispatch = useAppDispatch();
    const patientVisitState = useAppSelector((state) => state.patientVisit);
    const { activeTab, isVisitLocked, patientId, draftId } = patientVisitState;

    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    // Initialization & Hydration Hook
    useEffect(() => {
        if (id && id !== 'new') {
            const existingDraft = DraftService.getDraft(id);
            if (existingDraft) {
                console.log('Hydrating existing draft from local storage:', id);
                dispatch(loadDraftIntoState(existingDraft));
            } else {
                console.log('No draft found, preparing fresh state for existing patient:', id);
                dispatch(initializeExistingVisit(id));
                // TODO: Fetch existing patient from AWS here using `id`
            }
        } else {
            console.log('Initializing brand new visit');
            const newDraftId = DraftService.generateDraftId();

            // Re-use logic: We dispatch a payload to enforce the explicit ID so we can strictly redirect
            dispatch(initializeNewVisit(newDraftId)); // We let Redux overwrite, Redux handles factory

            // To prevent the "Orphaned Draft" issue on refresh, rewrite the URL immediately
            navigate(`/visit/${newDraftId}`, { replace: true });
        }

        // Cleanup Hook
        return () => {
            console.log('Unmounting NewPatientForm, cleaning up Redux state');
            dispatch(clearVisitSession());
        };
    }, [dispatch, id]);

    // Debounced Autosave Engine
    useEffect(() => {
        // Prevent saves if visit is totally completed or strict read-only
        if (isVisitLocked) return;

        const currentId = patientId || draftId;
        if (!currentId) return;

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            DraftService.saveDraft(currentId, {
                patientId: currentId,
                status: 'DRAFT',
                patientData: patientVisitState,
                lastUpdatedAt: Date.now(),
                savedSections: {
                    basic: true,
                    clinical: true,
                    diagnosis: true,
                    prescription: true
                }
            });
            console.log('Autosaved localized draft:', currentId);
        }, 2000);

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
                            className={`tab - button flex items - center gap - 2 whitespace - nowrap ${isActive ? 'tab-button-active' : 'tab-button-inactive'
                                } `}
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

            {/* Navigation Buttons for Form Flow */}
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

            {/* Sticky Autosave / Form Footer */}
            <FormFooter />
        </div>
    );
};
