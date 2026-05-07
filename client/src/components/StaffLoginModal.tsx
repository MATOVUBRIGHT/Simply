import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Shield, Eye, EyeOff, X, LogIn, AlertCircle } from 'lucide-react';
import { useStaffAuth } from '../contexts/StaffAuthContext';
import { useAuth } from '../contexts/AuthContext';

interface Props {
  onClose: () => void;
}

export default function StaffLoginModal({ onClose }: Props) {
  const { staffLogin } = useStaffAuth();
  const { schoolId, user } = useAuth();
  const [staffId, setStaffId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tenantId = schoolId || user?.id || '';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!staffId.trim() || !password) { setError('Enter your Staff ID and password'); return; }
    setLoading(true); setError('');
    const result = await staffLogin(staffId.trim().toUpperCase(), password, tenantId);
    setLoading(false);
    if (result.success) { onClose(); }
    else { setError(result.error || 'Login failed'); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                <Shield size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-base font-bold">Staff Login</h2>
                <p className="text-indigo-100 text-xs">Enter your Staff ID and password</p>
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl px-3 py-2.5 text-sm">
              <AlertCircle size={15} className="flex-shrink-0" />{error}
            </div>
          )}
          <div>
            <label className="form-label">Staff ID</label>
            <input
              className="form-input font-mono uppercase"
              value={staffId}
              onChange={e => setStaffId(e.target.value.toUpperCase())}
              placeholder="e.g. TCH-001"
              autoComplete="username"
              required
            />
          </div>
          <div>
            <label className="form-label">Password</label>
            <div className="relative">
              <input
                className="form-input pr-10"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Your password"
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full btn btn-primary flex items-center justify-center gap-2 py-3">
            {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <LogIn size={16} />}
            {loading ? 'Signing in...' : 'Sign In as Staff'}
          </button>
          <p className="text-xs text-center text-slate-400 dark:text-slate-500">
            Staff ID and password are provided by your school admin
          </p>
        </form>
      </div>
    </div>,
    document.body
  );
}
