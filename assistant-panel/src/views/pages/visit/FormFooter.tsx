import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import { sendToWaitingRoom } from '../../../controllers/apiThunks';
import { DraftService } from '../../../services/draftService';
import { Send } from 'lucide-react';

export const FormFooter: React.FC = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const patientData = useAppSelector((state) => state.patientVisit);
    const { isVisitLocked, patientId, draftId } = patientData;

    const [isSending, setIsSending] = useState(false);
    const currentId = patientId || draftId;

    const handleSendToDoctor = async () => {
        if (!currentId || isVisitLocked) return;

        setIsSending(true);
        try {
            // Aggregate payload and explicitly enforce the current ID
            const payload = {
                ...patientData,
                patientId: currentId,
            };

            const resultAction = await dispatch(sendToWaitingRoom(payload));
            if (sendToWaitingRoom.fulfilled.match(resultAction)) {
                // Destroy local draft to prevent staleness
                DraftService.deleteDraft(currentId);

                // Usually replaced by a robust toast, simple alert for placeholder
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

    // Do not render actions if visit is completed or read-only
    if (isVisitLocked) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-[#E5E7EB] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] p-4 z-40">
            <div className="max-w-6xl mx-auto flex justify-between items-center">
                <div className="text-sm text-[#6B7280]">
                    {currentId ? (
                        <span>Draft status: <span className="text-[#10B981] font-medium">Autosaving enabled...</span></span>
                    ) : (
                        <span>Start typing to initialize draft</span>
                    )}
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={handleSendToDoctor}
                        disabled={isSending || !currentId}
                        className="bg-[#2563EB] text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-[#1E40AF] transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {isSending ? (
                            <>
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
