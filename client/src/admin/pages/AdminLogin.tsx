import { useState, FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useAdminAuth } from '../AdminAuthContext';

export default function AdminLogin() {
  const { login } = useAdminAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [securityCheckPassed, setSecurityCheckPassed] = useState(false);
  const [accessDeniedPopup, setAccessDeniedPopup] = useState(false);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!securityCheckPassed) {
      setAccessDeniedPopup(true);
      return;
    }
    setLoading(true);

    setTimeout(() => {
      const result = login(email, password);
      if (result.success) {
        navigate('/admin/dashboard', { replace: true });
      } else {
        setError(result.error || 'Invalid credentials');
      }
      setLoading(false);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-500/30">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Schofy Admin</h1>
          <p className="text-slate-400 text-sm mt-1">Super Admin Portal</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-1">Sign in to continue</h2>
          <p className="text-xs text-slate-500 mb-5">
            Use your assigned admin credentials.
          </p>

          {/* Hint box — shows active email */}
          {error && (
            <div className="flex items-center gap-2 bg-red-900/30 border border-red-800 text-red-300 rounded-xl px-4 py-3 mb-4 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Admin Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="off"
                name="schofy_admin_email"
                className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  name="schofy_admin_password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setError('');
                setSecurityCheckPassed(true);
              }}
              className={`inline-flex items-center gap-1.5 text-sm font-semibold ${
                securityCheckPassed ? 'text-emerald-400' : 'text-indigo-300 hover:text-indigo-200'
              }`}
            >
              <Shield size={15} />
              Security check
            </button>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Verifying...
                </>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-600 mt-4">
          Schofy Super Admin Portal — Restricted Access
        </p>
      </div>

      {accessDeniedPopup && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-red-800 bg-slate-900 p-5 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-900/30 text-red-300">
              <AlertCircle size={22} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-white">Access denied</h2>
            <p className="mt-2 text-sm text-slate-400">Try again.</p>
            <button
              type="button"
              onClick={() => {
                setAccessDeniedPopup(false);
                setSecurityCheckPassed(false);
              }}
              className="mt-5 w-full rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              Try again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
