import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, CreditCard, LogOut, RefreshCw, Clock, MessageCircle, Phone } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubscriptionAccessState, SubscriptionAccessState, PLAN_DEFINITIONS } from '../utils/plans';
import { supabase } from '../lib/supabase';

// Routes always accessible regardless of subscription
const ALLOWED_ROUTES = ['/plans', '/subscribe', '/login'];

// localStorage keys for offline cache
const OFFLINE_EXPIRY_KEY   = 'schofy_sub_expiry';
const OFFLINE_STATUS_KEY   = 'schofy_sub_status';
const OFFLINE_PLAN_KEY     = 'schofy_sub_plan';
const OFFLINE_PENDING_KEY  = 'schofy_sub_pending'; // payment submitted but not yet approved

export function cacheSubscriptionLocally(state: SubscriptionAccessState, pending = false) {
  if (state.expiryDate) localStorage.setItem(OFFLINE_EXPIRY_KEY, state.expiryDate);
  localStorage.setItem(OFFLINE_STATUS_KEY, state.status);
  localStorage.setItem(OFFLINE_PLAN_KEY, state.selectedPlanId || '');
  localStorage.setItem(OFFLINE_PENDING_KEY, pending ? '1' : '0');
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

type BlockReason = 'expired' | 'incomplete' | 'pending' | 'paused';

interface Props { children: React.ReactNode; }

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

  const isAllowedRoute = ALLOWED_ROUTES.some(r => location.pathname.startsWith(r));

  const checkSubscription = useCallback(async () => {
    if (!user) { setChecking(false); return; }
    if (isAllowedRoute) { setBlocked(false); setChecking(false); return; }

    const tenantId = schoolId || user.id;

    try {
      // Check Supabase for latest subscription row
      let isPaused  = false;
      let isPending = false;
      let tid: string | null = null;

      if (supabase) {
        const { data: subRows } = await supabase
          .from('subscriptions')
          .select('status, ends_at, metadata, plan')
          .eq('school_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(1);

        const sub = subRows?.[0];
        if (sub) {
          const meta = sub.metadata || {};
          isPaused  = sub.status === 'paused';
          isPending = sub.status === 'pending' || (meta.source === 'client' && !meta.approvedByAdmin && !meta.grantedByAdmin && !meta.extendedByAdmin && sub.status !== 'active');
          tid = meta.transactionId || null;

          // Also check if ends_at is in the past and status was set to paused by admin
          if (!isPaused && meta.pausedByAdmin) isPaused = true;
        }
      }

      const state = await getSubscriptionAccessState(tenantId, undefined, { authUserId: user.id });

      // Cache for offline
      cacheSubscriptionLocally(state, isPending);
      if (tid) localStorage.setItem('schofy_sub_tid', tid);

      if (isPaused) {
        setBlocked(true); setBlockReason('paused');
        setPlanName(state.plan?.name || null);
        setExpiryDate(state.expiryDate);
        setPendingTid(null);
      } else if (isPending) {
        setBlocked(true); setBlockReason('pending');
        setPlanName(state.plan?.name || PLAN_DEFINITIONS.find(p => p.id === localStorage.getItem(OFFLINE_PLAN_KEY))?.name || null);
        setPendingTid(tid || localStorage.getItem('schofy_sub_tid'));
        setExpiryDate(null);
      } else if (state.status === 'expired' || state.status === 'incomplete') {
        setBlocked(true);
        setBlockReason(state.status as BlockReason);
        setPlanName(state.plan?.name || null);
        setExpiryDate(state.expiryDate);
        setPendingTid(null);
      } else {
        setBlocked(false);
        setPendingTid(null);
      }
    } catch {
      // Offline fallback
      const { blocked, reason, planId, pending } = getOfflineStatus();
      if (blocked || pending) {
        setBlocked(true);
        setBlockReason(reason);
        setPlanName(planId ? (PLAN_DEFINITIONS.find(p => p.id === planId)?.name || planId) : null);
        setExpiryDate(localStorage.getItem(OFFLINE_EXPIRY_KEY));
        setPendingTid(pending ? localStorage.getItem('schofy_sub_tid') : null);
      } else {
        setBlocked(false);
      }
    } finally {
      setChecking(false);
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

  // WhatsApp message with receipt details
  const whatsappMsg = () => {
    const plan = planName || 'Unknown';
    const tid  = pendingTid || 'N/A';
    const school = user?.email || 'Unknown school';
    const msg = `Hello Schofy Admin,\n\nPayment submitted for verification:\nSchool: ${school}\nPlan: ${plan}\nTransaction ID: ${tid}\n\nPlease verify and activate my subscription.\n\nThank you.`;
    return `https://wa.me/256750034304?text=${encodeURIComponent(msg)}`;
  };

  if (checking) return <>{children}</>;

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
  };

  const cfg = headerConfig[blockReason];

  return (
    <>
      {children}
      {blocked && !isAllowedRoute && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/75 backdrop-blur-md flex items-center justify-center p-4">
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

              {/* Paused */}
              {blockReason === 'paused' && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  Your access has been suspended. Contact the Schofy admin to restore access.
                </div>
              )}

              {/* Payment instructions for expired/incomplete */}
              {(blockReason === 'expired' || blockReason === 'incomplete') && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-700 space-y-1">
                  <p className="font-semibold">How to renew:</p>
                  <p>1. Send payment via Airtel Money to <strong>0750034304</strong></p>
                  <p>2. Go to Plans page and enter your Transaction ID</p>
                  <p>3. Admin will verify and activate within 24 hours</p>
                </div>
              )}

              {/* Action buttons */}
              <div className="space-y-2 pt-1">
                {/* Plans page — only for expired/incomplete */}
                {(blockReason === 'expired' || blockReason === 'incomplete') && (
                  <button
                    onClick={() => navigate('/plans')}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                  >
                    <CreditCard size={18} />
                    {blockReason === 'expired' ? 'Renew Subscription' : 'Choose a Plan'}
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

                {/* Phone */}
                <a
                  href="tel:0775011029"
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <Phone size={16} />
                  Call: 0775011029
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
                Schofy · 0750034304 · 0775011029
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
