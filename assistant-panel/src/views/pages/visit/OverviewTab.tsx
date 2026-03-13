import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector, useAppDispatch } from '../../../controllers/hooks';
import { Card, Button } from '../../components/UI';
import { ShieldAlert, Activity, ClipboardList, Send, Loader2 } from 'lucide-react';
import { sendToWaitingRoom, autoSaveDraftToCloud } from '../../../controllers/apiThunks';
import { setIsSubmitting } from '../../../controllers/slices/patientVisitSlice';
import { DraftService } from '../../../services/draftService';
import { UploadService } from '../../../services/uploadService';
import { usePendingFiles } from '../../../contexts/PendingFilesContext';

export const OverviewTab: React.FC = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const patientVisitState = useAppSelector((state) => state.patientVisit);

    const {
        basic,
        clinical,
        diagnosis,
        isVisitLocked,
        patientId,
        draftId,
        cloudPatientId
    } = patientVisitState;

    const { pendingFiles, clearPendingFiles } = usePendingFiles();

    const isLocalId = (id: string | null) => id?.startsWith('draft_') || id?.startsWith('checkin_');
    const effectiveId = (!isLocalId(patientId) ? patientId : cloudPatientId) || null;

    const [isSending, setIsSending] = useState(false);

    // Filter populated vitals only
    const populatedVitals = Object.entries(clinical.vitals).filter(([_, val]) => val !== undefined && val !== '');

    const handleSendToDoctor = async () => {
        if (!basic.fullName) {
            alert('Patient name is required before sending.');
            return;
        }

        setIsSending(true);
        dispatch(setIsSubmitting(true));

        try {
            // 0. Ensure Cloud Record exists before uploading files
            let resolvedId = effectiveId;
            if (!resolvedId && Object.keys(pendingFiles).length > 0) {
                console.log('🔄 No Cloud ID found for pending files. Forcing immediate sync...');
                const syncResult = await dispatch(autoSaveDraftToCloud()).unwrap();
                resolvedId = syncResult.cloudPatientId;
                if (!resolvedId) throw new Error("Could not create cloud record. Please check your connection.");
            }

            // 1. Upload Pending Files sequentially (to avoid overwhelming network/lambda)
            const finalizedReports = [...clinical.reports];
            for (let i = 0; i < finalizedReports.length; i++) {
                const report = finalizedReports[i];
                if (report.isPending && report.fileId && pendingFiles[report.fileId]) {
                    const physicalFile = pendingFiles[report.fileId];
                    if (!resolvedId) throw new Error("Missing Patient ID for upload.");

                    const result = await UploadService.performCompleteUpload(resolvedId, physicalFile, report.category || 'Report');
                    
                    // Update report with S3 permanent data, remove pending flags
                    finalizedReports[i] = {
                        ...report,
                        s3Key: result.s3Key,
                        isPending: false,
                        fileId: undefined,
                        fileUrl: undefined // Remove local blob URL to prevent memory leaks over time
                    };
                }
            }

            // 2. Build Payload
            const payload: any = {
                name: basic.fullName,
                age: basic.age ? Number(basic.age) : 0,
                sex: basic.sex,
                mobile: basic.mobileNumber,
                address: basic.address,

                medicalHistory: clinical.historyText,
                clinicalParameters: clinical.vitals,
                reportFiles: finalizedReports,

                diagnosis: diagnosis.diagnosisText,
                advisedInvestigations: JSON.stringify([
                    ...diagnosis.selectedInvestigations,
                    ...(diagnosis.customInvestigations ? [diagnosis.customInvestigations] : [])
                ]),

                status: 'WAITING',
                treatment: 'WAITING',
                medications: [],

                // Required so backend updates the existing DRAFT row instead of creating a duplicate DRAFT vs WAITING row
                cloudPatientId: resolvedId || cloudPatientId || undefined
            };

            // 3. Send to Waiting Room
            await dispatch(sendToWaitingRoom(payload)).unwrap();
            
            // Clear pending files context on success
            clearPendingFiles();

            // Visit submitted successfully — clear the local draft
            if (draftId) {
                DraftService.deleteDraft(draftId);
            } else if (patientId && isLocalId(patientId)) {
                DraftService.deleteDraft(patientId);
            }

            // Return to Dashboard
            navigate('/');
        } catch (error: any) {
            console.error('Error sending to Doctor or Uploading files:', error);
            const msg = error.message || error || 'An unexpected error occurred.';
            alert(`Submission Failed: ${msg}`);
            
            // Unlock UI so the user can try again, WITHOUT losing their local draft data
            dispatch(setIsSubmitting(false));
            setIsSending(false);
        }
    };

    return (
        <div className="space-y-6">

            {/* ── 1. Demographics Summary ────────────────────────────────── */}
            <Card title="Patient Demographics" className="border-t-4 border-t-blue-500">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <p className="text-xs text-type-body uppercase tracking-wider mb-1">Full Name</p>
                        <p className="font-semibold text-type-contrast">{basic.fullName || <span className="text-gray-400 italic">Not provided</span>}</p>
                    </div>
                    <div>
                        <p className="text-xs text-type-body uppercase tracking-wider mb-1">Age / Sex</p>
                        <p className="font-semibold text-type-contrast">
                            {basic.age || '?'} yrs / {basic.sex || '?'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs text-type-body uppercase tracking-wider mb-1">Mobile</p>
                        <p className="font-semibold text-type-contrast">{basic.mobileNumber || <span className="text-gray-400 italic">—</span>}</p>
                    </div>
                    <div>
                        <p className="text-xs text-type-body uppercase tracking-wider mb-1">Address</p>
                        <p className="font-semibold text-type-contrast">{basic.address || <span className="text-gray-400 italic">—</span>}</p>
                    </div>
                </div>
            </Card>

            {/* ── 2. Clinical Vitals ───────────────────────────────────── */}
            <Card title="Clinical Vitals" className="border-t-4 border-t-emerald-500">
                <div className="flex items-start gap-4">
                    <Activity className="text-emerald-500 mt-1" size={20} />
                    <div className="w-full">
                        {populatedVitals.length === 0 ? (
                            <p className="text-type-body text-sm italic">No vitals recorded.</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
                                {populatedVitals.map(([key, value]) => (
                                    <div key={key} className="bg-white p-2 rounded shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center">
                                        <span className="text-xs text-gray-500 font-medium mb-1 uppercase bg-gray-100 px-2 py-0.5 rounded-full">{key}</span>
                                        <span className="font-bold text-gray-800">{value as string}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {clinical.historyText && (
                            <div className="mt-4 pt-4 border-t border-gray-100">
                                <p className="text-xs text-type-body uppercase tracking-wider mb-2">History & Symptoms</p>
                                <div className="bg-white p-3 rounded border border-gray-100 text-sm whitespace-pre-wrap font-mono text-gray-700">
                                    {clinical.historyText}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* ── 3. Diagnosis & Investigations ───────────────────────────── */}
            <Card title="Diagnosis Summary" className="border-t-4 border-t-purple-500">
                <div className="flex items-start gap-4">
                    <ClipboardList className="text-purple-500 mt-1" size={20} />
                    <div className="w-full space-y-4">
                        <div>
                            <p className="text-xs text-type-body uppercase tracking-wider mb-1">Provisional Diagnosis</p>
                            {diagnosis.diagnosisText ? (
                                <p className="text-sm font-medium text-gray-800">{diagnosis.diagnosisText}</p>
                            ) : (
                                <p className="text-sm italic text-gray-400">None recorded.</p>
                            )}
                        </div>

                        {(diagnosis.selectedInvestigations.length > 0 || diagnosis.customInvestigations) && (
                            <div>
                                <p className="text-xs text-type-body uppercase tracking-wider mb-1">Advised Investigations</p>
                                <div className="flex flex-wrap gap-2">
                                    {diagnosis.selectedInvestigations.map(inv => (
                                        <span key={inv} className="bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-purple-100">
                                            {inv}
                                        </span>
                                    ))}
                                    {diagnosis.customInvestigations && (
                                        <span className="bg-purple-50 text-purple-700 text-xs font-semibold px-2.5 py-1 rounded-full border border-purple-100">
                                            {diagnosis.customInvestigations}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Card>

            {/* ── Assistant Role Notice ─────────────────────────────────── */}
            <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 flex gap-3 text-sm text-blue-800">
                <ShieldAlert size={20} className="text-blue-500 shrink-0" />
                <p>
                    <strong>Assistant Role:</strong> You have staged the patient records.
                    Finalizing visits and generating the Prescription PDF is reserved for the primary doctor.
                </p>
            </div>

            {/* ── FINAL SUBMISSION ACTION ───────────────────────────────── */}
            <div className="pt-4 border-t border-gray-200 flex justify-end">
                {isVisitLocked ? (
                    <div className="px-6 py-3 bg-gray-100 text-gray-500 font-bold rounded-lg border border-gray-200">
                        Visit Locked — Already Submitted
                    </div>
                ) : (
                    <Button
                        variant="primary"
                        onClick={handleSendToDoctor}
                        disabled={isSending || !basic.fullName}
                        className="w-full md:w-auto min-w-[200px] flex justify-center items-center gap-2 py-3 shadow-lg shadow-blue-500/20"
                    >
                        {isSending ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                {basic.fullName ? `Send ${basic.fullName} to Doctor` : 'Missing Patient Name'}
                            </>
                        )}
                    </Button>
                )}
            </div>

        </div>
    );
};
