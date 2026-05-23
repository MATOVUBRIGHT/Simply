import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Cloud,
  CloudOff,
  Eye,
  EyeOff,
  FileText,
  Loader2,
  LockKeyhole,
  Shield,
  UserPlus,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { SuccessPopup } from '../components/SuccessPopup';

type PolicyModal = 'terms' | 'privacy' | null;

const APP_LOGO = '/schofy.logo.png';
const AUTH_COVER = '/cover.jpg';

const policyCopy = {
  terms: {
    title: 'Terms of Use',
    intro: 'By creating or using a Schofy account, you agree to use the service responsibly for lawful school administration and learning operations.',
    points: [
      'You are responsible for keeping account access secure and only granting access to authorized school users.',
      'School data should be accurate, respectful, and uploaded only when you have permission to manage it.',
      'Schofy may update features, sync behavior, and service availability to improve reliability and security.',
      'Misuse, unauthorized access, reverse engineering, or attempts to disrupt the service are not allowed.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro: 'Schofy is designed to protect school information while keeping your data available across approved devices.',
    points: [
      'We store account, school, student, staff, finance, attendance, and settings data needed to run the app.',
      'Data is synced through your configured cloud database and may also be cached locally for offline use.',
      'Passwords and authentication are handled through secure authentication services and are not displayed in the app.',
      'You control the school data you enter, export, update, or delete from your account.',
    ],
  },
};

function PolicyDialog({ type, onClose }: { type: Exclude<PolicyModal, null>; onClose: () => void }) {
  const copy = policyCopy[type];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-lg overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              <FileText size={18} />
            </div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">{copy.title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={`Close ${copy.title}`}
          >
            <X size={18} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{copy.intro}</p>
          <div className="mt-4 space-y-3">
            {copy.points.map((point) => (
              <div key={point} className="flex gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/70">
                <CheckCircle size={16} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{point}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs leading-5 text-slate-500 dark:text-slate-400">
            This summary is provided inside the app for account creation. Your school remains responsible for its own data-entry permissions and local compliance requirements.
          </p>
        </div>
        <div className="border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <button type="button" onClick={onClose} className="btn btn-primary w-full justify-center">
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);
  const [policyModal, setPolicyModal] = useState<PolicyModal>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [securingAccount, setSecuringAccount] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    step: 'creating' | 'syncing' | 'complete' | 'error' | 'offline';
    message: string;
    progress: number;
  }>({ step: 'creating', message: 'Creating your account...', progress: 0 });

  const { login, register, user, isOnline } = useAuth();
  const { primaryColor } = useTheme();
  const navigate = useNavigate();

  useEffect(() => {
    const remembered = localStorage.getItem('remembered_email');
    if (remembered) {
      setEmail(remembered);
      setRememberMe(localStorage.getItem('remember_me') === 'true');
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowSplash(false), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (!isSupabaseConfigured) {
        setError('Cloud authentication is not available. Please check your configuration.');
        setLoading(false);
        return;
      }

      if (isRegister) {
        if (!isOnline) {
          setError('You must be online to create an account. Please connect to the internet.');
          setLoading(false);
          return;
        }

        if (!acceptedPolicies) {
          setError('Please accept the Terms of Use and Privacy Policy to create an account.');
          setLoading(false);
          return;
        }

        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          setLoading(false);
          return;
        }

        setSecuringAccount(true);
        setSyncStatus({ step: 'creating', message: 'Creating your account...', progress: 20 });

        const result = await register(email.trim(), password, firstName.trim(), lastName.trim());

        if (!result.success) {
          setError(result.error || 'Registration failed');
          setSecuringAccount(false);
          setLoading(false);
          return;
        }

        setSyncStatus({ step: 'syncing', message: 'Syncing to cloud...', progress: 60 });
        await new Promise((resolve) => setTimeout(resolve, 500));
        setSyncStatus({ step: 'complete', message: 'Account created successfully!', progress: 100 });
        await new Promise((resolve) => setTimeout(resolve, 900));
        setSecuringAccount(false);
      } else {
        const result = await login(email.trim(), password);
        if (!result.success) {
          setError(result.error || 'Login failed');
          setLoading(false);
          return;
        }
      }

      if (rememberMe) {
        localStorage.setItem('remembered_email', email.trim());
        localStorage.setItem('remember_me', 'true');
      } else {
        localStorage.removeItem('remembered_email');
        localStorage.removeItem('remember_me');
      }

      setShowSuccess(true);
      await new Promise((resolve) => setTimeout(resolve, isRegister ? 700 : 1200));
      navigate('/');
    } catch (err: any) {
      setError(err.message || (isRegister ? 'Registration failed' : 'Login failed'));
      setSecuringAccount(false);
    } finally {
      setLoading(false);
    }
  };

  if (showSplash) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="text-center">
          <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-lg bg-white p-3 shadow-xl ring-1 ring-slate-100">
            <img src={APP_LOGO} alt="Schofy" className="h-full w-full object-contain" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">Welcome to Schofy</h1>
          <p className="mt-2 text-sm text-slate-500">Preparing your school workspace...</p>
        </div>
      </div>
    );
  }

  if (securingAccount) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4 dark:bg-slate-950">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto mb-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-lg" style={{ backgroundColor: primaryColor }}>
            {syncStatus.step === 'complete' ? (
              <CheckCircle size={40} className="text-white" />
            ) : syncStatus.step === 'error' ? (
              <CloudOff size={40} className="text-white" />
            ) : syncStatus.step === 'syncing' ? (
              <Cloud size={40} className="text-white" />
            ) : (
              <Shield size={40} className="text-white" />
            )}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
            {syncStatus.step === 'complete' ? 'Account created' : syncStatus.step === 'syncing' ? 'Syncing to cloud' : 'Creating account'}
          </h2>
          <p className="mt-2 text-slate-600 dark:text-slate-300">{syncStatus.message}</p>
          <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${syncStatus.progress}%`, backgroundColor: primaryColor }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-cover bg-center p-4"
      style={{ backgroundImage: `url(${AUTH_COVER})` }}
    >
      <div className="absolute inset-0 bg-white/35" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center">
        <div className="grid w-full overflow-hidden rounded-lg border border-white/55 bg-white/82 shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-900/88 lg:grid-cols-[1fr_28rem]">
          <section className="hidden bg-white/12 px-10 py-12 text-slate-950 lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-white/85 p-2 shadow-sm ring-1 ring-white/60">
                <img src={APP_LOGO} alt="Schofy" className="h-full w-full object-contain" />
              </div>
              <h1 className="mt-8 max-w-lg text-4xl font-bold leading-tight">A calm, reliable workspace for modern schools.</h1>
              <p className="mt-4 max-w-md text-sm leading-6 text-slate-700">
                Manage students, finance, attendance, reports, and school operations with offline support and cloud sync.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-xs font-semibold">
              <span className="inline-flex h-10 items-center justify-center rounded-md border border-amber-200 bg-amber-100/90 px-3 text-amber-800 shadow-sm">
                Offline ready
              </span>
              <span className="inline-flex h-10 items-center justify-center rounded-md border border-sky-200 bg-sky-100/90 px-3 text-sky-800 shadow-sm">
                Realtime sync
              </span>
              <span className="inline-flex h-10 items-center justify-center rounded-md border border-emerald-200 bg-emerald-100/90 px-3 text-emerald-800 shadow-sm">
                Secure access
              </span>
            </div>
          </section>

          <section className="px-5 py-7 sm:px-8">
            <div className="mb-7 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-50 p-1.5 dark:bg-slate-800 lg:hidden">
                  <img src={APP_LOGO} alt="Schofy" className="h-full w-full object-contain" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{isRegister ? 'Create account' : 'Welcome back'}</h2>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{isRegister ? 'Start your school workspace.' : 'Sign in with your email address.'}</p>
                </div>
              </div>
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${isOnline ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                {isOnline ? <Wifi size={13} /> : <WifiOff size={13} />}
                {isOnline ? 'Online' : 'Offline'}
              </span>
            </div>

            <div className="mb-6 grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => { setIsRegister(false); setError(''); }}
                className={`rounded-md px-3 py-2 text-sm font-semibold transition ${!isRegister ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                Sign in
              </button>
              <button
                type="button"
                onClick={() => { setIsRegister(true); setError(''); }}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition ${isRegister ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
              >
                <UserPlus size={15} />
                Register
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              )}

              {!isSupabaseConfigured && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                  Cloud authentication is not configured yet.
                </div>
              )}

              {isRegister && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="form-label">First name</label>
                    <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} className="form-input" placeholder="First name" required />
                  </div>
                  <div>
                    <label className="form-label">Last name</label>
                    <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} className="form-input" placeholder="Last name" required />
                  </div>
                </div>
              )}

              <div>
                <label className="form-label">Email address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="you@school.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div>
                <label className="form-label">Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-input pr-10"
                    placeholder="Enter your password"
                    required
                    minLength={6}
                    autoComplete={isRegister ? 'new-password' : 'current-password'}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {isRegister && (
                <>
                  <div>
                    <label className="form-label">Confirm password</label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="form-input"
                      placeholder="Confirm your password"
                      required
                      minLength={6}
                      autoComplete="new-password"
                    />
                  </div>

                  <label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/70">
                    <input
                      type="checkbox"
                      checked={acceptedPolicies}
                      onChange={(e) => setAcceptedPolicies(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="leading-5 text-slate-600 dark:text-slate-300">
                      I agree to the{' '}
                      <button type="button" onClick={() => setPolicyModal('terms')} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                        Terms of Use
                      </button>{' '}
                      and{' '}
                      <button type="button" onClick={() => setPolicyModal('privacy')} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                        Privacy Policy
                      </button>
                      .
                    </span>
                  </label>
                </>
              )}

              {!isRegister && (
                <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Remember me
                </label>
              )}

              <button type="submit" disabled={loading || !isSupabaseConfigured} className="btn btn-primary w-full justify-center py-3 disabled:opacity-50">
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" />
                    {isRegister ? 'Creating account...' : 'Signing in...'}
                  </>
                ) : (
                  <>
                    {isRegister ? <UserPlus size={18} /> : <LockKeyhole size={18} />}
                    {isRegister ? 'Create account' : 'Sign in'}
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 flex items-center justify-center gap-2 border-t border-slate-200 pt-5 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <Cloud size={16} className={isOnline ? 'text-emerald-500' : 'text-amber-500'} />
              <span>{isOnline ? 'Connected to cloud' : 'Offline mode available after sign in'}</span>
            </div>
          </section>
        </div>
      </div>

      {policyModal && <PolicyDialog type={policyModal} onClose={() => setPolicyModal(null)} />}

      {showSuccess && (
        <SuccessPopup
          message={isRegister ? 'Account created' : 'Welcome back'}
          subMessage="Taking you to your dashboard..."
        />
      )}
    </div>
  );
}
