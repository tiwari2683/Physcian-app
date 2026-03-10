import { useState, useEffect } from 'react';
import { useAppDispatch } from '../../../controllers/hooks';
import { createAppointment } from '../../../controllers/apiThunks';
import { Input, Button } from '../../components/UI';
import { X } from 'lucide-react';
import type { Appointment } from '../../../models';

interface Props {
    onClose: () => void;
    initialData?: Appointment | null;
}

export const NewAppointmentModal: React.FC<Props> = ({ onClose, initialData }) => {
    const dispatch = useAppDispatch();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState({
        patientName: '',
        age: '',
        mobile: '',
        sex: 'Male' as 'Male' | 'Female' | 'Other',
        address: '',
        type: 'Follow-up',
        date: '',
        time: ''
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                patientName: initialData.patientName || '',
                age: initialData.age?.toString() || '',
                mobile: initialData.mobile || '',
                sex: (initialData.sex as 'Male' | 'Female' | 'Other') || 'Male',
                address: initialData.address || '',
                type: initialData.type || 'Follow-up',
                date: initialData.date || '',
                time: initialData.time || ''
            });
        }
    }, [initialData]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await dispatch(createAppointment({
                ...(initialData?.id ? { id: initialData.id } : {}),
                patientName: formData.patientName,
                age: formData.age,
                mobile: formData.mobile,
                sex: formData.sex,
                address: formData.address,
                date: formData.date,
                time: formData.time,
                type: formData.type,
                status: initialData?.status || 'Upcoming'
            })).unwrap();

            onClose();
        } catch (error) {
            console.error('Failed to save appointment', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-6 border-b border-[#E5E7EB] bg-[#F9FAFB]">
                    <h2 className="text-xl font-bold text-[#1F2937]">
                        {initialData ? 'Edit Appointment' : 'New Appointment'}
                    </h2>
                    <button onClick={onClose} className="text-[#6B7280] hover:text-[#EF4444] transition-colors">
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto">
                    <form id="new-appointment-form" onSubmit={handleSubmit} className="space-y-5">

                        {/* ── Patient Details ── */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold tracking-wide text-[#6B7280] uppercase">Patient Details</h3>
                            <Input
                                label="Patient Full Name"
                                value={formData.patientName}
                                onChange={(e: any) => setFormData({ ...formData, patientName: e.target.value })}
                                placeholder="e.g. John Doe"
                                required
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Age"
                                    type="number"
                                    value={formData.age}
                                    onChange={(e: any) => setFormData({ ...formData, age: e.target.value })}
                                    placeholder="e.g. 35"
                                    required
                                />
                                <Input
                                    label="Mobile Number"
                                    type="tel"
                                    value={formData.mobile}
                                    onChange={(e: any) => setFormData({ ...formData, mobile: e.target.value })}
                                    placeholder="e.g. 9876543210"
                                    required
                                />
                            </div>

                            {/* Sex — Radio Group */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-[#374151]">Sex</label>
                                <div className="flex gap-6 mt-1">
                                    {(['Male', 'Female', 'Other'] as const).map((option) => (
                                        <label key={option} className="flex items-center gap-2 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="sex"
                                                value={option}
                                                checked={formData.sex === option}
                                                onChange={() => setFormData({ ...formData, sex: option })}
                                                className="w-4 h-4 text-[#2563EB] focus:ring-[#2563EB]"
                                            />
                                            <span className="text-sm text-[#374151]">{option}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            {/* Address */}
                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-[#374151]">Address</label>
                                <textarea
                                    value={formData.address}
                                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                    rows={2}
                                    placeholder="Patient's permanent address (optional)"
                                    className="px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:outline-none text-[#1F2937] resize-none"
                                />
                            </div>
                        </div>

                        {/* ── Visit Details ── */}
                        <div className="space-y-4">
                            <h3 className="text-sm font-bold tracking-wide text-[#6B7280] uppercase">Visit Details</h3>

                            <div className="flex flex-col gap-2">
                                <label className="text-sm font-bold text-[#374151]">Visit Type</label>
                                <select
                                    className="px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:outline-none text-[#1F2937] w-full"
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    required
                                >
                                    <option value="First Visit">First Visit</option>
                                    <option value="Follow-up">Follow-up</option>
                                    <option value="Emergency">Emergency</option>
                                    <option value="Check-up">Check-up</option>
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <Input
                                    label="Date"
                                    type="date"
                                    value={formData.date}
                                    onChange={(e: any) => setFormData({ ...formData, date: e.target.value })}
                                    required
                                />
                                <Input
                                    label="Time"
                                    type="time"
                                    value={formData.time}
                                    onChange={(e: any) => setFormData({ ...formData, time: e.target.value })}
                                    required
                                />
                            </div>
                        </div>
                    </form>
                </div>

                <div className="p-6 border-t border-[#E5E7EB] bg-[#F9FAFB] flex justify-end gap-3">
                    <Button variant="secondary" onClick={onClose} type="button">
                        Cancel
                    </Button>
                    <Button variant="primary" type="submit" form="new-appointment-form" loading={loading}>
                        {initialData ? 'Save Changes' : 'Schedule Appointment'}
                    </Button>
                </div>
            </div>
        </div>
    );
};
