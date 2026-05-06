import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useLocation } from 'react-router-dom';
import { AlertTriangle, CreditCard, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getSubscriptionAccessState, SubscriptionAccessState } from '../utils/plans';

// Routes that are always accessible regardless of subscription status
const ALLOWED_ROUTES = ['/plans', '/subscribe', '/login'];

// localStorage key for offline expiry cache
const OFFLINE_EXPIRY_KEY = 'schofy_sub_expiry';
const OFFLINE_STATUS_KEY = 'schofy_sub_status';
const OFFLINE_PLAN_KEY = 'schofy_sub_plan';

export function cacheSubscriptionLocally(state: SubscriptionAccessState) {
  if (state.expiryDate) {
    localStorage.setItem(OFFLINE_EXPIRY_KEY, state.expiryDate);
  }
  localStorage.setItem(OFFLINE_STATUS_KEY, state.status);
  localStorage.setItem(OFFLINE_PLAN_KEY, state.selectedPlanId || '');
}

function getOfflineSubscriptionStatus(): { expired: boolean; status: string; planId: string | null } {
  const expiryIso = localStorage.getItem(OFFLINE_EXPIRY_KEY);
  const status = localStorage.getItem(OFFLINE_STATUS_KEY) || 'incomplete';
  const planId = localStorage.getItem(OFFLINE_PLAN_KEY) || null;

  if (!expiryIso) {
    return { expired: status === 'expired' || status === 'incomplete', status, planId };
  }

  const expiry = new Date(expiryIso);
  const expired = isNaN(expiry.getTime()) || expiry.getTime() <= Date.now();
  return { expired, status: expired ? 'expired' : status, planId };
}

interface Props {
  children: React.ReactNode;
}

export default function SubscriptionGate({ children }: Props) {
  const { user, schoolId, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [blocked, setBlocked] = useState(false);
  const [blockReason, setBlockReason] = useState<'expired' | 'incomplete' | 'unauthorized'>('incomplete');
  const [planName, setPlanName] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  const isAllowedRoute = ALLOWED_ROUTES.some(r => location.pathname.startsWith(r));

  const checkSubscription = useCallback(async () => {
    if (!user) { setChecking(false); return; }
    if (isAllowedRoute) { setBlocked(false); setChecking(false); return; }

    const tenantId = schoolId || user.id;

    try {
      const state = await getSubscriptionAccessState(tenantId, undefined, { authUserId: user.id });

      // Cache for offline use
      cacheSubscriptionLocally(state);

      if (state.status === 'expired' || state.status === 'incomplete') {
        setBlocked(true);
        setBlockReason(state.status);
        setPlanName(state.plan?.name || null);
        setExpiryDate(state.expiryDate);
      } else {
        setBlocked(false);
      }
    } catch {
      // Offline — use cached expiry
      const { expired, status, planId } = getOfflineSubscriptionStatus();
      if (expired) {
        setBlocked(true);
        setBlockReason(status === 'incomplete' ? 'incomplete' : 'expired');
        setPlanName(planId);
        setExpiryDate(localStorage.getItem(OFFLINE_EXPIRY_KEY));
      } else {
        setBlocked(false);
      }
    } finally {
      setChecking(false);
    }
  }, [user, schoolId, isAllowedRoute]);

  useEffect(() => {
    checkSubscription();
  }, [checkSubscription, location.pathname]);

  // Also check on every app focus (catches time passing while app was in background)
  useEffect(() => {
    const onFocus = () => checkSubscription();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [checkSubscription]);

  const handleGoToPlans = () => {
    navigate('/plans');
  };

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  if (checking) return <>{children}</>;

  return (
    <>
      {children}
      {blocked && !isAllowedRoute && createPortal(
        <div className="fixed inset-0 z-[99999] bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-red-500 to-orange-500 p-6 text-white text-center">
              <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-3">
                <AlertTriangle size={32} className="text-white" />
              </div>
              <h2 className="text-xl font-bold">
                {blockReason === 'expired' ? 'Subscription Expired' : 'No Active Subscription'}
              </h2>
              <p className="text-red-100 text-sm mt-1">
                {blockReason === 'expired'
                  ? 'Your plan has expired. Renew to continue using Schofy.'
                  : 'You need an active subscription to access Schofy.'}
              </p>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              {blockReason === 'expired' && expiryDate && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                  <span className="font-medium">Expired on:</span>{' '}
                  {new Date(expiryDate).toLocaleDateString('en-UG', {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}
                </div>
              )}

              {planName && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700">
                  <span className="font-medium">Plan:</span> {planName}
                </div>
              )}

              <p className="text-sm text-slate-600 text-center">
                Contact <strong>0750034304</strong> via Airtel Money to renew, then submit your Transaction ID on the Plans page.
              </p>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={handleGoToPlans}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <CreditCard size={18} />
                  {blockReason === 'expired' ? 'Renew Subscription' : 'Choose a Plan'}
                </button>

                <button
                  onClick={() => checkSubscription()}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <RefreshCw size={16} />
                  Check Again
                </button>

                <button
                  onClick={handleLogout}
                  className="w-full py-2.5 text-slate-500 hover:text-red-600 rounded-xl font-medium flex items-center justify-center gap-2 transition-all text-sm"
                >
                  <LogOut size={16} />
                  Sign Out
                </button>
              </div>
            </div>

            {/* Footer note */}
            <div className="px-6 pb-4 text-center">
              <p className="text-xs text-slate-400">
                Activation within 24 hours after payment verification by Schofy admin.
              </p>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
