import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, CreditCard, LogOut, RefreshCw, Clock, MessageCircle, Phone, KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cachePlanStateLocally, getSubscriptionAccessState, SubscriptionAccessState, PLAN_DEFINITIONS } from '../utils/plans';
import { supabase } from '../lib/supabase';
import { cacheReady } from '../lib/database/SupabaseDataService';
import { createVerifiedPlanProof, readVerifiedPlanProof, restoreVerifiedPlanProof } from '../utils/planProof';
import { redeemPaymentVerificationCode } from '../utils/paymentVerification';
import { isUnlockedRelease } from '../utils/releaseChannel';

// Routes always accessible regardless of subscription
const ALLOWED_ROUTES = ['/plans', '/subscribe', '/login'];

// localStorage keys for offline cache
const OFFLINE_EXPIRY_KEY   = 'schofy_sub_expiry';
const OFFLINE_STATUS_KEY   = 'schofy_sub_status';
const OFFLINE_PLAN_KEY     = 'schofy_sub_plan';
const OFFLINE_PENDING_KEY  = 'schofy_sub_pending'; // payment submitted but not yet approved

export function cacheSubscriptionLocally(state: SubscriptionAccessState, pending = false) {
  const hasActiveCurrentPlan = state.status === 'active' || state.status === 'expiring';
  if (!pending) {
    if (state.expiryDate) localStorage.setItem(OFFLINE_EXPIRY_KEY, state.expiryDate);
    if (state.status) localStorage.setItem(OFFLINE_STATUS_KEY, state.status);
    if (state.selectedPlanId) localStorage.setItem(OFFLINE_PLAN_KEY, state.selectedPlanId);
    localStorage.setItem(OFFLINE_PENDING_KEY, '0');
  } else {
    if (hasActiveCurrentPlan) {
      if (state.expiryDate) localStorage.setItem(OFFLINE_EXPIRY_KEY, state.expiryDate);
      if (state.status) localStorage.setItem(OFFLINE_STATUS_KEY, state.status);
      if (state.selectedPlanId) localStorage.setItem(OFFLINE_PLAN_KEY, state.selectedPlanId);
    }
    localStorage.setItem(OFFLINE_PENDING_KEY, '1');
  }
  const tenantId = localStorage.getItem('schofy_current_school_id') || localStorage.getItem('schofy_current_user_id') || '';
  if (tenantId && !(pending && hasActiveCurrentPlan)) cachePlanStateLocally(tenantId, state, pending);
}

function getOfflineStatus(): { blocked: boolean; reason: BlockReason; planId: string | null; pending: boolean } {
  const expiryIso = localStorage.getItem(OFFLINE_EXPIRY_KEY);
  const status    = localStorage.getItem(OFFLINE_STATUS_KEY) || 'incomplete';
  const planId    = localStorage.getItem(OFFLINE_PLAN_KEY) || null;
  const pending   = localStorage.getItem(OFFLINE_PENDING_KEY) === '1';

  if (pending) return { blocked: true, reason: 'pending', planId, pending: true };

  if (!expiryIso) {
    const blocked = status === 'expired' || status === 'incomplete';
    return { blocked, reason: status === 'expired' ? 'expired' : 'incomplete', planId, pending: false };
  }

  const expiry  = new Date(expiryIso);
  const expired = isNaN(expiry.getTime()) || expiry.getTime() <= Date.now();
  return {
    blocked: expired,
    reason: expired ? 'expired' : 'active' as any,
    planId,
    pending: false,
  };
}

type BlockReason = 'expired' | 'incomplete' | 'pending' | 'paused' | 'limit';

interface Props { children: React.ReactNode; }

function classifyRemoteExpiry(expiryIso: string | null): Pick<SubscriptionAccessState, 'status' | 'daysRemaining' | 'expiryDate'> {
  if (!expiryIso) return { status: 'incomplete', daysRemaining: null, expiryDate: null };
  const expiry = new Date(expiryIso);
  if (Number.isNaN(expiry.getTime())) return { status: 'incomplete', daysRemaining: null, expiryDate: null };
  const ms = expiry.getTime() - Date.now();
  if (ms <= 0) return { status: 'expired', daysRemaining: 0, expiryDate: expiry.toISOString() };
  const days = Math.ceil(ms / (24 * 60 * 60 * 1000));
  return { status: days <= 14 ? 'expiring' : 'active', daysRemaining: days, expiryDate: expiry.toISOString() };
}

function hasAdminApproval(meta: Record<string, any>) {
  return Boolean(meta.approvedByAdmin || meta.grantedByAdmin || meta.extendedByAdmin || meta.approvedByCode);
}

export default function SubscriptionGate({ children }: Props) {
  const { user, schoolId, logout } = useAuth();
  const navigate  = useNavigate();
  const location  = useLocation();

  const [blocked,     setBlocked]     = useState(false);
  const [blockReason, setBlockReason] = useState<BlockReason>('incomplete');
  const [planName,    setPlanName]    = useState<string | null>(null);
  const [expiryDate,  setExpiryDate]  = useState<string | null>(null);
  const [pendingTid,  setPendingTid]  = useState<string | null>(null);
  const [checking,    setChecking]    = useState(true);
  const [checkProgress, setCheckProgress] = useState(0);
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verificationNotice, setVerificationNotice] = useState<{ type: 'success' | 'error'; message: string; reason?: string } | null>(null);

  const isAllowedRoute = ALLOWED_ROUTES.some(r => location.pathname.startsWith(r));

  const checkSubscription = useCallback(async () => {
    setCheckProgress(18);
    if (!user) { setChecking(false); return; }
    if (isUnlockedRelease) {
      const state = await getSubscriptionAccessState(schoolId || user.id, undefined, { authUserId: user.id });
      cacheSubscriptionLocally(state, false);
      setPlanName(state.plan?.name || 'Unlimited');
      setExpiryDate(state.expiryDate);
      setPendingTid(null);
      setBlocked(false);
      setBlockReason('incomplete');
      setCheckProgress(100);
      setChecking(false);
      return;
    }
    if (isAllowedRoute) { setBlocked(false); setChecking(false); return; }
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;

    // Wait briefly for IndexedDB, but never let offline startup hang on secure access.
    await Promise.race([
      cacheReady,
      new Promise((resolve) => setTimeout(resolve, online ? 1500 : 250)),
    ]);
    setCheckProgress(55);

    const tenantId = schoolId || user.id;

    // Always read local cache first — works 100% offline
    let state = await getSubscriptionAccessState(tenantId, undefined, { authUserId: user.id });

    const applyLocalState = (
      pendingFlag = localStorage.getItem(OFFLINE_PENDING_KEY) === '1',
      options: { enforcePlanLimit?: boolean } = {}
    ) => {
      const enforcePlanLimit = options.enforcePlanLimit ?? true;
      const hasActiveCurrentPlan = state.status === 'active' || state.status === 'expiring';
      const pending = pendingFlag && !hasActiveCurrentPlan;
      cacheSubscriptionLocally(state, pendingFlag);
      setPlanName(state.plan?.name || null);
      setExpiryDate(state.expiryDate);
      setPendingTid(null);

      if (pending) {
        setBlocked(true);
        setBlockReason('pending');
        setPendingTid(localStorage.getItem('schofy_sub_tid'));
      } else if (state.status === 'expired' || state.status === 'incomplete') {
        setBlocked(true);
        setBlockReason(state.status as BlockReason);
      } else if (enforcePlanLimit && state.plan && state.used > state.plan.studentLimit) {
        setBlocked(true);
        setBlockReason('limit');
      } else {
        setBlocked(false);
      }
    };

    if (!online) {
      const proof = await readVerifiedPlanProof(tenantId);
      if (!proof) {
        setBlocked(true);
        setBlockReason('incomplete');
        setPlanName(null);
        setExpiryDate(null);
        setPendingTid(null);
        setCheckProgress(100);
        setChecking(false);
        return;
      }
      await restoreVerifiedPlanProof(tenantId);
      state = await getSubscriptionAccessState(tenantId, undefined, { authUserId: user.id });
      applyLocalState(false, { enforcePlanLimit: false });
      setCheckProgress(100);
      setChecking(false);
      return;
    }

    try {
      // Check Supabase for latest subscription row (online only)
      let isPaused  = false;
      let isPending = false;
      let tid: string | null = null;

      if (supabase && online) {
        setCheckProgress(72);
        const { data: subRows } = await supabase
          .from('subscriptions')
          .select('status, ends_at, metadata, plan')
          .eq('school_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(1);

        const sub = subRows?.[0];
        if (sub) {
          const meta = sub.metadata || {};
          const adminApproved = hasAdminApproval(meta);
          isPaused  = sub.status === 'paused';
          isPending = sub.status === 'pending' || !adminApproved;
          tid = meta.transactionId || null;
          if (!isPaused && meta.pausedByAdmin) isPaused = true;

          if (!isPaused && !isPending && sub.status === 'active' && adminApproved) {
            const isFreeTier = meta.accessType === 'free_trial' || meta.requestType === 'trial' || sub.plan === 'trial';
            const remotePlan = PLAN_DEFINITIONS.find(p => p.id === sub.plan) || (isFreeTier || meta.grantedByAdmin || meta.approvedByAdmin ? PLAN_DEFINITIONS[0] : null);
            const remoteExpiry = classifyRemoteExpiry(sub.ends_at || null);
            if (remotePlan) {
              if (remoteExpiry.expiryDate && (remoteExpiry.status === 'active' || remoteExpiry.status === 'expiring')) {
                const verifiedAt = meta.activatedAt || meta.approvedAt || meta.grantedAt || meta.extendedAt || new Date().toISOString();
                await createVerifiedPlanProof({
                  tenantId,
                  schofy_sub_expiry: remoteExpiry.expiryDate,
                  schofy_sub_status: remoteExpiry.status,
                  schofy_sub_plan: remotePlan.id,
                  schofy_sub_pending: '0',
                  remoteVerifiedAt: String(verifiedAt),
                  verificationCodeHash: typeof meta.verificationCodeHash === 'string' ? meta.verificationCodeHash : undefined,
                  source: meta.approvedByCode ? 'verification_code' : 'remote_subscription',
                });
              }
              state = {
                ...state,
                plan: remotePlan,
                selectedPlanId: remotePlan.id,
                expiryDate: remoteExpiry.expiryDate,
                status: remoteExpiry.status,
                daysRemaining: remoteExpiry.daysRemaining,
                remaining: Math.max(0, remotePlan.studentLimit - state.used),
                eligible: state.used < remotePlan.studentLimit && (remoteExpiry.status === 'active' || remoteExpiry.status === 'expiring'),
                requiresPlanAction: remoteExpiry.status === 'expired' || remoteExpiry.status === 'incomplete',
              };
            }
          }
        } else {
          const hasActiveCachedPlan = state.status === 'active' || state.status === 'expiring';
          if (!hasActiveCachedPlan) {
            state = {
              ...state,
              status: 'incomplete',
              eligible: false,
              remaining: 0,
              requiresPlanAction: true,
            };
          }
        }
      }

      // Cache for offline
      setCheckProgress(90);
      const hasActiveCurrentPlan = state.status === 'active' || state.status === 'expiring';
      cacheSubscriptionLocally(state, isPending);
      if (tid) localStorage.setItem('schofy_sub_tid', tid);

      if (isPaused) {
        setBlocked(true); setBlockReason('paused');
        setPlanName(state.plan?.name || null);
        setExpiryDate(state.expiryDate);
        setPendingTid(null);
      } else if (isPending) {
        setBlocked(!hasActiveCurrentPlan);
        setBlockReason(hasActiveCurrentPlan ? 'incomplete' : 'pending');
        setPlanName(state.plan?.name || PLAN_DEFINITIONS.find(p => p.id === localStorage.getItem(OFFLINE_PLAN_KEY))?.name || null);
        setPendingTid(hasActiveCurrentPlan ? null : tid || localStorage.getItem('schofy_sub_tid'));
        setExpiryDate(state.expiryDate);
      } else if (state.status === 'expired' || state.status === 'incomplete') {
        setBlocked(true);
        setBlockReason(state.status as BlockReason);
        setPlanName(state.plan?.name || null);
        setExpiryDate(state.expiryDate);
        setPendingTid(null);
      } else if (state.plan && state.used > state.plan.studentLimit) {
        setBlocked(true);
        setBlockReason('limit');
        setPlanName(state.plan.name);
        setExpiryDate(state.expiryDate);
        setPendingTid(null);
      } else {
        setBlocked(false);
        setPendingTid(null);
      }
    } catch {
      // Offline — use the local state we already loaded above
      applyLocalState(localStorage.getItem(OFFLINE_PENDING_KEY) === '1', { enforcePlanLimit: online });
    } finally {
      setCheckProgress(100);
      setTimeout(() => setChecking(false), 120);
    }
  }, [user, schoolId, isAllowedRoute]);

  useEffect(() => { checkSubscription(); }, [checkSubscription, location.pathname]);

  // Re-check on window focus (catches time passing in background)
  useEffect(() => {
    const onFocus = () => checkSubscription();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkSubscription]);

  const handleLogout = async () => { await logout(); navigate('/login'); };

  const handleVerifyCode = async () => {
    const tenantId = schoolId || user?.id;
    if (!tenantId || verifyingCode) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setVerificationNotice({
        type: 'error',
        message: 'Connect to the internet to verify a new code.',
        reason: 'Your already verified plan stays saved for offline access, but plan changes and first-time code verification require internet.',
      });
      return;
    }
    setVerifyingCode(true);
    setVerificationNotice(null);
    try {
      const result = await redeemPaymentVerificationCode(tenantId, user?.id, verificationCode);
      if (result.status === 'valid') {
        setVerificationCode('');
        setVerificationNotice({ type: 'success', message: `${result.message} Redirecting to dashboard...` });
        setChecking(true);
        await checkSubscription();
        window.setTimeout(() => navigate('/'), 900);
        return;
      }
      const reason =
        result.status === 'used'
          ? 'This code was used before. One-time codes cannot be reused.'
          : result.status === 'terminated'
            ? 'This code was stopped by the admin.'
            : result.status === 'invalid'
              ? 'The code may be wrongly typed, incomplete, or not from Schofy.'
              : 'Connect to internet and try again, or contact admin.';
      setVerificationNotice({ type: 'error', message: result.message, reason });
    } finally {
      setVerifyingCode(false);
    }
  };

  // WhatsApp message with receipt details
  const whatsappMsg = () => {
    const plan = planName || 'Unknown';
    const tid  = pendingTid || 'N/A';
    const school = user?.email || 'Unknown school';
    const msg = `Hello Schofy Support,\n\nPayment submitted for verification:\nSchool: ${school}\nPlan: ${plan}\nTransaction ID: ${tid}\n\nPayment via Airtel Money (0750034304) or MTN MoMo (0775011029).\n\nPlease verify and activate my subscription.\n\nThank you.`;
    return `https://wa.me/256750034304?text=${encodeURIComponent(msg)}`;
  };

  if (checking && !isAllowedRoute) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
        <div className="w-full max-w-sm rounded-2xl border bg-white p-6 text-center shadow-xl dark:bg-slate-900" style={{ borderColor: 'rgba(45, 163, 45, 0.35)' }}>
          <RefreshCw size={30} className="mx-auto mb-3 animate-spin" style={{ color: 'var(--solid-emerald)' }} />
          <p className="text-sm font-semibold" style={{ color: 'var(--solid-emerald)' }}>Checking secure access...</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Verifying your plan, account status, and device sync.</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full rounded-full transition-all duration-150" style={{ width: `${checkProgress}%`, backgroundColor: 'var(--solid-emerald)' }} />
          </div>
        </div>
      </div>
    );
  }

  const headerConfig: Record<BlockReason, { gradient: string; icon: React.ReactNode; title: string; subtitle: string }> = {
    expired: {
      gradient: 'from-red-500 to-orange-500',
      icon: <AlertTriangle size={32} className="text-white" />,
      title: 'Subscription Expired',
      subtitle: 'Your plan has expired. Renew to continue using Schofy.',
    },
    incomplete: {
      gradient: 'from-slate-600 to-slate-800',
      icon: <CreditCard size={32} className="text-white" />,
      title: 'No Active Subscription',
      subtitle: 'Choose a plan to start using Schofy.',
    },
    pending: {
      gradient: 'from-amber-500 to-orange-500',
      icon: <Clock size={32} className="text-white" />,
      title: 'Awaiting Verification',
      subtitle: 'Your payment is being verified by the Schofy admin. Access will be granted within 24 hours.',
    },
    paused: {
      gradient: 'from-red-600 to-red-800',
      icon: <AlertTriangle size={32} className="text-white" />,
      title: 'Access Paused',
      subtitle: 'Your access has been paused by the admin. Contact support to resolve.',
    },
    limit: {
      gradient: 'from-purple-600 to-indigo-700',
      icon: <AlertTriangle size={32} className="text-white" />,
      title: 'Plan Limit Exceeded',
      subtitle: 'Your school has more students than the current plan allows. Upgrade before continuing.',
    },
  };

  const cfg = headerConfig[blockReason];

  return (
    <>
      {children}
      {blocked && !isAllowedRoute && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-in">

            {/* Coloured header */}
            <div className={`bg-gradient-to-r ${cfg.gradient} p-6 text-white text-center`}>
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                {cfg.icon}
              </div>
              <h2 className="text-xl font-bold">{cfg.title}</h2>
              <p className="text-white/80 text-sm mt-1">{cfg.subtitle}</p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-3">

              {/* Expired: show expiry date */}
              {blockReason === 'expired' && expiryDate && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <span className="font-medium">Expired on:</span>{' '}
                  {new Date(expiryDate).toLocaleDateString('en-UG', { year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              )}

              {/* Plan name */}
              {planName && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 flex justify-between">
                  <span className="font-medium">Plan</span>
                  <span>{planName}</span>
                </div>
              )}

              {/* Pending: show TID */}
              {blockReason === 'pending' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1">
                  <p className="text-xs font-semibold text-amber-800">Payment submitted — pending admin approval</p>
                  {pendingTid && (
                    <p className="text-xs text-amber-700">
                      Transaction ID: <span className="font-mono font-bold">{pendingTid}</span>
                    </p>
                  )}
                  <p className="text-xs text-amber-600">Activation within 24 hours after verification.</p>
                </div>
              )}

              {blockReason === 'pending' && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-left">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
                    <KeyRound size={16} className="text-emerald-600" />
                    Verification code
                  </h3>
                  <p className="mt-1 text-xs text-slate-600">
                    Already received your one-time Schofy code? Enter it here to activate immediately.
                  </p>
                  <div className="mt-3 flex gap-2">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(event) => setVerificationCode(event.target.value)}
                      onKeyDown={(event) => { if (event.key === 'Enter') void handleVerifyCode(); }}
                      placeholder="Enter verification code"
                      className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyCode()}
                      disabled={verifyingCode}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
                    >
                      {verifyingCode ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
                      Verify
                    </button>
                  </div>
                  {verificationNotice && (
                    <div className={`mt-3 rounded-lg border px-3 py-2 text-xs ${
                      verificationNotice.type === 'success'
                        ? 'border-emerald-200 bg-white text-emerald-700'
                        : 'border-red-200 bg-red-50 text-red-700'
                    }`}>
                      <p className="font-semibold">{verificationNotice.message}</p>
                      {verificationNotice.reason && <p className="mt-0.5">{verificationNotice.reason}</p>}
                    </div>
                  )}
                </div>
              )}

              {/* Paused */}
              {blockReason === 'paused' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  Your access has been suspended. Contact the Schofy admin to restore access.
                </div>
              )}

              {/* Payment instructions for expired/incomplete */}
              {(blockReason === 'expired' || blockReason === 'incomplete' || blockReason === 'limit') && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700 space-y-1">
                  <p className="font-semibold">{blockReason === 'limit' ? 'How to restore access:' : 'How to renew:'}</p>
                  <p>1. Send payment via <strong>Airtel Money: 0750034304</strong> or <strong>MTN MoMo: 0775011029</strong></p>
                  <p>2. Go to Plans page and enter your Transaction ID</p>
                  <p>3. Admin will verify and activate within 24 hours</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {/* Plans page — only for expired/incomplete */}
                {(blockReason === 'expired' || blockReason === 'incomplete' || blockReason === 'limit') && (
                  <button
                    onClick={() => navigate('/plans')}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <CreditCard size={18} />
                    {blockReason === 'limit' ? 'Upgrade Plan' : blockReason === 'expired' ? 'Renew Subscription' : 'Choose a Plan'}
                  </button>
                )}

                {/* WhatsApp — always shown */}
                <a
                  href={whatsappMsg()}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <MessageCircle size={18} />
                  WhatsApp Admin
                </a>

                {/* Phone — Airtel */}
                <a
                  href="tel:0750034304"
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <Phone size={16} />
                  Airtel: 0750034304
                </a>

                {/* Phone — MTN */}
                <a
                  href="tel:0775011029"
                  className="w-full py-2.5 bg-yellow-50 hover:bg-yellow-100 text-yellow-800 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm border border-yellow-200"
                >
                  <Phone size={16} />
                  MTN: 0775011029
                </a>

                {/* Check again */}
                <button
                  onClick={() => { setChecking(true); checkSubscription(); }}
                  className="w-full py-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <RefreshCw size={15} />
                  Check Again
                </button>

                {/* Sign out */}
                <button
                  onClick={handleLogout}
                  className="w-full py-2 text-slate-400 hover:text-red-600 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <LogOut size={15} />
                  Sign Out
                </button>
              </div>
            </div>

            <div className="px-6 pb-4 text-center">
              <p className="text-xs text-slate-400">
                Schofy · Airtel: 0750034304 · MTN: 0775011029
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
