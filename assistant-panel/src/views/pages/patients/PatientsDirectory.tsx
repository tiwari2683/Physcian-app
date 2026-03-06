import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import { fetchPatients } from '../../../controllers/apiThunks';
import { PatientProfileModal } from './PatientProfileModal';
import { Search, Activity, Upload, Eye, FileText } from 'lucide-react';
import type { Patient } from '../../../models';

type SortOption = 'Newest First' | 'Oldest First' | 'Name (A-Z)';
type FilterOption = 'All' | 'Male' | 'Female' | 'Critical';

const PatientsDirectory = () => {
    const dispatch = useAppDispatch();
    const navigate = useNavigate();
    const { patients, isLoading } = useAppSelector(state => state.patients);

    const [searchQuery, setSearchQuery] = useState('');
    const [activeFilter, setActiveFilter] = useState<FilterOption>('All');
    const [sortOption, setSortOption] = useState<SortOption>('Newest First');

    // Modal State
    const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

    useEffect(() => {
        dispatch(fetchPatients());
    }, [dispatch]);

    // Format helpers
    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || '?';
    };

    const formatDate = (dateString?: string) => {
        if (!dateString) return 'Unknown Date';
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return dateString; // fallback if unparseable
        return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    // Filter and Sort Logic (Memoized for performance)
    const processedPatients = useMemo(() => {
        let result = [...patients];

        // 1. Search Filter (matches name, patientId, diagnosis)
        if (searchQuery.trim() !== '') {
            const query = searchQuery.toLowerCase();
            result = result.filter(p =>
                (p.name && p.name.toLowerCase().includes(query)) ||
                (p.patientId && p.patientId.toLowerCase().includes(query)) ||
                (p.diagnosis && p.diagnosis.toLowerCase().includes(query))
            );
        }

        // 2. Tab Filter
        switch (activeFilter) {
            case 'Male':
            case 'Female':
                result = result.filter(p => p.sex === activeFilter);
                break;
            case 'Critical':
                // Check if diagnosis string contains "critical" ignoring case
                result = result.filter(p => p.diagnosis && p.diagnosis.toLowerCase().includes('critical'));
                break;
            case 'All':
            default:
                break; // No further filtering
        }

        // 3. Sort Logic
        result.sort((a, b) => {
            if (sortOption === 'Name (A-Z)') {
                return a.name.localeCompare(b.name);
            }

            // For Date sorting
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

            if (sortOption === 'Newest First') {
                return dateB - dateA; // Descending
            } else if (sortOption === 'Oldest First') {
                return dateA - dateB; // Ascending
            }

            return 0;
        });

        return result;
    }, [patients, searchQuery, activeFilter, sortOption]);

    const filterTabs: FilterOption[] = ['All', 'Male', 'Female', 'Critical'];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-[#374151]">Patients Directory</h1>
                <p className="text-[#6B7280] mt-1">View and manage all registered patients.</p>
            </div>

            {/* Filter, Search & Sort Bar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 bg-white p-3 rounded-xl border border-[#E5E7EB] shadow-sm">

                {/* Search */}
                <div className="w-full lg:w-96 relative shrink-0">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
                    <input
                        type="text"
                        placeholder="Search name, ID, or diagnosis..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:border-transparent outline-none bg-[#F9FAFB] text-sm"
                    />
                </div>

                {/* Tabs */}
                <div className="flex w-full lg:w-auto overflow-x-auto gap-2 lg:flex-row flex-nowrap shrink-0">
                    {filterTabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveFilter(tab)}
                            className={`px-5 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors duration-200 ${activeFilter === tab
                                    ? 'bg-[#2563EB] text-white shadow'
                                    : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#374151]'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Sort Dropdown */}
                <div className="w-full lg:w-auto shrink-0 flex items-center justify-end">
                    <select
                        className="px-4 py-2 bg-[#F9FAFB] border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] outline-none text-sm text-[#374151] font-medium"
                        value={sortOption}
                        onChange={(e) => setSortOption(e.target.value as SortOption)}
                    >
                        <option value="Newest First">Sort: Newest First</option>
                        <option value="Oldest First">Sort: Oldest First</option>
                        <option value="Name (A-Z)">Sort: Name (A-Z)</option>
                    </select>
                </div>
            </div>

            {/* Patients List/Grid */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="py-16 text-center flex flex-col items-center">
                        <div className="w-8 h-8 border-4 border-[#2563EB] border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[#6B7280]">Loading patient records...</p>
                    </div>
                ) : processedPatients.length === 0 ? (
                    <div className="py-20 text-center bg-white rounded-xl border border-dashed border-[#D1D5DB]">
                        <div className="bg-[#F3F4F6] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Search className="text-[#9CA3AF]" size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-[#374151] mb-1">No patients found</h3>
                        <p className="text-[#6B7280]">Try adjusting your search query or filters.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {processedPatients.map((patient) => (
                            <div key={patient.patientId} className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-4 lg:p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center hover:shadow-md transition duration-200 gap-6">

                                <div className="flex items-start gap-4 lg:gap-6 flex-1 min-w-0 w-full">
                                    {/* Avatar */}
                                    <div className="w-14 h-14 rounded-full bg-[#DBEAFE] text-[#2563EB] flex items-center justify-center font-bold text-lg shrink-0 shadow-inner">
                                        {getInitials(patient.name)}
                                    </div>

                                    {/* Basic Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3">
                                            <h3 className="font-bold text-[#1F2937] text-lg lg:text-xl truncate">{patient.name}</h3>
                                            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F3F4F6] text-[#4B5563] shrink-0 border border-[#E5E7EB]">
                                                #{patient.patientId}
                                            </span>
                                            {(patient.reportFiles && patient.reportFiles.length > 0) && (
                                                <span className="text-xs font-semibold px-2 py-1 flex items-center gap-1 rounded-full bg-blue-50 text-blue-600 shrink-0 border border-blue-100" title={`${patient.reportFiles.length} uploaded reports`}>
                                                    <FileText size={12} /> {patient.reportFiles.length}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 lg:mt-2 text-sm text-[#6B7280] font-medium">
                                            <span>{patient.age} years</span>
                                            <span className="w-1 h-1 rounded-full bg-[#D1D5DB]"></span>
                                            <span>{patient.sex}</span>
                                            <span className="w-1 h-1 rounded-full bg-[#D1D5DB]"></span>
                                            <span>Added {formatDate(patient.createdAt)}</span>
                                        </div>

                                        {/* Diagnosis snippet */}
                                        <p className="mt-3 text-sm text-[#4B5563] truncate lg:whitespace-normal lg:line-clamp-1 max-w-2xl bg-[#F9FAFB] p-2 rounded-lg border border-[#F3F4F6]">
                                            <span className="font-bold text-[#374151]">Diagnosis: </span>
                                            {patient.diagnosis || "No diagnosis provided."}
                                        </p>
                                    </div>
                                </div>

                                {/* Assistant Actions (RESTRICTED ROLE: No Prescribe, No Delete) */}
                                <div className="flex items-center gap-2 lg:gap-3 shrink-0 w-full lg:w-auto justify-end border-t lg:border-t-0 border-[#E5E7EB] pt-4 lg:pt-0">
                                    <button
                                        onClick={() => setSelectedPatient(patient)}
                                        className="text-[#6B7280] bg-white border border-[#D1D5DB] px-3 lg:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#F9FAFB] hover:text-[#374151] transition flex items-center gap-2"
                                    >
                                        <Eye size={16} /> <span className="hidden sm:inline">Profile</span>
                                    </button>

                                    <button
                                        onClick={() => {
                                            // Trigger placeholder upload functionality
                                            alert(`Upload flow triggered for ${patient.name}`);
                                        }}
                                        className="text-[#2563EB] bg-[#DBEAFE] px-3 lg:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#BFDBFE] transition flex items-center gap-2"
                                    >
                                        <Upload size={16} /> <span className="hidden sm:inline">Upload</span>
                                    </button>

                                    <button
                                        onClick={() => navigate(`/visit/${patient.patientId}`)}
                                        className="text-white bg-[#2563EB] px-3 lg:px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#1E40AF] transition shadow-sm flex items-center gap-2"
                                    >
                                        <Activity size={16} /> <span>Add Vitals</span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Profile Modal */}
            {selectedPatient && (
                <PatientProfileModal
                    patient={selectedPatient}
                    onClose={() => setSelectedPatient(null)}
                />
            )}
        </div>
    );
};

export default PatientsDirectory;
