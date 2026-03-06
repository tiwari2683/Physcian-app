import { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { Users, Calendar, Activity, FilePlus, ChevronRight } from 'lucide-react';
import { fetchPatients, fetchAppointments } from '../../../controllers/apiThunks';
import type { RootState, AppDispatch } from '../../../controllers/store';

const Dashboard = () => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const { patients, isLoading: loadingPatients } = useSelector((state: RootState) => state.patients);
    const { appointments, isLoading: loadingAppointments } = useSelector((state: RootState) => state.appointments);

    useEffect(() => {
        dispatch(fetchPatients());
        dispatch(fetchAppointments());
    }, [dispatch]);

    // Use today's date to filter today's appointments if necessary, or assume the backend handles it.
    const todayAppointments = appointments.filter((apt) => {
        // Basic date matching - to be refined based on exact date format returned by backend
        const today = new Date();
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const todayStr = `${months[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;
        return apt.date === todayStr;
    });

    return (
        <div className="p-8 max-w-7xl mx-auto space-y-8">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-[#374151]">Assistant Dashboard</h1>
                    <p className="text-[#6B7280] mt-1">Welcome back. Here is today's overview.</p>
                </div>
                <button
                    onClick={() => navigate('/visit/new')}
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
                        <p className="text-[#6B7280] text-sm font-medium">Total Registered Patients</p>
                        <p className="text-3xl font-bold text-[#1F2937]">{loadingPatients ? '...' : patients.length}</p>
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

                {/* Left Column: Today's Schedule */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                    <div className="p-5 border-b border-[#E5E7EB] flex justify-between items-center bg-[#F3F4F6]">
                        <h2 className="text-lg font-bold text-[#374151]">Today's Schedule</h2>
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
                                                {apt.type}
                                            </span>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => navigate(`/visit/${apt.patientId || 'new'}`)}
                                        className="text-[#2563EB] bg-[#DBEAFE] px-4 py-2 rounded-md text-sm font-medium hover:bg-[#2563EB] hover:text-white transition"
                                    >
                                        Start Visit
                                    </button>
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Column: Recent Patients (Assistant View) */}
                <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
                    <div className="p-5 border-b border-[#E5E7EB] flex justify-between items-center bg-[#F3F4F6]">
                        <h2 className="text-lg font-bold text-[#374151]">Recent Patients</h2>
                        <button onClick={() => navigate('/patients')} className="text-[#2563EB] text-sm font-medium hover:underline">View All</button>
                    </div>
                    <div className="divide-y divide-[#E5E7EB]">
                        {loadingPatients ? (
                            <div className="p-5 text-center text-gray-500">Loading patients...</div>
                        ) : patients.length === 0 ? (
                            <div className="p-5 text-center text-gray-500">No recent patients found.</div>
                        ) : (
                            patients.slice(0, 5).map((patient) => (
                                <div key={patient.patientId} className="p-5 flex justify-between items-center hover:bg-gray-50 transition">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-bold text-[#1F2937]">{patient.name}</p>
                                            <span className="text-xs text-[#6B7280]">#{patient.patientId}</span>
                                        </div>
                                        <p className="text-sm text-[#6B7280] mt-1">{patient.age} yrs • {patient.sex}</p>
                                    </div>

                                    {/* ASSISTANT SPECIFIC ACTIONS - No Delete, No Prescribe */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => navigate(`/visit/${patient.patientId}`)}
                                            className="text-[#6B7280] hover:text-[#2563EB] p-2 flex items-center gap-1 text-sm font-medium transition"
                                        >
                                            <Activity size={16} /> Vitals
                                        </button>
                                        <button
                                            onClick={() => navigate(`/visit/${patient.patientId}`)}
                                            className="text-[#6B7280] hover:text-[#374151] p-2 transition"
                                        >
                                            <ChevronRight size={20} />
                                        </button>
                                    </div>
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
