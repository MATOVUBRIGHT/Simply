import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { BriefcaseBusiness, Loader2, LockKeyhole, ShieldCheck, UserCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useStaffAuth } from '../contexts/StaffAuthContext';
import { supabase } from '../lib/supabase';
import { loginLocal } from '../lib/auth/LocalAuth';
import { appLogoFileName } from '../utils/releaseChannel';

const gateEnabledKey = (schoolId: string) => `schofy_staff_gate_enabled_${schoolId}`;
const assetBase = import.meta.env.BASE_URL || './';
const appLogo = `${assetBase}${appLogoFileName}`;
const authCover = `${assetBase}cover.jpg`;

export function StaffRoleGate({ children }: { children: ReactNode }) {
  const { user, schoolId, isOnline } = useAuth();
  const tenantId = schoolId || user?.id || '';
  const { staffSession, staffLoading, staffLogin } = useStaffAuth();
  const [checking, setChecking] = useState(true);
  const [requiresRole, setRequiresRole] = useState(false);
  const [staffName, setStaffName] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [adminProceed, setAdminProceed] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [adminVerifying, setAdminVerifying] = useState(false);
  const [adminError, setAdminError] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!tenantId) {
      setChecking(false);
      setRequiresRole(false);
      return;
    }

    let cancelled = false;
    setChecking(true);
    const knownEnabled = localStorage.getItem(gateEnabledKey(tenantId)) === '1';

    async function checkStaffAccounts() {
      if (!supabase || !isOnline) {
        if (!cancelled) {
          setRequiresRole(knownEnabled);
          setChecking(false);
        }
        return;
      }

      try {
        const { count, error } = await supabase
          .from('school_staff_users')
          .select('id', { count: 'exact', head: true })
          .eq('school_id', tenantId);
        if (cancelled) return;
        const enabled = !error && Number(count || 0) > 0;
        if (enabled) localStorage.setItem(gateEnabledKey(tenantId), '1');
        setRequiresRole(enabled || knownEnabled);
      } catch {
        if (!cancelled) setRequiresRole(knownEnabled);
      } finally {
        if (!cancelled) setChecking(false);
      }
    }

    void checkStaffAccounts();
    return () => {
      cancelled = true;
    };
  }, [tenantId, isOnline]);

  useEffect(() => {
    function returnToRoleGate() {
      setRequiresRole(true);
      setAdminProceed(false);
      setShowAdminPassword(true);
      setAdminPassword('');
      setAdminError('');
      setAdminVerifying(false);
      setStaffName('');
      setPassword('');
      setError('');
    }

    window.addEventListener('schofyReturnToStaffLogin', returnToRoleGate);
    return () => window.removeEventListener('schofyReturnToStaffLogin', returnToRoleGate);
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError('');
    setSubmitting(true);
    const result = await staffLogin(tenantId, staffName, password);
    setSubmitting(false);
    if (!result.success) {
      setError(result.error || 'Could not start role shift.');
      return;
    }
    setPassword('');
  }

  async function continueAsAdmin(event?: FormEvent) {
    event?.preventDefault();
    if (!showAdminPassword) {
      setShowAdminPassword(true);
      setAdminError('');
      return;
    }
    const email = user?.email?.trim().toLowerCase() || '';
    if (!email) {
      setAdminError('Admin email is missing. Sign out and sign in again.');
      return;
    }
    if (!adminPassword) {
      setAdminError('Enter the admin password to continue.');
      return;
    }

    setAdminVerifying(true);
    setAdminError('');
    try {
      if (supabase && isOnline) {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: adminPassword });
        if (!signInError) {
          setAdminPassword('');
          setAdminProceed(true);
          return;
        }
      }

      const localResult = await loginLocal(email, adminPassword, { syncToCloud: false });
      if (localResult.success) {
        setAdminPassword('');
        setAdminProceed(true);
        return;
      }
      setAdminError('Invalid admin password.');
    } catch {
      setAdminError('Could not verify admin password. Try again.');
    } finally {
      setAdminVerifying(false);
    }
  }

  if (staffLoading || checking) {
    return (
      <div className="relative min-h-screen bg-cover bg-center p-4" style={{ backgroundImage: `url(${authCover})` }}>
        <div className="pointer-events-none absolute inset-0 bg-white/35" />
        <div className="relative flex min-h-[calc(100vh-2rem)] items-center justify-center">
          <div className="card overflow-hidden bg-white/82 backdrop-blur-md dark:bg-slate-900/88">
            <div className="card-body flex items-center gap-3">
              <Loader2 size={22} className="animate-spin text-primary-600" />
              <span className="text-sm font-semibold text-slate-600 dark:text-slate-300">Preparing role access...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!requiresRole || staffSession || adminProceed) return <>{children}</>;

  return (
    <div className="relative min-h-screen w-full bg-cover bg-center p-4" style={{ backgroundImage: `url(${authCover})` }}>
      <div className="pointer-events-none absolute inset-0 bg-white/35" />
      <div className="relative mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center">
      <section className="grid w-full overflow-hidden rounded-lg border border-white/55 bg-white/62 bg-cover bg-center shadow-xl shadow-slate-900/15 backdrop-blur-md dark:border-slate-800/70 dark:bg-slate-900/80 md:grid-cols-[1fr_28rem]" style={{ backgroundImage: `linear-gradient(rgba(255,255,255,0.66), rgba(255,255,255,0.66)), url(${authCover})` }}>
        <div className="hidden min-h-[470px] bg-white/12 px-10 py-12 text-slate-950 md:flex md:flex-col md:justify-between">
          <div className="relative flex h-full flex-col justify-between">
            <div>
              <div className="flex items-center gap-3">
                <img src={appLogo} alt="Schofy" className="h-16 w-16 rounded-lg bg-white/85 p-2 shadow-sm ring-1 ring-white/60" />
                <div>
                  <p className="text-base font-black leading-tight text-slate-950">Schofy</p>
                  <p className="text-xs text-slate-600">Role access</p>
                </div>
              </div>
              <div className="mt-12 space-y-3">
                <p className="max-w-lg text-4xl font-bold leading-tight">Choose who is starting this session.</p>
                <p className="max-w-md text-sm leading-6 text-slate-700">Admin keeps full control. Staff enter their name and password so teachers, accountants, and other users work with the right access.</p>
              </div>
            </div>
            <div className="grid gap-3 text-sm text-slate-700">
              <div className="rounded-lg border border-slate-300/70 bg-white/62 p-3 shadow-sm backdrop-blur-sm">
                <p className="font-bold">Admin session</p>
                <p className="mt-1 text-xs text-slate-600">Full access for the signed-in main account.</p>
              </div>
              <div className="rounded-lg border border-slate-300/70 bg-white/62 p-3 shadow-sm backdrop-blur-sm">
                <p className="font-bold">Staff role</p>
                <p className="mt-1 text-xs text-slate-600">Name and password, limited pages, separate activity log.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/38 p-5 backdrop-blur-sm dark:bg-slate-950/20 sm:p-7">
          <div className="mb-6 flex items-center gap-3 md:hidden">
            <img src={appLogo} alt="Schofy" className="h-10 w-10 rounded-xl bg-white p-1 shadow" />
            <div>
              <p className="text-base font-black text-slate-900 dark:text-white">Schofy</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Role access</p>
            </div>
          </div>
          <div className="mb-6 flex items-start gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
              <LockKeyhole size={19} />
            </div>
            <div>
              <h1 className="text-lg font-black text-slate-900 dark:text-white">Start Shift / Role</h1>
              <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">Continue as admin or sign in with a staff role.</p>
            </div>
          </div>

          <form onSubmit={continueAsAdmin} className="space-y-3">
            {showAdminPassword && (
              <div>
                <label className="form-label">Admin Password</label>
                <input
                  type="password"
                  value={adminPassword}
                  onChange={event => setAdminPassword(event.target.value)}
                  className="form-input"
                  placeholder="Main account password"
                  autoComplete="new-password"
                />
                {adminError && <p className="mt-2 text-xs font-semibold text-red-600 dark:text-red-300">{adminError}</p>}
              </div>
            )}
            <button
              type="submit"
              disabled={adminVerifying}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-bold text-white shadow-lg shadow-slate-900/15 transition hover:bg-slate-800 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
              {adminVerifying ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
              {showAdminPassword ? (adminVerifying ? 'Verifying admin...' : 'Unlock Admin') : 'Continue as Admin'}
            </button>
          </form>

          <form className="mt-5 space-y-4" onSubmit={submit} autoComplete="off">
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">
                <BriefcaseBusiness size={12} /> Staff role
              </span>
              <div className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
              {error}
            </div>
          )}
          {!isOnline && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              Connect to the internet to start a role shift.
            </div>
          )}
          <div>
            <label className="form-label">Staff Name</label>
            <input
              value={staffName}
              onChange={event => setStaffName(event.target.value)}
              className="form-input"
              placeholder="First Last"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
          </div>
          <div>
            <label className="form-label">Password</label>
            <input
              type="password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              className="form-input"
              placeholder="Role password"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !isOnline}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-bold text-white shadow-lg transition hover:brightness-95 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
            style={{ backgroundColor: 'var(--primary-color)', boxShadow: '0 18px 32px rgba(var(--primary-color-rgb), 0.2)' }}
          >
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <UserCheck size={16} />}
            {submitting ? 'Starting shift...' : 'Start Shift'}
          </button>
          <div className="flex items-start gap-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/70 dark:text-slate-400">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-primary-500" />
            <p>The main account opens as Admin. Teachers and other staff should use their registered name and password.</p>
          </div>
          </form>
        </div>
      </section>
      </div>
    </div>
  );
}
