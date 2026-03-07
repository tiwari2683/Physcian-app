import React from 'react';
import { useAppSelector } from '../../../controllers/hooks';
import { Card, Button } from '../../components/UI';
import { ShieldAlert, Printer, CheckCircle2 } from 'lucide-react';

export const PrescriptionTab: React.FC = () => {
    const { prescription, isVisitLocked } = useAppSelector((state) => state.patientVisit);

    return (
        <div className="space-y-6">
            <Card title="Prescription Summary">
                {prescription.medications.length === 0 ? (
                    <div className="text-center py-12 bg-gray-50 rounded-lg border border-dashed border-borderColor">
                        <p className="text-type-body">No medications added to this session.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {prescription.medications.map((med) => (
                            <div key={med.id} className="p-4 bg-white border border-borderColor rounded-lg shadow-tier-light">
                                <h4 className="font-bold text-type-contrast">{med.name}</h4>
                                <div className="flex gap-4 mt-2 text-sm text-type-body">
                                    <span>Dosage: {med.dosage}</span>
                                    <span>Freq: {med.frequency}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            <Card className="bg-primary-light/30 border-primary-base/20">
                <div className="flex flex-col items-center text-center p-4">
                    <ShieldAlert size={48} className="text-primary-base mb-4" />
                    <h3 className="text-xl font-bold text-type-heading mb-2">Assistant Role Restriction</h3>
                    <p className="text-type-body max-w-md mb-6">
                        As a Physician's Assistant, you can stage medications and clinical data.
                        However, finalizing visits and Prescription PDF generation is reserved for the primary doctor.
                    </p>

                    <div className="flex gap-4">
                        <Button
                            disabled={true}
                            className="flex gap-2 opacity-50 cursor-not-allowed bg-gray-400 text-white px-4 py-2 rounded-md"
                        >
                            <Printer size={18} /> Generate PDF (Disabled)
                        </Button>
                    </div>
                </div>
            </Card>

            {isVisitLocked && (
                <div className="flex items-center gap-3 p-4 bg-status-success/10 border border-status-success rounded-lg text-status-success">
                    <CheckCircle2 size={24} />
                    <div>
                        <p className="font-bold">This visit is finalized and locked.</p>
                        <p className="text-sm opacity-90">Records can no longer be modified to ensure patient safety and data integrity.</p>
                    </div>
                </div>
            )}
        </div>
    );
};
