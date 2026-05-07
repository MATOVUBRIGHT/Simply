import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, UserPlus, Shield, CheckCircle, Cloud, CloudOff, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { isSupabaseConfigured } from '../lib/supabase';
import { SuccessPopup } from '../components/SuccessPopup';
import { isStaffEmail } from '../contexts/StaffAuthContext';
import { useStaffAuth } from '../contexts/StaffAuthContext';

export default function Login() {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [securingAccount, setSecuringAccount] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    step: 'creating' | 'syncing' | 'complete' | 'error' | 'offline';
    message: string;
    progress: number;
  }>({ step: 'creating', message: 'Creating your account...', progress: 0 });
  
  const { login, register, user, isOnline } = useAuth();
  const { staffLoginByEmail, isStaffMode, staffSession } = useStaffAuth();
  const { primaryColor } = useTheme();
  const navigate = useNavigate();

  // If staff is already logged in via email, redirect to dashboard
  useEffect(() => {
    if (isStaffMode && staffSession) navigate('/');
  }, [isStaffMode, staffSession, navigate]);

  useEffect(() => {
    if (user) {
      navigate('/');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isRegister) {
        if (!isSupabaseConfigured) {
          setError('Cloud authentication is not available. Please check your configuration.');
          setLoading(false);
          return;
        }

        if (!isOnline) {
          setError('You must be online to create an account. Please connect to the internet.');
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
        
        const result = await register(email, password, firstName, lastName);
        
        if (!result.success) {
          setError(result.error || 'Registration failed');
          setSecuringAccount(false);
          setLoading(false);
          return;
        }
        
        setSyncStatus({ step: 'syncing', message: 'Syncing to cloud...', progress: 60 });
        
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setSyncStatus({ step: 'complete', message: 'Account created successfully!', progress: 100 });
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        setSecuringAccount(false);
        
        if (rememberMe) {
          localStorage.setItem('remembered_email', email);
          localStorage.setItem('remember_me', 'true');
        }
        
        navigate('/');
      } else {
        if (!isSupabaseConfigured) {
          setError('Cloud authentication is not available. Please check your configuration.');
          setLoading(false);
          return;
        }

        // Detect staff email login (firstname.lastname.staffid@staff.schofy.app)
        if (isStaffEmail(email.toLowerCase().trim())) {
          const result = await staffLoginByEmail(email.toLowerCase().trim(), password);
          if (!result.success) {
            setError(result.error || 'Staff login failed');
            setLoading(false);
            return;
          }
          setShowSuccess(true);
          await new Promise(resolve => setTimeout(resolve, 1000));
          navigate('/');
          return;
        }

        const result = await login(email, password);
        if (!result.success) {
          setError(result.error || 'Login failed');
          setLoading(false);
          return;
        }
        
        if (rememberMe) {
          localStorage.setItem('remembered_email', email);
          localStorage.setItem('remember_me', 'true');
        } else {
          localStorage.removeItem('remembered_email');
          localStorage.removeItem('remember_me');
        }
        
        setShowSuccess(true);
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        // Navigate to dashboard
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message || (isRegister ? 'Registration failed' : 'Login failed'));
      setSecuringAccount(false);
    } finally {
      setLoading(false);
    }
  };

  // Securing Account Screen
  if (securingAccount) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-purple-50 p-4">
        <div className="text-center max-w-md">
          <div 
            className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 animate-pulse"
            style={{ backgroundColor: primaryColor }}
          >
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
          
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            {syncStatus.step === 'complete' ? 'Account Created!' : 
             syncStatus.step === 'error' ? 'Error' : 
             syncStatus.step === 'syncing' ? 'Syncing to Cloud' : 
             'Creating Account'}
          </h2>
          
          <p className="text-slate-600 mb-6">{syncStatus.message}</p>
          
          <div className="w-full bg-slate-200 rounded-full h-2 mb-4 overflow-hidden">
            <div 
              className="h-2 rounded-full transition-all duration-500"
              style={{ 
                width: `${syncStatus.progress}%`,
                backgroundColor: primaryColor 
              }}
            />
          </div>
          
          <div className="flex justify-center items-center gap-4 text-sm text-slate-500">
            <div className={`flex items-center gap-1 ${syncStatus.progress >= 20 ? 'text-indigo-600' : ''}`}>
              {syncStatus.progress >= 20 ? <CheckCircle size={14} /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
              <span>Local</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-200" />
            <div className={`flex items-center gap-1 ${syncStatus.progress >= 60 ? 'text-indigo-600' : ''}`}>
              {syncStatus.progress >= 60 ? <CheckCircle size={14} /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
              <span>Cloud</span>
            </div>
            <div className="w-8 h-0.5 bg-slate-200" />
            <div className={`flex items-center gap-1 ${syncStatus.progress >= 100 ? 'text-green-600' : ''}`}>
              {syncStatus.progress >= 100 ? <CheckCircle size={14} /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />}
              <span>Done</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: primaryColor }}
            >
              <span className="text-white font-bold text-3xl">S</span>
            </div>
            <div className="flex items-center gap-1 px-3 py-1 rounded-full text-sm">
              {isOnline ? (
                <span className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-full">
                  <Wifi size={14} />
                  Online
                </span>
              ) : (
                <span className="flex items-center gap-1 text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                  <WifiOff size={14} />
                  Offline
                </span>
              )}
            </div>
          </div>
          <h1 className="text-3xl font-bold text-slate-800 dark:text-white">Welcome to Schofy</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Cloud-First School Management</p>
        </div>

        <div className="card p-8">
          <div className="flex mb-6 border-b border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setIsRegister(false)}
              className={`flex-1 pb-3 text-center font-medium transition-colors ${
                !isRegister
                  ? 'border-b-2 text-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              style={!isRegister ? { borderColor: primaryColor, color: primaryColor } : {}}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setIsRegister(true)}
              className={`flex-1 pb-3 text-center font-medium transition-colors ${
                isRegister
                  ? 'border-b-2 text-slate-800 dark:text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
              style={isRegister ? { borderColor: primaryColor, color: primaryColor } : {}}
            >
              <UserPlus size={16} className="inline mr-1" />
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {!isSupabaseConfigured && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400 px-4 py-3 rounded-lg text-sm">
                <strong>Cloud Not Available:</strong> Please configure Supabase to enable authentication.
              </div>
            )}

            {isRegister && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">First Name</label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="form-input"
                    placeholder="John"
                    required
                  />
                </div>
                <div>
                  <label className="form-label">Last Name</label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="form-input"
                    placeholder="Doe"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className="form-label">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="form-input"
                placeholder="you@example.com or staff email"
                required
                autoComplete="email"
              />
              {isStaffEmail(email.toLowerCase().trim()) && (
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                  <Shield size={11}/> Staff account detected — enter your staff password
                </p>
              )}
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {isRegister && (
              <div>
                <label className="form-label">Confirm Password</label>
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
            )}

            {!isRegister && (
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="rememberMe"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <label htmlFor="rememberMe" className="ml-2 text-sm text-slate-600 dark:text-slate-400">
                  Remember me
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !isSupabaseConfigured}
              className="btn btn-primary w-full justify-center py-3 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  {isRegister ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                isRegister ? 'Create Account' : 'Sign In'
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
              <Cloud size={16} className={isOnline ? 'text-green-500' : 'text-amber-500'} />
              <span>{isOnline ? 'Connected to cloud' : 'Working offline'}</span>
            </div>
          </div>
        </div>

        <p className="text-center text-sm text-slate-400 dark:text-slate-500 mt-6">
          Cloud-first | Works offline | Auto-sync
        </p>
      </div>

      {showSuccess && (
        <SuccessPopup 
          message={isRegister ? "Account Created!" : "Welcome Back!"} 
          subMessage="Taking you to your dashboard..."
        />
      )}
    </div>
  );
}
