// Removed React import for React 17+
import { Outlet, NavLink } from 'react-router-dom';
import { Home, Calendar, Users as UsersIcon, LogOut } from 'lucide-react';
import { useDispatch } from 'react-redux';
import { clearAuth } from '../../../controllers/slices/authSlice';
import { signOut } from '@aws-amplify/auth';

export const Layout = () => {
    const dispatch = useDispatch();

    const handleLogout = async () => {
        try {
            await signOut();
            dispatch(clearAuth());
        } catch (error) {
            console.error('Error signing out: ', error);
        }
    };

    const navItemClass = ({ isActive }: { isActive: boolean }) =>
        `flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${isActive
            ? 'bg-[#2563EB] text-white'
            : 'text-[#4B5563] hover:bg-[#F3F4F6] hover:text-[#1F2937]'
        }`;

    return (
        <div className="flex h-screen bg-[#F3F4F6]">
            {/* Sidebar */}
            <aside className="w-64 bg-white border-r border-[#E5E7EB] flex flex-col hidden md:flex">
                {/* Logo/Brand */}
                <div className="p-6 border-b border-[#E5E7EB] flex items-center gap-3">
                    <div className="bg-[#2563EB] p-2 rounded-lg text-white">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="font-bold text-[#1F2937] text-xl leading-none">Physician</h1>
                        <span className="text-sm font-semibold text-[#2563EB]">Assistant</span>
                    </div>
                </div>

                {/* Navigation Links */}
                <nav className="flex-1 p-4 space-y-2">
                    <NavLink to="/" className={navItemClass}>
                        <Home size={20} />
                        Dashboard
                    </NavLink>
                    <NavLink to="/appointments" className={navItemClass}>
                        <Calendar size={20} />
                        Appointments
                    </NavLink>
                    <NavLink to="/patients" className={navItemClass}>
                        <UsersIcon size={20} />
                        Patients
                    </NavLink>
                </nav>

                {/* User Info & Logout */}
                <div className="p-4 border-t border-[#E5E7EB]">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-full bg-[#DBEAFE] flex items-center justify-center text-[#2563EB] font-bold border border-[#2563EB]/20">
                            A
                        </div>
                        <div>
                            <p className="text-sm font-bold text-[#1F2937]">Assistant User</p>
                            <p className="text-xs text-[#6B7280]">Panel Access</p>
                        </div>
                    </div>
                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-2 justify-center px-4 py-2 text-sm font-medium text-[#EF4444] bg-[#FEF2F2] hover:bg-[#FEE2E2] rounded-lg transition-colors"
                    >
                        <LogOut size={16} />
                        Sign Out
                    </button>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto">
                <Outlet />
            </main>
        </div>
    );
};
