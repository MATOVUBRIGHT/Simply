import { useStaffAuth } from '../contexts/StaffAuthContext';
import { LogOut, Shield, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function StaffSessionBanner() {
  const { staffSession, staffLogout, isStaffMode } = useStaffAuth();
  const navigate = useNavigate();

  if (!isStaffMode || !staffSession) return null;

  const { staffMember } = staffSession;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[9998] bg-indigo-600 text-white px-4 py-2 flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2 text-sm">
        <Shield size={15} className="text-indigo-200" />
        <span className="font-medium">{staffMember.firstName} {staffMember.lastName}</span>
        <span className="text-indigo-200 text-xs">({staffMember.staffId} · {staffMember.role})</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/roles')}
          className="flex items-center gap-1 text-xs text-indigo-200 hover:text-white transition-colors px-2 py-1 rounded hover:bg-white/10"
        >
          <Eye size={13} /> My Access
        </button>
        <button
          onClick={staffLogout}
          className="flex items-center gap-1.5 text-xs bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition-colors font-medium"
        >
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </div>
  );
}
