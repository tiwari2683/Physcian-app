import { useState, useEffect } from 'react';
import { useAppDispatch } from '../../../controllers/hooks';
import { createAppointment } from '../../../controllers/apiThunks';
import { Input, Button } from '../../components/UI';
import { X, Search, Loader2 } from 'lucide-react';
import type { Appointment } from '../../../models';
import { PatientService } from '../../../services/patientService';

interface Props {
    onClose: () => void;
    initialData?: Appointment | null;
}

export const NewAppointmentModal: React.FC<Props> = ({ onClose, initialData }) => {
    const dispatch = useAppDispatch();
    const [loading, setLoading] = useState(false);
    
    // Existing vs New Mode
    const [mode, setMode] = useState<'existing' | 'new'>('existing');
    
    // Search State
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

    const emptyForm = {
        patientName: '',
        age: '',
        mobile: '',
        sex: 'Male' as 'Male' | 'Female' | 'Other',
        address: '',
        type: 'Follow-up',
        date: '',
        time: ''
    };

    const [formData, setFormData] = useState(emptyForm);

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
            // If editing an existing appointment, we should lock to the associated patient if present
            if (initialData.patientId) {
                setSelectedPatientId(initialData.patientId);
                setMode('existing');
            } else {
                setMode('new');
            }
        }
    }, [initialData]);

    // Search Debounce Effect
    useEffect(() => {
        if (mode !== 'existing' || searchQuery.trim().length < 3) {
            setSearchResults([]);
            return;
        }
        
        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                const results = await PatientService.searchPatients(searchQuery);
                setSearchResults(results);
            } catch (e) {
                console.error("Search failed", e);
            } finally {
                setIsSearching(false);
            }
        }, 300);
        
        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery, mode]);

    const handleSelectPatient = (patient: any) => {
        setSelectedPatientId(patient.patientId);
        setFormData(prev => ({
            ...prev,
            patientName: patient.name || '',
            age: patient.age ? patient.age.toString() : '',
            mobile: patient.mobile || '',
            sex: (patient.sex as 'Male' | 'Female' | 'Other') || 'Male',
            address: patient.address || ''
        }));
        setSearchQuery('');
        setSearchResults([]);
    };

    const handleChangeMode = (newMode: 'existing' | 'new') => {
        setMode(newMode);
        setSelectedPatientId(null);
        setSearchQuery('');
        setSearchResults([]);
        setFormData(prev => ({
            ...emptyForm,
            type: prev.type,
            date: prev.date,
            time: prev.time
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            await dispatch(createAppointment({
                ...(initialData?.id ? { id: initialData.id } : {}),
                patientId: selectedPatientId || undefined, // Includes bounded patientId
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
                    <form id="new-appointment-form" onSubmit={handleSubmit} className="space-y-6">

                        {/* Toggle Mode */}
                        {!initialData && (
                            <div className="flex bg-[#F1F5F9] rounded-lg p-1">
                                <button
                                    type="button"
                                    onClick={() => handleChangeMode('existing')}
                                    className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'existing' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#64748B] hover:text-[#334155]'}`}
                                >
                                    Existing Patient
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleChangeMode('new')}
                                    className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'new' ? 'bg-white text-[#2563EB] shadow-sm' : 'text-[#64748B] hover:text-[#334155]'}`}
                                >
                                    New Patient
                                </button>
                            </div>
                        )}

                        {/* Search Section for Existing Patient */}
                        {mode === 'existing' && !selectedPatientId && (
                            <div className="relative space-y-2">
                                <label className="text-sm font-bold text-[#374151]">Search Patient</label>
                                <div className="relative">
                                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
                                    <input
                                        type="text"
                                        placeholder="Search by name or phone..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className="w-full pl-10 pr-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:outline-none text-[#1F2937]"
                                    />
                                    {isSearching && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] animate-spin" size={18} />
                                    )}
                                </div>

                                {searchResults.length > 0 && (
                                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#E5E7EB] shadow-lg rounded-lg z-10 max-h-60 overflow-y-auto">
                                        {searchResults.map(patient => (
                                            <button
                                                key={patient.patientId}
                                                type="button"
                                                onClick={() => handleSelectPatient(patient)}
                                                className="w-full text-left px-4 py-3 hover:bg-[#F3F4F6] border-b border-[#F3F4F6] last:border-0 transition-colors"
                                            >
                                                <div className="font-semibold text-[#1F2937]">{patient.name}</div>
                                                <div className="text-xs text-[#6B7280] mt-1 space-x-2">
                                                    <span>{patient.mobile || "No phone"}</span>
                                                    <span>•</span>
                                                    <span>{patient.age} yrs</span>
                                                    <span>•</span>
                                                    <span>{patient.sex}</span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Selected Patient Banner */}
                        {mode === 'existing' && selectedPatientId && !initialData && (
                            <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg p-4 flex justify-between items-center">
                                <div>
                                    <div className="text-xs font-semibold text-[#1D4ED8] uppercase tracking-wider mb-1">Selected Patient</div>
                                    <div className="text-[#1E3A8A] font-medium">{formData.patientName}</div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => { setSelectedPatientId(null); setFormData(prev => ({ ...emptyForm, type: prev.type, date: prev.date, time: prev.time })); }}
                                    className="text-sm font-semibold text-[#2563EB] hover:text-[#1D4ED8]"
                                >
                                    Change
                                </button>
                            </div>
                        )}

                        {/* ── Patient Details ── */}
                        {(mode === 'new' || selectedPatientId) && (
                            <div className="space-y-4">
                                <h3 className="text-sm font-bold tracking-wide text-[#6B7280] uppercase">Patient Details</h3>
                                <Input
                                    label="Patient Full Name"
                                    value={formData.patientName}
                                    onChange={(e: any) => setFormData({ ...formData, patientName: e.target.value })}
                                    placeholder="e.g. John Doe"
                                    required
                                    disabled={mode === 'existing'}
                                />
                                <div className="grid grid-cols-2 gap-4">
                                    <Input
                                        label="Age"
                                        type="number"
                                        value={formData.age}
                                        onChange={(e: any) => setFormData({ ...formData, age: e.target.value })}
                                        placeholder="e.g. 35"
                                        required
                                        disabled={mode === 'existing'}
                                    />
                                    <Input
                                        label="Mobile Number"
                                        type="tel"
                                        value={formData.mobile}
                                        onChange={(e: any) => setFormData({ ...formData, mobile: e.target.value })}
                                        placeholder="e.g. 9876543210"
                                        required
                                        disabled={mode === 'existing'}
                                    />
                                </div>

                                {/* Sex — Radio Group */}
                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-[#374151]">Sex</label>
                                    <div className="flex gap-6 mt-1">
                                        {(['Male', 'Female', 'Other'] as const).map((option) => (
                                            <label key={option} className={`flex items-center gap-2 ${mode === 'existing' ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}>
                                                <input
                                                    type="radio"
                                                    name="sex"
                                                    value={option}
                                                    checked={formData.sex === option}
                                                    onChange={() => setFormData({ ...formData, sex: option })}
                                                    className="w-4 h-4 text-[#2563EB] focus:ring-[#2563EB]"
                                                    disabled={mode === 'existing'}
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
                                        disabled={mode === 'existing'}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── Visit Details ── */}
                        {(mode === 'new' || selectedPatientId) && (
                            <div className="space-y-4 pt-2">
                                <h3 className="text-sm font-bold tracking-wide text-[#6B7280] uppercase border-t border-[#E5E7EB] pt-4">Visit Details</h3>

                                <div className="flex flex-col gap-2">
                                    <label className="text-sm font-bold text-[#374151]">Visit Type</label>
                                    <select
                                        className="px-4 py-3 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:outline-none text-[#1F2937] w-full cursor-pointer"
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
                        )}
                    </form>
                </div>

                <div className="p-6 border-t border-[#E5E7EB] bg-[#F9FAFB] flex justify-end gap-3 shrink-0">
                    <Button variant="secondary" onClick={onClose} type="button">
                        Cancel
                    </Button>
                    <Button 
                        variant="primary" 
                        type="submit" 
                        form="new-appointment-form" 
                        loading={loading}
                        disabled={mode === 'existing' && !selectedPatientId}
                    >
                        {initialData ? 'Save Changes' : 'Schedule Appointment'}
                    </Button>
                </div>
            </div>
        </div>
    );
};
