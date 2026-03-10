import { useEffect, useState } from 'react';
import { useAppDispatch, useAppSelector } from '../../../controllers/hooks';
import { fetchAppointments } from '../../../controllers/apiThunks';
import { Calendar, Clock, Plus, Search, MoreVertical } from 'lucide-react';
import { NewAppointmentModal } from './NewAppointmentModal';
import type { Appointment } from '../../../models';

const AppointmentsList = () => {
    const dispatch = useAppDispatch();
    const { appointments, isLoading } = useAppSelector(state => state.appointments);
    const [activeTab, setActiveTab] = useState<'Today' | 'Upcoming' | 'Completed' | 'Canceled'>('Today');
    const [searchQuery, setSearchQuery] = useState('');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

    useEffect(() => {
        dispatch(fetchAppointments());
    }, [dispatch]);

    // Format helpers
    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    };

    /**
     * Smart Status Logic (matching mobile app):
     * Parses "Jan 6, 2026" and Time "3:00 PM" (or other formats depending on backend).
     * If strictly past new Date(), and status is "Upcoming", mark strictly as completed on frontend.
     */
    const getSmartStatusAndDate = (apt: Appointment) => {
        // Normalize incoming status to Title Case for UI consistency
        const rawStatus = apt.status?.toLowerCase() || 'upcoming';
        let smartStatus = rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1);
        let aptDateObj: Date | null = null;

        try {
            const dateStr = `${apt.date} ${apt.time}`;
            aptDateObj = new Date(dateStr);

            if (!isNaN(aptDateObj.getTime())) {
                const now = new Date();
                if (smartStatus === 'Upcoming' && aptDateObj < now) {
                    smartStatus = 'Completed';
                }
            }
        } catch (e) {
            console.error("Could not parse date", apt.date, apt.time);
        }

        return { smartStatus, aptDateObj };
    };

    // Filter appointments into buckets
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const filteredAppointments = appointments.filter(apt => {
        const { smartStatus, aptDateObj } = getSmartStatusAndDate(apt);

        // Search filter
        if (searchQuery && !apt.patientName.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }

        // Tab filter
        switch (activeTab) {
            case 'Today':
                if (aptDateObj) {
                    return aptDateObj >= today && aptDateObj < tomorrow && smartStatus !== 'Canceled';
                }
                // Fallback string matching if date parse failed
                const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                const todayStr = `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
                return apt.date === todayStr && smartStatus !== 'Canceled';
            case 'Upcoming':
                if (aptDateObj) {
                    return aptDateObj >= tomorrow && smartStatus === 'Upcoming';
                }
                return smartStatus === 'Upcoming';
            case 'Completed':
                return smartStatus === 'Completed';
            case 'Canceled':
                return smartStatus === 'Canceled';
            default:
                return true;
        }
    });

    // Style helpers based on status
    const getStatusStyles = (status: string) => {
        switch (status) {
            case 'Upcoming':
                return { badge: 'bg-[#DBEAFE] text-[#2563EB]', border: 'border-l-[#2563EB]', avatarBg: 'bg-[#2563EB]' };
            case 'Completed':
                return { badge: 'bg-[#D1FAE5] text-[#10B981]', border: 'border-l-[#10B981]', avatarBg: 'bg-[#10B981]' };
            case 'Canceled':
                return { badge: 'bg-red-100 text-red-600', border: 'border-l-red-500', avatarBg: 'bg-red-500' };
            default:
                return { badge: 'bg-gray-100 text-gray-600', border: 'border-l-gray-400', avatarBg: 'bg-gray-400' };
        }
    };

    const tabs: ('Today' | 'Upcoming' | 'Completed' | 'Canceled')[] = ['Today', 'Upcoming', 'Completed', 'Canceled'];

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-6">
            {/* Header & Actions */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold text-[#374151]">Appointments Manager</h1>
                    <p className="text-[#6B7280] mt-1">Manage and view all patient appointments.</p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setSelectedAppointment(null);
                            setIsModalOpen(true);
                        }}
                        className="bg-[#2563EB] text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-[#1E40AF] transition shadow-md"
                    >
                        <Plus size={20} />
                        New Appointment
                    </button>
                </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col lg:flex-row justify-between items-center gap-4 bg-white p-2 rounded-xl border border-[#E5E7EB] shadow-sm">

                {/* Tabs */}
                <div className="flex w-full lg:w-auto overflow-x-auto gap-2 p-1">
                    {tabs.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab)}
                            className={`px-5 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-colors duration-200 ${activeTab === tab
                                ? 'bg-[#2563EB] text-white shadow'
                                : 'text-[#6B7280] hover:bg-[#F3F4F6] hover:text-[#374151]'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* Search */}
                <div className="w-full lg:w-96 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" size={18} />
                    <input
                        type="text"
                        placeholder="Search by patient name..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-[#E5E7EB] rounded-lg focus:ring-2 focus:ring-[#2563EB] focus:border-transparent outline-none bg-[#F9FAFB] text-sm"
                    />
                </div>
            </div>

            {/* Appointments Grid/List */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {isLoading ? (
                    <div className="col-span-full py-12 text-center flex flex-col items-center">
                        <div className="w-8 h-8 border-4 border-[#2563EB] border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[#6B7280]">Loading appointments...</p>
                    </div>
                ) : filteredAppointments.length === 0 ? (
                    <div className="col-span-full py-16 text-center bg-white rounded-xl border border-dashed border-[#D1D5DB]">
                        <div className="bg-[#F3F4F6] w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                            <Calendar className="text-[#9CA3AF]" size={32} />
                        </div>
                        <h3 className="text-lg font-bold text-[#374151] mb-1">No appointments found</h3>
                        <p className="text-[#6B7280]">There are no appointments matching your current filters.</p>
                    </div>
                ) : (
                    filteredAppointments.map((apt) => {
                        const { smartStatus } = getSmartStatusAndDate(apt);
                        const styles = getStatusStyles(smartStatus);

                        return (
                            <div key={apt.id} className={`bg-white rounded-xl shadow-sm border border-[#E5E7EB] border-l-4 ${styles.border} p-5 hover:shadow-md transition duration-200 group relative`}>

                                <div className="absolute top-4 right-4">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setMenuOpenId(menuOpenId === apt.id ? null : apt.id);
                                        }}
                                        className="text-[#9CA3AF] hover:text-[#374151] p-1 rounded-md hover:bg-[#F3F4F6] transition"
                                    >
                                        <MoreVertical size={20} />
                                    </button>
                                    {menuOpenId === apt.id && (
                                        <div className="absolute right-0 mt-1 w-36 bg-white border border-[#E5E7EB] rounded-lg shadow-lg z-10 py-1">
                                            <button
                                                className="w-full text-left px-4 py-2 hover:bg-[#F3F4F6] text-sm text-[#374151] font-medium transition"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setSelectedAppointment(apt);
                                                    setIsModalOpen(true);
                                                    setMenuOpenId(null);
                                                }}
                                            >
                                                Edit Appointment
                                            </button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className={`w-12 h-12 rounded-full ${styles.avatarBg} text-white flex items-center justify-center font-bold shadow-sm shrink-0`}>
                                        {getInitials(apt.patientName)}
                                    </div>
                                    <div className="flex-1 pr-6">
                                        <h3 className="font-bold text-[#1F2937] text-lg truncate">{apt.patientName}</h3>
                                        <div className="flex flex-wrap items-center gap-2 mt-1">
                                            <span className="text-xs font-semibold text-[#6B7280] bg-[#F3F4F6] px-2 py-0.5 rounded-md">
                                                {apt.type || 'Consultation'}
                                            </span>
                                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${styles.badge}`}>
                                                {smartStatus}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 grid grid-cols-2 gap-3 text-sm border-t border-[#F3F4F6] pt-4">
                                    <div className="flex items-center gap-2 text-[#6B7280]">
                                        <Calendar size={16} className="text-[#9CA3AF]" />
                                        <span className="font-medium">{apt.date}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[#6B7280]">
                                        <Clock size={16} className="text-[#9CA3AF]" />
                                        <span className="font-medium">{apt.time}</span>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {/* Modals */}
            {isModalOpen && (
                <NewAppointmentModal
                    onClose={() => {
                        setIsModalOpen(false);
                        setSelectedAppointment(null);
                    }}
                    initialData={selectedAppointment}
                />
            )}
        </div>
    );
};

export default AppointmentsList;
