import React from 'react';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import { setActiveTab } from '../../../controllers/slices/patientVisitSlice';
import { BasicTab } from './BasicTab';
import { ClinicalTab } from './ClinicalTab';
import { DiagnosisTab } from './DiagnosisTab';
import { PrescriptionTab } from './PrescriptionTab'; // Force TS Server refresh
import { Stethoscope, ClipboardList, Activity, FileText } from 'lucide-react';

const TABS = [
    { id: 0, label: 'Basic', icon: Stethoscope },
    { id: 1, label: 'Clinical', icon: Activity },
    { id: 2, label: 'Diagnosis', icon: ClipboardList },
    { id: 3, label: 'Prescription', icon: FileText },
];

export const NewPatientForm: React.FC = () => {
    const dispatch = useAppDispatch();
    const { activeTab, isVisitLocked } = useAppSelector((state) => state.patientVisit);

    return (
        <div className="max-w-6xl mx-auto px-4 py-8">
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
                            className={`tab-button flex items-center gap-2 whitespace-nowrap ${isActive ? 'tab-button-active' : 'tab-button-inactive'
                                }`}
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

            {/* Navigation Footer */}
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
        </div>
    );
};
