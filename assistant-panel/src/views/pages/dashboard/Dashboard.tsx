import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Activity, FilePlus, Save, Trash2 } from 'lucide-react';
import { fetchPatients, fetchAppointments } from '../../../controllers/apiThunks';
import { initializeNewVisit, loadDraftIntoState } from '../../../controllers/slices/patientVisitSlice';
import { DraftService, type DraftPatient } from '../../../services/draftService';
import type { RootState, AppDispatch } from '../../../controllers/store';

const Dashboard = () => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();

    // Remote Data
    const { patients, isLoading: loadingPatients } = useSelector((state: RootState) => state.patients);
    const { appointments, isLoading: loadingAppointments } = useSelector((state: RootState) => state.appointments);

    // Local Data
    const [localDrafts, setLocalDrafts] = useState<DraftPatient[]>([]);

    useEffect(() => {
        dispatch(fetchPatients());
        dispatch(fetchAppointments());

        // Load local storage drafts into dashboard component locally
        setLocalDrafts(DraftService.getAllDrafts());
    }, [dispatch]);

    const handleNewVisit = () => {
        dispatch(initializeNewVisit());
        navigate('/visit/new');
    };

    const handleResumeDraft = (draft: DraftPatient) => {
        dispatch(loadDraftIntoState(draft));
        navigate('/visit/new');
    };

    const handleDeleteDraft = (draftId: string) => {
        if (window.confirm('Are you sure you want to delete this draft?')) {
            DraftService.deleteDraft(draftId);
            setLocalDrafts(DraftService.getAllDrafts());
        }
    };

    const todayAppointments = appointments.filter((apt) => {
        const today = new Date();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const todayStr = `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
        return apt.date === todayStr;
    });

    // Cloud Waiting Room: Patients who have been sent over and are WAITING for docs
    // "status" in patient refers to the remote status in patient profile or an explicit waitlist (assuming backend map correctly).
    const waitingRoomPatients = patients.filter(p => (p as any).status === 'WAITING' || p.treatment === 'WAITING');

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-[#374151]">Assistant Dashboard</h1>
                    <p className="text-[#6B7280] mt-1">Welcome back. Here is today's overview.</p>
                </div>
                <button
                    onClick={handleNewVisit}
                    className="bg-[#2563EB] text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-[#1E40AF] transition shadow-md"
                >
                    <FilePlus size={20} />
                    New Patient Visit
                </button>
            </div>

            {/* Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5E7EB] flex items-center gap-4">
                    <div className="bg-[#DBEAFE] p-4 rounded-lg">
                        <Users className="text-[#2563EB]" size={28} />
                    </div>
                    <div>
                        <p className="text-[#6B7280] text-sm font-medium">Total Registered</p>
                        <p className="text-3xl font-bold text-[#1F2937]">{loadingPatients ? '...' : patients.length}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5E7EB] flex items-center gap-4 relative overflow-hidden">
                    <div className="bg-amber-100 p-4 rounded-lg relative z-10">
                        <Activity className="text-amber-600 cursor-pulse" size={28} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-[#6B7280] text-sm font-medium">In Waiting Room</p>
                        <p className="text-3xl font-bold text-[#1F2937]">{loadingPatients ? '...' : waitingRoomPatients.length}</p>
                    </div>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-sm border border-[#E5E7EB] flex items-center gap-4">
                    <div className="bg-[#D1FAE5] p-4 rounded-lg">
                        <Calendar className="text-[#10B981]" size={28} />
                    </div>
                    <div>
                        <p className="text-[#6B7280] text-sm font-medium">Today's Appointments</p>
                        <p className="text-3xl font-bold text-[#1F2937]">{loadingAppointments ? '...' : todayAppointments.length}</p>
                    </div>
                </div>
            </div>

            {/* Main Content Split */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Left Column: Waiting Room & Local Drafts */}
                <div className="space-y-8">
                    {/* Waiting Room Queue */}
                    <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                        <div className="p-5 border-b border-[#E5E7EB] flex justify-between items-center bg-[#FFFBEB]">
                            <h2 className="text-lg font-bold text-[#92400E] flex items-center gap-2">
                                <div className="w-2.5 h-2.5 bg-amber-500 rounded-full animate-pulse"></div>
                                Waiting Room Queue
                            </h2>
                            <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-bold uppercase tracking-wider">Cloud</span>
                        </div>
                        <div className="divide-y divide-[#E5E7EB]">
                            {loadingPatients ? (
                                <div className="p-5 text-center text-gray-500">Syncing with queue...</div>
                            ) : waitingRoomPatients.length === 0 ? (
                                <div className="p-5 text-center text-gray-500 text-sm">No patients are currently waiting for the doctor.</div>
                            ) : (
                                waitingRoomPatients.map((patient) => (
                                    <div key={patient.patientId} className="p-5 flex justify-between items-center bg-amber-50/30 hover:bg-amber-50 transition border-l-4 border-l-amber-400">
                                        <div>
                                            <p className="font-bold text-[#1F2937]">{patient.name}</p>
                                            <span className="text-xs text-[#6B7280]">#{patient.patientId}</span>
                                        </div>
                                        <button
                                            onClick={() => navigate(`/patients`)}
                                            className="text-amber-700 bg-amber-100 px-4 py-2 rounded-md text-sm font-medium hover:bg-amber-200 transition"
                                        >
                                            View Details
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Local Drafts Section */}
                    {localDrafts.length > 0 && (
                        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                            <div className="p-5 border-b border-[#E5E7EB] flex justify-between items-center bg-[#F9FAFB]">
                                <h2 className="text-lg font-bold text-[#374151] flex items-center gap-2">
                                    <Save size={18} className="text-[#6B7280]" />
                                    In-Progress Drafts
                                </h2>
                                <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full font-bold uppercase tracking-wider">Local</span>
                            </div>
                            <div className="divide-y divide-[#E5E7EB]">
                                {localDrafts.map((draft) => (
                                    <div key={draft.patientId} className="p-5 flex justify-between items-center hover:bg-gray-50 transition">
                                        <div>
                                            <p className="font-bold text-[#1F2937]">
                                                {draft.patientData?.basic?.fullName || 'Untitled Patient'}
                                            </p>
                                            <span className="text-xs text-[#6B7280]">
                                                Saved: {new Date(draft.lastUpdatedAt).toLocaleString()}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleResumeDraft(draft)}
                                                className="text-[#2563EB] bg-[#DBEAFE] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#2563EB] hover:text-white transition"
                                            >
                                                Resume Form
                                            </button>
                                            <button
                                                onClick={() => handleDeleteDraft(draft.patientId)}
                                                className="text-[#DC2626] bg-[#FEE2E2] p-2 rounded-md hover:bg-[#DC2626] hover:text-white transition"
                                                title="Delete Draft"
                                            >
                                                <Trash2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right Column: Today's Schedule */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                    <div className="p-5 border-b border-[#E5E7EB] flex justify-between items-center bg-[#F3F4F6]">
                        <h2 className="text-lg font-bold text-[#374151]">Today's Scheduled Appointments</h2>
                        <button onClick={() => navigate('/appointments')} className="text-[#2563EB] text-sm font-medium hover:underline">View All</button>
                    </div>
                    <div className="divide-y divide-[#E5E7EB]">
                        {loadingAppointments ? (
                            <div className="p-5 text-center text-gray-500">Loading appointments...</div>
                        ) : todayAppointments.length === 0 ? (
                            <div className="p-5 text-center text-gray-500">No appointments scheduled for today.</div>
                        ) : (
                            todayAppointments.map((apt) => (
                                <div key={apt.id} className="p-5 flex justify-between items-center hover:bg-gray-50 transition">
                                    <div className="flex items-center gap-4">
                                        <div className="text-center bg-[#F3F4F6] rounded-md px-3 py-2 border border-[#E5E7EB]">
                                            <span className="block text-sm font-bold text-[#1F2937]">{apt.time}</span>
                                        </div>
                                        <div>
                                            <p className="font-bold text-[#1F2937]">{apt.patientName}</p>
                                            <span className="text-xs font-medium text-[#10B981] bg-[#D1FAE5] px-2 py-1 rounded-full mt-1 inline-block">
                                                {apt.type || 'Consultation'}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            // Ensure clean slate before opening standard visit
                                            dispatch(initializeNewVisit());
                                            navigate(`/visit/${apt.patientId || 'new'}`);
                                        }}
                                        className="text-[#6B7280] border border-[#E5E7EB] bg-white px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition"
                                    >
                                        Check In
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

            </div>
        </div>
    );
};

export default Dashboard;
