import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import { sendToWaitingRoom } from '../../../controllers/apiThunks';
import { DraftService } from '../../../services/draftService';
import { Send, Cloud, CloudOff, Loader2, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

// ── Save Status Indicator Config ─────────────────────────────────────────────
const STATUS_CONFIG = {
    idle: {
        icon: null,
        text: 'Draft ready',
        className: 'text-[#6B7280]',
    },
    saving: {
        icon: <Loader2 size={14} className="animate-spin text-[#F59E0B]" />,
        text: 'Saving to cloud...',
        className: 'text-[#F59E0B] font-medium',
    },
    saved: {
        icon: <CheckCircle2 size={14} className="text-[#10B981]" />,
        text: 'Saved ✓',
        className: 'text-[#10B981] font-medium',
    },
    error: {
        icon: <CloudOff size={14} className="text-[#EF4444]" />,
        text: 'Cloud save failed — stored locally',
        className: 'text-[#EF4444] font-medium',
    },
} as const;

export const FormFooter: React.FC = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const patientData = useAppSelector((state) => state.patientVisit);
    const { isVisitLocked, patientId, draftId, saveStatus, lastSavedAt } = patientData;

    const [isSending, setIsSending] = useState(false);
    const currentId = patientId || draftId;

    const handleSendToDoctor = async () => {
        if (!currentId || isVisitLocked) return;

        setIsSending(true);
        try {
            const payload = { ...patientData, patientId: currentId };
            const resultAction = await dispatch(sendToWaitingRoom(payload));

            if (sendToWaitingRoom.fulfilled.match(resultAction)) {
                // Clean up local draft — the patient is now in the live queue
                DraftService.deleteDraft(currentId);
                alert("Sent to Waiting Room successfully!");
                navigate('/');
            } else {
                alert("Failed to send to Waiting Room.");
                setIsSending(false);
            }
        } catch (error) {
            console.error("Error sending to waiting room", error);
            setIsSending(false);
        }
    };

    if (isVisitLocked) return null;

    const config = STATUS_CONFIG[saveStatus] ?? STATUS_CONFIG.idle;

    // Human-readable timestamp for "Saved ✓" state
    const savedTimeLabel = saveStatus === 'saved' && lastSavedAt
        ? `  ·  ${new Date(lastSavedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        : '';

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 z-40">
            <div className="max-w-6xl mx-auto flex justify-between items-center">

                {/* ── Google-Forms-style Save Status Indicator ─────────────── */}
                <div className="flex items-center gap-2 text-sm">
                    {currentId ? (
                        <>
                            {/* Layer 2: always show local save is active */}
                            <Cloud size={14} className="text-[#10B981]" />
                            <span className="text-[#6B7280]">
                                Local draft active
                                <span className="mx-1 text-[#D1D5DB]">·</span>
                            </span>
                            {/* Layer 3: live cloud status */}
                            <span className={`flex items-center gap-1 ${config.className}`}>
                                {config.icon}
                                {config.text}{savedTimeLabel}
                            </span>
                        </>
                    ) : (
                        <span className="text-[#9CA3AF]">Start typing to initialize draft</span>
                    )}
                </div>

                {/* ── Send to Doctor Button ─────────────────────────────────── */}
                <div className="flex gap-4">
                    <button
                        onClick={handleSendToDoctor}
                        disabled={isSending || !currentId}
                        className="bg-[#2563EB] text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-[#1E40AF] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSending ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Sending...
                            </>
                        ) : (
                            <>
                                <Send size={18} />
                                Send to Doctor
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
