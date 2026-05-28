import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';

import { Check, CreditCard, Crown, Zap, Shield, Star, Download, HelpCircle, Phone, X, AlertTriangle, MessageCircle, ChevronDown, ChevronUp, Loader2, Clock, ArrowLeft, KeyRound, ShieldCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_DEFINITIONS, PlanDefinition, SubscriptionAccessState, cachePlanStateLocally, getCurrentBillingCycle, getLatestReceipt, getSubscriptionAccessState, hasSeenPlanIntro, markPlanIntroSeen } from '../utils/plans';
import { SuccessPopup } from '../components/SuccessPopup';
import { supabase } from '../lib/supabase';
import { isDesktopApp } from '../utils/desktopSyncPreference';
import { redeemPaymentVerificationCode } from '../utils/paymentVerification';

const faqs = [
  { q: 'How does the student limit work?', a: 'Your plan determines max enrolled students. Reach the limit to upgrade before adding more.' },
  { q: 'Can I switch plans?', a: 'Yes. Your current plan stays active while the new plan waits for admin approval.' },
  { q: 'How do I buy Unlimited?', a: 'Contact Us to arrange the one-time desktop version. It gives unlimited student access after approval.' },
  { q: 'Payment methods?', a: 'Airtel Money only. Activation within 24 hours.' },
  { q: 'Refunds?', a: 'No, all payments are non-refundable.' },
];

const UGX_RATE = 3800;
const MIN_PLANS_LOADING_MS = 2000;
type PlanCurrency = 'USD' | 'UGX';

function getStoredPlanId() {
  return localStorage.getItem('schofy_sub_plan') || localStorage.getItem('schofy_pending_plan') || null;
}

export default function Plans() {
  const { user, schoolId, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const authId = schoolId || user?.id || '';
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'term' | 'yearly'>('term');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [showFAQModal, setShowFAQModal] = useState(false);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [studentCount, setStudentCount] = useState(0);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeToPlan, setUpgradeToPlan] = useState<PlanDefinition | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [isSubmitting, setIsRefreshing] = useState(false);
  const [checkingAccess, setCheckingAccess] = useState(false);
  const [accessProgress, setAccessProgress] = useState(0);
  const [accessNotice, setAccessNotice] = useState<{ type: 'success' | 'pending' | 'paused' | 'error' | 'info'; message: string } | null>(null);
  const [accessPopup, setAccessPopup] = useState<{ title: string; message: string; days: number | null; canProceed: boolean } | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verifyingCode, setVerifyingCode] = useState(false);
  const [verificationPopup, setVerificationPopup] = useState<{
    status: 'verifying' | 'success' | 'failed';
    title: string;
    message: string;
    reason?: string;
    canProceed?: boolean;
  } | null>(null);
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(() => getStoredPlanId());
  const [accessState, setAccessState] = useState<SubscriptionAccessState | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<Awaited<ReturnType<typeof getLatestReceipt>>>(null);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialRequested, setTrialRequested] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewPlan, setRenewPlan] = useState<typeof PLAN_DEFINITIONS[0] | null>(null);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [planCurrency, setPlanCurrency] = useState<PlanCurrency>(() => (localStorage.getItem('schofy_plan_currency') === 'UGX' ? 'UGX' : 'USD'));
  const [initialPlansLoading, setInitialPlansLoading] = useState(() => authLoading || Boolean(authId));

  useEffect(() => {
    if (authLoading) {
      setInitialPlansLoading(true);
      return;
    }

    if (!authId) {
      setInitialPlansLoading(false);
      return;
    }

    let cancelled = false;
    const startedAt = Date.now();

    setInitialPlansLoading(true);
    void (async () => {
      await loadPlanState();
      if (cancelled) return;

      const remaining = Math.max(0, MIN_PLANS_LOADING_MS - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (cancelled) return;
        setInitialPlansLoading(false);
      }, remaining);
    })();

    return () => {
      cancelled = true;
    };
  }, [authId, authLoading]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('schofy_plan_currency', planCurrency);
  }, [planCurrency]);

  async function loadPlanState(showLoader = false) {
    const authId = schoolId || user?.id;
    if (!authId) return;
    if (showLoader) {
      setCheckingAccess(true);
      setAccessProgress(20);
      setAccessNotice(null);
      setAccessPopup(null);
    }
    try {
      if (showLoader) setAccessProgress(55);
      const [savedBillingCycle, usage, receipt] = await Promise.all([
        getCurrentBillingCycle(authId),
        getSubscriptionAccessState(authId, undefined, { authUserId: user?.id }),
        getLatestReceipt(authId),
        hasSeenPlanIntro(authId),
      ]);

      let effectiveUsage = usage;
      if (supabase && isOnline) {
        let rows: any[] | null = null;
        let cloudUnavailable = false;
        try {
          const result = await supabase
            .from('subscriptions')
            .select('status, ends_at, metadata, plan')
            .eq('school_id', authId)
            .order('updated_at', { ascending: false })
            .limit(1);
          rows = result.data || null;
          if (result.error) throw result.error;
        } catch (cloudError) {
          cloudUnavailable = true;
          console.warn('Plan cloud check unavailable; using offline plan cache.', cloudError);
          if (showLoader) {
            setAccessNotice({
              type: 'info',
              message: 'Cloud access check is unavailable. Plans are still available offline using your local subscription cache.',
            });
          }
        }
        const sub = rows?.[0];
        const meta = sub?.metadata || {};
        const approved = Boolean(meta.approvedByAdmin || meta.grantedByAdmin || meta.extendedByAdmin || meta.approvedByCode);
        const pending = sub?.status === 'pending' || (meta.source === 'client' && !approved && sub?.status !== 'active');
        const paused = sub?.status === 'paused' || meta.pausedByAdmin;
        const isFreeTier = meta.accessType === 'free_trial' || meta.requestType === 'trial' || sub?.plan === 'trial';
        const plan = PLAN_DEFINITIONS.find(p => p.id === sub?.plan) || (isFreeTier || approved ? PLAN_DEFINITIONS[0] : null);
        if (sub && pending) {
          const hasActiveCurrentPlan = usage.status === 'active' || usage.status === 'expiring';
          localStorage.setItem('schofy_sub_pending', '1');
          if (plan) {
            localStorage.setItem('schofy_pending_plan', plan.id);
            localStorage.setItem('schofy_pending_plan_name', plan.name);
          }
          if (hasActiveCurrentPlan) {
            if (showLoader) {
              setAccessNotice({
                type: 'info',
                message: `${usage.plan?.name || 'Your current plan'} remains active. The new plan will apply only after admin approval.`,
              });
            }
            effectiveUsage = usage;
          } else {
            setAccessNotice({
              type: 'pending',
              message: 'Your request is still waiting for admin approval. Access will unlock automatically after approval.',
            });
            effectiveUsage = {
              ...usage,
              plan: plan || usage.plan,
              selectedPlanId: plan?.id || usage.selectedPlanId,
              status: 'incomplete',
              requiresPlanAction: true,
            };
          }
        } else if (sub && paused) {
          localStorage.setItem('schofy_sub_pending', '0');
          setAccessNotice({
            type: 'paused',
            message: 'Your access is paused. Contact Us to restore it.',
          });
          effectiveUsage = {
            ...usage,
            plan: plan || usage.plan,
            selectedPlanId: plan?.id || usage.selectedPlanId,
            status: 'incomplete',
            requiresPlanAction: true,
          };
        } else if (sub && plan && sub.status === 'active') {
          localStorage.setItem('schofy_sub_pending', '0');
          if (showLoader) setAccessProgress(82);
          const expiry = sub.ends_at ? new Date(sub.ends_at) : null;
          const ms = expiry && !Number.isNaN(expiry.getTime()) ? expiry.getTime() - Date.now() : 0;
          const days = ms > 0 ? Math.ceil(ms / (24 * 60 * 60 * 1000)) : 0;
          effectiveUsage = {
            ...usage,
            plan,
            selectedPlanId: plan.id,
            remaining: Math.max(0, plan.studentLimit - usage.used),
            eligible: usage.used < plan.studentLimit && ms > 0,
            expiryDate: expiry && ms > 0 ? expiry.toISOString() : sub.ends_at || null,
            status: ms <= 0 ? 'expired' : days <= 14 ? 'expiring' : 'active',
            daysRemaining: ms <= 0 ? 0 : days,
            requiresPlanAction: ms <= 0,
          };
          setAccessNotice({
            type: ms <= 0 ? 'error' : 'success',
            message: ms <= 0 ? 'This subscription is expired. Renew a plan to continue.' : `${isFreeTier ? 'Free tier' : 'Access'} verified. ${ms > 0 ? `${days} day${days === 1 ? '' : 's'} remaining.` : ''}`,
          });
          if (showLoader) {
            setAccessPopup({
              title: isFreeTier ? 'Free tier active' : 'Access approved',
              message: `${plan.name} access is active. You can proceed to the app.`,
              days: ms <= 0 ? 0 : days,
              canProceed: ms > 0,
            });
          }
        } else if (showLoader && !cloudUnavailable) {
          setAccessNotice({
            type: 'error',
            message: 'No approved subscription was found yet. Choose a plan or request a trial to continue.',
          });
        }
      }

      setBillingCycle(savedBillingCycle);
      setCurrentPlanId(effectiveUsage.selectedPlanId);
      setStudentCount(effectiveUsage.used);
      setAccessState(effectiveUsage);
      const pendingChange = localStorage.getItem('schofy_sub_pending') === '1';
      const hasActiveCurrentPlan = effectiveUsage.status === 'active' || effectiveUsage.status === 'expiring';
      if (!(pendingChange && hasActiveCurrentPlan)) {
        cachePlanStateLocally(authId, effectiveUsage, pendingChange);
      }
      setLatestReceipt(receipt);
      if (showLoader) {
        setAccessProgress(100);
        await new Promise((resolve) => setTimeout(resolve, 180));
      }
    } catch (error) {
      console.error('Failed to load plan state:', error);
      if (showLoader) {
        setAccessNotice({
          type: 'error',
          message: 'Could not check access right now. Please confirm your connection and try again.',
        });
      }
    } finally {
      if (showLoader) {
        setAccessProgress(100);
        setCheckingAccess(false);
      }
    }
  }

  const handleSubscribe = (planId: string) => {
    if (!isOnline) {
      setAccessNotice({
        type: 'info',
        message: 'You are offline. Your current plan remains active from the local cache, but plan changes require internet.',
      });
      return;
    }
    const plan = PLAN_DEFINITIONS.find(p => p.id === planId);
    if (!plan) return;
    setSelectedPlan(plan);
    // If user has an existing plan (renewing), show renew instructions first
    if (currentPlanId) {
      setRenewPlan(plan);
      setShowRenewModal(true);
      return;
    }
    setShowPaymentModal(true);
    setPaymentSubmitted(false);
    setTransactionId('');
  };

  async function requestTrialApproval() {
    const authId = schoolId || user?.id;
    if (!authId || !supabase || !isOnline) {
      setAccessNotice({
        type: 'info',
        message: 'Trial requests require internet so the admin can receive and approve them.',
      });
      return;
    }
    const now = new Date().toISOString();
    await supabase.from('subscriptions').insert({
      id: crypto.randomUUID(),
      school_id: authId,
      user_id: user?.id || authId,
      plan: 'trial',
      status: 'pending',
      starts_at: now,
      ends_at: now,
      metadata: {
        source: 'client',
        requestType: 'trial',
        requestedBy: user?.email || '',
        requestedAt: now,
      },
      created_at: now,
      updated_at: now,
    });
    localStorage.setItem('schofy_sub_pending', '1');
  }

  function getPlanAmount(plan: PlanDefinition) {
    if (billingCycle === 'monthly') return plan.monthlyPrice;
    if (billingCycle === 'yearly') return plan.yearlyPrice;
    return plan.termPrice;
  }

  function formatAmount(amount: number) {
    if (planCurrency === 'UGX') return `UGX ${Math.round(amount * UGX_RATE).toLocaleString()}`;
    return `$${amount}`;
  }

  async function handleVerifyCode() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    setVerifyingCode(true);
    setAccessNotice(null);
    setVerificationPopup({
      status: 'verifying',
      title: 'Verifying code',
      message: 'Checking this payment verification code...',
    });
    try {
      const result = await redeemPaymentVerificationCode(authId, user?.id, verificationCode);
      if (result.status === 'valid') {
        setVerificationCode('');
        setPaymentSubmitted(false);
        setShowPaymentModal(false);
        setAccessNotice({ type: 'success', message: result.message });
        setVerificationPopup({
          status: 'success',
          title: 'Valid code',
          message: `${result.message} Redirecting to dashboard...`,
          canProceed: true,
        });
        await loadPlanState();
        window.setTimeout(() => navigate('/'), 1200);
      } else {
        const reason =
          result.status === 'used'
            ? 'This code was already used before. One-time codes cannot be reused.'
            : result.status === 'terminated'
              ? 'This code was stopped by the admin and cannot activate a plan.'
              : result.status === 'invalid'
                ? 'The code may be wrongly typed, incomplete, or not from Schofy.'
                : 'The system could not complete verification right now.';
        setVerificationPopup({
          status: 'failed',
          title: 'Code verification failed',
          message: result.message,
          reason,
        });
        setAccessNotice({
          type: 'error',
          message: `${result.message} ${reason}`,
        });
      }
    } finally {
      setVerifyingCode(false);
    }
  }

  const renderVerificationCodeEntry = (compact = false) => (
    <div className={`${compact ? '' : 'rounded-xl border border-emerald-200 bg-white p-3 dark:border-emerald-900/60 dark:bg-slate-900'} text-left`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
        <KeyRound size={16} className="text-emerald-600" />
        Payment verification code
      </h3>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Enter a one-time Schofy code to activate the matching plan online or offline.
      </p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={verificationCode}
          onChange={(e) => setVerificationCode(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleVerifyCode(); }}
          placeholder="Enter verification code"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          autoComplete="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => void handleVerifyCode()}
          disabled={verifyingCode}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          style={{ backgroundColor: 'var(--solid-emerald)' }}
        >
          {verifyingCode ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
          Verify
        </button>
      </div>
    </div>
  );

  const handleDownloadInvoice = () => {
    const receiptAmount = latestReceipt ? formatAmount(Number(latestReceipt.amount || 0)) : 'N/A';
    const invoice = `SCHOFY RECEIPT
================
Receipt: RCP-${Date.now()}
Date: ${new Date().toLocaleDateString()}
Plan: ${(latestReceipt?.planName || 'NO PLAN SELECTED').toUpperCase()}
Amount: ${receiptAmount}
Billing: ${latestReceipt?.billingCycle || 'N/A'}
Expires: ${latestReceipt ? new Date(latestReceipt.expiresAt).toLocaleDateString() : 'N/A'}
================
Contact: 0750034304 / 0775011029
Powered by Schofy`;
    const blob = new Blob([invoice], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Schofy_Receipt.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  const getPrice = (plan: PlanDefinition) => {
    if (plan.priceLabel) return plan.priceLabel;
    return formatAmount(getPlanAmount(plan));
  };

  const checkPlanLimit = (planId: string) => studentCount <= (PLAN_DEFINITIONS.find(p => p.id === planId)?.studentLimit || 0);
  const currentCycle = latestReceipt?.billingCycle || null;
  const currentCycleLabel = currentCycle === 'monthly' ? 'Current Monthly' : currentCycle === 'yearly' ? 'Current Yearly' : currentCycle === 'term' ? 'Current Term' : 'Current';
  const canProceedToApp = accessState?.status === 'active' || accessState?.status === 'expiring';
  const receiptPlan = PLAN_DEFINITIONS.find(p => p.id === latestReceipt?.planId);
  const cachedRealPlan = accessState?.plan || PLAN_DEFINITIONS.find(p => p.id === currentPlanId) || receiptPlan || null;
  const displayPlanId = cachedRealPlan?.id || currentPlanId;
  const currentPlanName = cachedRealPlan?.name || 'selected';
  const currentPlanLimit = cachedRealPlan?.studentLimit || 0;
  const currentPlanLimitLabel = currentPlanLimit >= Number.MAX_SAFE_INTEGER ? 'Unlimited' : currentPlanLimit || 'N/A';
  const showBackToApp = Boolean(user && isDesktopApp());
  const contactMessage = (plan: PlanDefinition) => encodeURIComponent(`Hello,\n\nI want to buy the ${plan.name} plan.\nSchool: ${user?.email || ''}\nSchool ID: ${schoolId || user?.id || ''}\n\nPlease help me activate the one-time desktop version with unlimited students.`);

  if (initialPlansLoading) {
    return (
      <div className="plans-page-enter relative mx-auto flex min-h-screen w-full max-w-7xl items-center justify-center px-4 py-8 text-slate-900 dark:text-white sm:px-6 lg:px-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full border bg-white shadow-sm dark:bg-slate-900"
            style={{ borderColor: 'var(--solid-emerald)', color: 'var(--solid-emerald)' }}
          >
            <Loader2 size={28} className="animate-spin" />
          </div>
          <p className="text-lg font-black" style={{ color: 'var(--solid-emerald)' }}>
            Loading
          </p>
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Preparing your plan details...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="plans-page-enter relative mx-auto min-h-screen w-full max-w-7xl space-y-5 px-4 py-8 text-slate-900 dark:text-white sm:px-6 lg:px-10">
      {(!currentPlanId || accessState?.status === 'expired') ? (
        <div className="plans-reveal rounded-xl border p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Your account is locked or expired. Please select a plan below to unlock all features and increase student limits.
          </p>
        </div>
      ) : (
        <div className="plans-reveal rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">
            Your account is unlocked! Current plan: {currentPlanName}. {isOnline ? 'Plan changes are available online.' : 'You are offline, so plan changes are paused until internet returns.'}
          </p>
        </div>
      )}

      <div className="plans-reveal flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" style={{ animationDelay: '70ms' }}>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {currentPlanId ? 'Manage Your Subscription' : 'Plans & Subscription'}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {currentPlanId 
              ? 'View your current plan or upgrade when needed' 
              : 'Choose the perfect plan for your school'
            }
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {showBackToApp && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <ArrowLeft size={13} />
              Back to app
            </button>
          )}
          <button
            type="button"
            onClick={() => void loadPlanState(true)}
            disabled={checkingAccess}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            {checkingAccess && <Loader2 size={13} className="animate-spin" />}
            {checkingAccess ? 'Checking...' : 'Check access'}
          </button>
          {checkingAccess && (
            <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full rounded-full transition-all duration-150"
                style={{ width: `${accessProgress}%`, backgroundColor: 'var(--solid-emerald)' }}
              />
            </div>
          )}
          {canProceedToApp && (
            <button
              type="button"
              onClick={() => navigate('/')}
              className="rounded-lg px-3 py-2 text-xs font-semibold text-white brightness-100 transition hover:brightness-110"
              style={{ backgroundColor: 'var(--solid-emerald)' }}
            >
              Proceed to app
            </button>
          )}
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1 dark:border-slate-700 dark:bg-slate-800/90">
            {(['monthly', 'term', 'yearly'] as const).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  billingCycle === cycle
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {cycle === 'yearly' ? 'Yearly' : cycle === 'term' ? 'Per Term' : 'Monthly'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100/90 p-1 dark:border-slate-700 dark:bg-slate-800/90">
            {(['USD', 'UGX'] as const).map((currency) => (
              <button
                key={currency}
                type="button"
                onClick={() => setPlanCurrency(currency)}
                className={`px-2 py-1.5 rounded-md text-xs font-medium transition-all ${
                  planCurrency === currency
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {currency}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* First-time user — no plan yet: show trial request */}
      <div className="hidden">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <KeyRound size={16} className="text-emerald-600" />
              Payment verification code
            </h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Enter a one-time Schofy code to activate the matching plan online or offline.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:flex-row lg:max-w-xl">
            <input
              type="text"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void handleVerifyCode(); }}
              placeholder="Enter verification code"
              className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="button"
              onClick={() => void handleVerifyCode()}
              disabled={verifyingCode}
              className="inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              style={{ backgroundColor: 'var(--solid-emerald)' }}
            >
              {verifyingCode ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
              Verify
            </button>
          </div>
        </div>
      </div>

      {accessNotice && (
        <div className={`plans-reveal rounded-xl border p-4 text-sm font-semibold ${
          accessNotice.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
            : accessNotice.type === 'info'
              ? 'border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
            : accessNotice.type === 'pending'
              ? 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-900/20 dark:text-red-200'
        }`}>
          <div>{accessNotice.message}</div>
          {accessNotice.type === 'pending' && (
            <div className="mt-4">
              {renderVerificationCodeEntry()}
            </div>
          )}
        </div>
      )}

      {!currentPlanId && (
        <div className="plans-reveal rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/20 p-4" style={{ animationDelay: '120ms' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0 text-xl">🎁</div>
            <div className="flex-1">
              <h3 className="font-semibold text-violet-900 dark:text-violet-100 text-sm">New to Schofy?</h3>
              <p className="text-xs text-violet-700 dark:text-violet-300 mt-0.5">Request a free 7-day trial — no payment needed. Admin will activate it for you.</p>
            </div>
            {!trialRequested ? (
              <button onClick={() => setShowTrialModal(true)}
                className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium rounded-lg flex-shrink-0"
              >
                Request Trial
              </button>
            ) : (
              <span className="px-3 py-1.5 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs font-medium rounded-lg flex-shrink-0">
                ✓ Requested
              </span>
            )}
          </div>
        </div>
      )}

      {/* Current Plan Status */}
      {currentPlanId && accessState && (
        <div className={`plans-reveal rounded-xl border p-4 ${
          accessState.status === 'expired' ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20' :
          accessState.status === 'expiring' ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20' :
          'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
        }`}>
          <div className="flex items-start gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
              accessState.status === 'expired' ? 'bg-red-100 dark:bg-red-900/50' :
              accessState.status === 'expiring' ? 'bg-amber-100 dark:bg-amber-900/50' :
              'bg-green-100 dark:bg-green-900/50'
            }`}>
              {accessState.status === 'expired' ? <AlertTriangle className="text-red-600 dark:text-red-400" size={20} /> :
               accessState.status === 'expiring' ? <Clock className="text-amber-600 dark:text-amber-400" size={20} /> :
               <Check className="text-green-600 dark:text-green-400" size={20} />}
            </div>
            <div className="flex-1">
              <h3 className={`font-semibold text-sm ${
                accessState.status === 'expired' ? 'text-red-900 dark:text-red-100' :
                accessState.status === 'expiring' ? 'text-amber-900 dark:text-amber-100' :
                'text-green-900 dark:text-green-100'
              }`}>
                {currentPlanName} Plan
                {accessState.status === 'expired' && ' — Expired'}
                {accessState.status === 'expiring' && ` — Expires in ${accessState.daysRemaining} days`}
                {accessState.status === 'active' && ' — Active'}
              </h3>
              <div className={`flex items-center gap-3 mt-1.5 text-xs ${
                accessState.status === 'expired' ? 'text-red-600 dark:text-red-400' :
                accessState.status === 'expiring' ? 'text-amber-600 dark:text-amber-400' :
                'text-green-600 dark:text-green-400'
              }`}>
                <span>Students: {studentCount}/{currentPlanLimitLabel}</span>
                {accessState.expiryDate && <span>Expires: {new Date(accessState.expiryDate).toLocaleDateString()}</span>}
                <span className="capitalize">{currentCycle} billing</span>
              </div>
            </div>
            {/* Renew button — always visible for expired/expiring */}
            {(accessState.status === 'expired' || accessState.status === 'expiring') && (
              <button
                onClick={() => {
                  const plan = PLAN_DEFINITIONS.find(p => p.id === currentPlanId);
                  if (plan) { setRenewPlan(plan); setShowRenewModal(true); }
                }}
                className={`px-3 py-1.5 text-white text-xs font-medium rounded-lg flex items-center gap-1 flex-shrink-0 ${
                  accessState.status === 'expired' ? 'bg-red-500 hover:bg-red-600' : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                <AlertTriangle size={12} /> Renew Now
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-stretch">
        {PLAN_DEFINITIONS.map((plan, planIndex) => {
          const isAtLimit = !checkPlanLimit(plan.id);
          const isCurrentPlan = plan.id === displayPlanId && (plan.contactOnly || billingCycle === currentCycle);
          const limitLabel = plan.limitLabel || `Up to ${plan.studentLimit} students`;
          return (
            <div
              key={plan.id}
              className={`plans-reveal relative flex flex-col rounded-xl border-2 bg-white/95 transition-all dark:bg-slate-800/95 ${
                plan.popular ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/10' :
                isCurrentPlan ? 'border-green-500 dark:border-green-400' :
                isAtLimit ? 'border-red-300 dark:border-red-700' :
                'border-slate-200 dark:border-slate-700'
              }`}
              style={{ animationDelay: `${150 + planIndex * 55}ms` }}
            >
              {plan.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-indigo-500 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <Zap size={12} /> RECOMMENDED
                  </span>
                </div>
              )}
              {isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-green-500 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <Check size={12} /> {currentCycleLabel.toUpperCase()}
                  </span>
                </div>
              )}
              {isAtLimit && !isCurrentPlan && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-red-500 text-white text-xs font-bold px-4 py-1 rounded-full flex items-center gap-1">
                    <AlertTriangle size={12} /> LIMIT
                  </span>
                </div>
              )}

              <div className="p-5 flex flex-col flex-grow">
                <div className="flex items-center gap-2 mb-3">
                  {plan.id === 'unlimited' && <Crown className="text-emerald-500" size={20} />}
                  {plan.id === 'enterprise' && <Crown className="text-amber-500" size={20} />}
                  {plan.id === 'professional' && <Star className="text-violet-500" size={20} />}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  {plan.contactOnly && (
                    <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                      One-time
                    </span>
                  )}
                  {plan.id === 'professional' && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      Most Common
                    </span>
                  )}
                </div>

                <div className="mb-2">
                  <span className={plan.contactOnly ? 'text-xl font-bold text-slate-900 dark:text-white' : 'text-3xl font-bold text-slate-900 dark:text-white'}>{getPrice(plan)}</span>
                  {!plan.contactOnly && <span className="text-sm text-slate-500 dark:text-slate-400">/{billingCycle === 'monthly' ? 'mo' : billingCycle === 'yearly' ? 'yr' : 'term'}</span>}
                </div>
                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-4">{limitLabel}</p>

                <div className="space-y-2 flex-grow">
                  {plan.features.map((f, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Check size={14} className="text-green-500 flex-shrink-0" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{f}</span>
                    </div>
                  ))}
                  {plan.notIncluded.map((f, i) => (
                    <div key={i} className="flex items-center gap-2 opacity-40">
                      <span className="text-sm text-slate-500 dark:text-slate-400 line-through">{f}</span>
                    </div>
                  ))}
                </div>

                <div className="mt-auto pt-4">
                  {isCurrentPlan ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 cursor-default flex items-center justify-center gap-2"
                    >
                      <Check size={16} /> Current Plan
                    </button>
                  ) : plan.contactOnly ? (
                    <a
                      href={`https://wa.me/256750034304?text=${contactMessage(plan)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-3 rounded-xl text-sm font-medium bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center gap-2"
                    >
                      <MessageCircle size={16} /> Contact Us
                    </a>
                  ) : isAtLimit ? (
                    <button
                      onClick={() => { setUpgradeToPlan(plan); setShowUpgradeModal(true); }}
                      disabled={!isOnline}
                      className="w-full py-3 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <AlertTriangle size={16} /> {isOnline ? 'Upgrade Now' : 'Online required'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={!isOnline}
                      className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                        plan.popular ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' :
                        'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
                      } disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                      <CreditCard size={16} /> {isOnline ? 'Subscribe' : 'Online required'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="plans-reveal rounded-xl border border-slate-200 bg-white/95 p-4 dark:border-slate-700 dark:bg-slate-800/95" style={{ animationDelay: '330ms' }}>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Shield className="text-indigo-500" size={16} />
            Subscription Details
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Plan</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{currentPlanName || 'None'}</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Students</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{studentCount}/{currentPlanLimitLabel}</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Billing</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{billingCycle}</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Amount</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {cachedRealPlan ? formatAmount(getPlanAmount(cachedRealPlan)) : formatAmount(0)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={handleDownloadInvoice} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium">
              <Download size={12} /> Receipt
            </button>
            <button onClick={() => setShowFAQModal(true)} className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium">
              <HelpCircle size={12} /> FAQ
            </button>
          </div>
          {latestReceipt && (
            <div className="mt-4 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
              <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Last paid receipt</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">Plan: {latestReceipt.planName}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Amount: {formatAmount(Number(latestReceipt.amount || 0))}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Paid: {new Date(latestReceipt.paidAt).toLocaleString()}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Expires: {new Date(latestReceipt.expiresAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-500 to-teal-500 p-4 text-white dark:border-emerald-700 dark:from-slate-800 dark:via-slate-800 dark:to-emerald-900">
          <h3 className="mb-1 text-sm font-bold">Need unlimited students?</h3>
          <p className="mb-3 text-xs text-emerald-50 dark:text-emerald-200">Contact Us to buy the one-time desktop version.</p>
          <div className="flex gap-2 flex-wrap">
            <a href="https://wa.me/256750034304" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50 dark:bg-slate-100 dark:text-emerald-700 dark:hover:bg-white">
              <MessageCircle size={12} /> WhatsApp
            </a>
            <a href="tel:0750034304" className="flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 dark:bg-slate-700/80 dark:text-slate-100 dark:hover:bg-slate-600">
              <Phone size={12} /> Airtel: 0750034304
            </a>
            <a href="tel:0775011029" className="flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 dark:bg-slate-700/80 dark:text-slate-100 dark:hover:bg-slate-600">
              <Phone size={12} /> MTN: 0775011029
            </a>
          </div>
        </div>
      </div>

      {showPaymentModal && selectedPlan && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowPaymentModal(false); }}>
          <div className="animate-modal-in max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Subscribe to {selectedPlan.name}</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={18} /></button>
            </div>

            {!paymentSubmitted ? (
              <div className="p-4 space-y-4">
                <div className="rounded-lg bg-indigo-50 p-3 dark:bg-indigo-900/20">
                  <div className="flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Plan</span><span className="font-bold text-slate-900 dark:text-white">{selectedPlan.name}</span></div>
                  <div className="mt-1 flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Amount</span><span className="text-xl font-bold text-indigo-600 dark:text-indigo-300">{formatAmount(getPlanAmount(selectedPlan))}</span></div>
                </div>

                <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Please confirm the billing cycle before paying.</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">New users have no default plan selected.</p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Transaction ID (TID) *</label>
                  <input
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter Airtel TID"
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-900/60 dark:bg-emerald-900/20">
                  <label className="mb-1 block text-xs font-medium text-emerald-800 dark:text-emerald-200">Have a verification code?</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void handleVerifyCode(); }}
                      placeholder="Enter code"
                      className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-emerald-500 dark:border-emerald-800 dark:bg-slate-800 dark:text-white"
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button
                      type="button"
                      onClick={() => void handleVerifyCode()}
                      disabled={verifyingCode}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                    >
                      {verifyingCode ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                      Verify
                    </button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <a href="https://wa.me/256750034304" target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                    <MessageCircle size={12} /> WhatsApp
                  </a>
                  <button
                    onClick={async () => {
                      if (!transactionId.trim()) {
                        alert('Enter Transaction ID');
                        return;
                      }
                      const authId = schoolId || user?.id;
                      if (!authId) return;

                      setIsRefreshing(true);
                      try {
                        // Mark subscription as pending in Supabase so admin can verify
                        if (supabase) {
                          const now = new Date().toISOString();
                          const pendingMeta = {
                            source: 'client',
                            transactionId: transactionId.trim(),
                            billingCycle,
                            submittedAt: now,
                            planId: selectedPlan.id,
                            amount: getPlanAmount(selectedPlan),
                            displayCurrency: planCurrency,
                            displayAmount: formatAmount(getPlanAmount(selectedPlan)),
                          };

                          await supabase.from('subscriptions').insert({
                            id: crypto.randomUUID(),
                            school_id: authId,
                            user_id: user?.id || authId,
                            plan: selectedPlan.id,
                            status: 'pending',
                            starts_at: now,
                            ends_at: now, // will be set by admin on approval
                            created_at: now,
                            updated_at: now,
                            metadata: pendingMeta,
                          });
                        }

                        // Cache pending request separately. The active/current plan must
                        // remain unchanged until Schofy approval.
                        localStorage.setItem('schofy_sub_pending', '1');
                        localStorage.setItem('schofy_sub_tid', transactionId.trim());
                        localStorage.setItem('schofy_pending_plan', selectedPlan.id);
                        localStorage.setItem('schofy_pending_plan_name', selectedPlan.name);
                        cachePlanStateLocally(authId, {
                          plan: selectedPlan,
                          selectedPlanId: selectedPlan.id,
                          used: accessState?.used || studentCount,
                          remaining: 0,
                          eligible: false,
                          expiryDate: null,
                          status: 'incomplete',
                          daysRemaining: null,
                          requiresPlanAction: true,
                        }, true);

                        const hasCurrentAccess = accessState?.status === 'active' || accessState?.status === 'expiring';
                        setAccessNotice({
                          type: hasCurrentAccess ? 'info' : 'pending',
                          message: hasCurrentAccess
                            ? `Request sent. Your current plan remains active until admin approval.`
                            : `${selectedPlan.name} is waiting for admin approval.`,
                        });
                        setLatestReceipt(await getLatestReceipt(authId));
                        setPaymentSubmitted(true);
                      } catch (error) {
                        console.error('Payment error:', error);
                      } finally {
                        setIsRefreshing(false);
                      }
                    }}
                    disabled={isSubmitting}
                    className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 disabled:opacity-50"
                  >
                    {isSubmitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    Submit
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                {/* Pending verification state */}
                <div className="w-14 h-14 bg-amber-100 dark:bg-amber-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Clock size={28} className="text-amber-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Payment Submitted!</h2>
                <p className="text-sm text-amber-600 dark:text-amber-400 font-medium mb-1">Awaiting admin verification</p>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">TID: <span className="font-mono font-bold text-slate-900 dark:text-white">{transactionId}</span></p>

                {/* Pending notice */}
                <div className="mb-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-left">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    {canProceedToApp ? 'Current plan remains active until admin approves' : 'Access unlocks after admin approval'}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Plan: <strong>{selectedPlan.name}</strong> · Amount: <strong>{formatAmount(getPlanAmount(selectedPlan))}</strong>
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Activation within 24 hours after verification.</p>
                </div>

                <div className="mb-4">
                  {renderVerificationCodeEntry()}
                </div>

                <div className="space-y-2">
                  {/* WhatsApp with pre-filled message */}
                  <a
                    href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Support,\n\nPayment submitted:\nSchool: ${user?.email}\nPlan: ${selectedPlan.name}\nBilling: ${billingCycle}\nAmount: ${formatAmount(getPlanAmount(selectedPlan))}\nTransaction ID: ${transactionId}\n\nPlease verify and activate. Thank you.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-medium flex items-center justify-center gap-2"
                  >
                    <MessageCircle size={14} /> Send to Admin via WhatsApp
                  </a>
                  <div className="flex gap-2">
                    <button onClick={handleDownloadInvoice} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                      <Download size={12} /> Receipt
                    </button>
                    <a href="tel:0775011029" className="flex-1 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium flex items-center justify-center gap-1">
                      <Phone size={12} /> Call Admin
                    </a>
                  </div>
                  <button onClick={() => setShowPaymentModal(false)} className="w-full py-2 text-slate-400 text-xs">Close</button>
                </div>
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {showFAQModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowFAQModal(false); }}>
          <div className="animate-modal-in max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><HelpCircle className="text-indigo-500" size={18} /> FAQ</h2>
              <button onClick={() => setShowFAQModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-2">
              {faqs.map((faq, i) => (
                <div key={i} className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
                  <button onClick={() => setExpandedFAQ(expandedFAQ === i ? null : i)} className="w-full px-3 py-2 flex items-center justify-between bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 text-left">
                    <span className="text-xs font-medium text-slate-900 dark:text-white">{faq.q}</span>
                    {expandedFAQ === i ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                  </button>
                  {expandedFAQ === i && <div className="px-3 py-2 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-600 dark:text-slate-300">{faq.a}</p></div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      , document.body)}

      {showUpgradeModal && upgradeToPlan && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={e => { if (e.target === e.currentTarget) setShowUpgradeModal(false); }}>
          <div className="animate-modal-in w-full max-w-sm rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"><AlertTriangle className="text-red-500" size={18} /> Limit Reached</h2>
              <button onClick={() => setShowUpgradeModal(false)} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-xs text-red-700 dark:text-red-300">
                <p>Students: <strong>{studentCount}</strong> / {PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.limitLabel || PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.studentLimit || 0}</p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Upgrade to <strong>{upgradeToPlan.name}</strong> ({upgradeToPlan.limitLabel || `${upgradeToPlan.studentLimit} students`})</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowUpgradeModal(false); handleSubscribe(upgradeToPlan.id); }} className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium">Upgrade {formatAmount(getPlanAmount(upgradeToPlan))}</button>
                <a href="https://wa.me/256750034304" target="_blank" rel="noopener noreferrer" className="flex-1 py-2 bg-green-500 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1"><MessageCircle size={12} /> Contact</a>
              </div>
            </div>
          </div>
        </div>
      , document.body)}

      {showTrialModal && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="bg-gradient-to-r from-violet-600 to-purple-600 p-5 text-white text-center">
              <div className="text-4xl mb-2">🎁</div>
              <h2 className="text-lg font-bold">Request Free Trial</h2>
              <p className="text-violet-100 text-sm mt-1">7 days of full access — no payment required</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-3 space-y-1.5 text-xs text-violet-700 dark:text-violet-300">
                <p className="font-semibold">How it works:</p>
                <p>1. Send a WhatsApp message to the admin requesting a trial</p>
                <p>2. Admin will activate 7 days of free access for your school</p>
                <p>3. After 7 days, choose a paid plan to continue</p>
              </div>

              <a
                href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Support,\n\nI would like to request a free trial for my school.\n\nSchool email: ${user?.email}\nSchool ID: ${schoolId || user?.id}\n\nPlease activate the 7-day free trial. Thank you.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { setTrialRequested(true); void requestTrialApproval(); }}
                className="w-full py-3 bg-green-500 hover:bg-green-600 text-white rounded-xl font-semibold flex items-center justify-center gap-2 transition-all"
              >
                <MessageCircle size={18} /> Send Trial Request via WhatsApp
              </a>

              <div className="flex gap-2">
                <a href="tel:0775011029" className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  <Phone size={15} /> Call Admin
                </a>
                <button onClick={() => setShowTrialModal(false)} className="flex-1 py-2.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-sm font-medium">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showRenewModal && renewPlan && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white">
              <div className="flex items-center gap-3 mb-1">
                <CreditCard size={22} />
                <h2 className="text-lg font-bold">Renew {renewPlan.name}</h2>
              </div>
              <p className="text-indigo-100 text-sm">Follow these steps to renew your subscription</p>
            </div>

            <div className="p-5 space-y-4">
              {/* Current plan info */}
              {accessState && (
                <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500 dark:text-slate-400">Current plan</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{renewPlan.name}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-slate-500 dark:text-slate-400">Status</span>
                    <span className={`font-medium ${accessState.status === 'expired' ? 'text-red-600' : 'text-amber-600'}`}>
                      {accessState.status === 'expired' ? 'Expired' : `Expires in ${accessState.daysRemaining} days`}
                    </span>
                  </div>
                </div>
              )}

              {/* Step-by-step instructions */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Renewal Steps</p>

                {[
                  { step: '1', icon: '💰', title: 'Send Payment', desc: `Send ${formatAmount(getPlanAmount(renewPlan))} via Airtel Money to 0750034304` },
                  { step: '2', icon: '📋', title: 'Note Your TID', desc: 'Save the Transaction ID (TID) from your Airtel Money confirmation SMS' },
                  { step: '3', icon: '📝', title: 'Submit Below', desc: 'Click "Pay & Submit" and enter your TID — admin will verify within 24 hours' },
                ].map(({ step, icon, title, desc }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-indigo-100 dark:bg-indigo-900/40 rounded-xl flex items-center justify-center text-sm flex-shrink-0">{icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Amount summary */}
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-indigo-700 dark:text-indigo-300">Plan</span>
                  <span className="font-bold text-indigo-900 dark:text-indigo-100">{renewPlan.name}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span className="text-indigo-700 dark:text-indigo-300">Amount ({billingCycle})</span>
                  <span className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-300">
                    {formatAmount(getPlanAmount(renewPlan))}
                  </span>
                </div>
                <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">Send to Airtel Money: <strong>0750034304</strong></p>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setShowRenewModal(false);
                    setShowPaymentModal(true);
                    setPaymentSubmitted(false);
                    setTransactionId('');
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold flex items-center justify-center gap-2"
                >
                  <CreditCard size={18} /> Pay & Submit TID
                </button>
                <a
                  href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Support,\n\nI want to renew my ${renewPlan.name} plan.\nSchool: ${user?.email}\nBilling: ${billingCycle}\nAmount: ${formatAmount(getPlanAmount(renewPlan))}\n\nPlease assist. Thank you.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 bg-green-500 hover:bg-green-600 text-white rounded-xl font-medium flex items-center justify-center gap-2 text-sm"
                >
                  <MessageCircle size={16} /> Contact Admin on WhatsApp
                </a>
                <button onClick={() => setShowRenewModal(false)} className="w-full py-2 text-slate-400 text-sm">Cancel</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {verificationPopup && createPortal(
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-5 text-center shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className={`mx-auto flex h-12 w-12 items-center justify-center rounded-full ${
              verificationPopup.status === 'success'
                ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300'
                : verificationPopup.status === 'failed'
                  ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-300'
                  : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300'
            }`}>
              {verificationPopup.status === 'verifying' && <Loader2 size={22} className="animate-spin" />}
              {verificationPopup.status === 'success' && <Check size={22} />}
              {verificationPopup.status === 'failed' && <AlertTriangle size={22} />}
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{verificationPopup.title}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{verificationPopup.message}</p>
            {verificationPopup.reason && (
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <p className="font-bold text-slate-800 dark:text-white">Possible reason</p>
                <p className="mt-1">{verificationPopup.reason}</p>
              </div>
            )}
            <div className="mt-5 flex gap-2">
              {verificationPopup.status === 'failed' && (
                <a
                  href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Support,\n\nMy payment verification code failed.\nSchool: ${user?.email || ''}\nSchool ID: ${schoolId || user?.id || ''}\nCode entered: ${verificationCode}\n\nPlease help me verify.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600"
                >
                  Contact admin
                </a>
              )}
              <button
                type="button"
                onClick={() => verificationPopup.canProceed ? navigate('/') : setVerificationPopup(null)}
                disabled={verificationPopup.status === 'verifying'}
                className="flex-1 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-700 dark:hover:bg-slate-600"
              >
                {verificationPopup.canProceed ? 'Go to dashboard' : verificationPopup.status === 'failed' ? 'Try again' : 'Please wait'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {accessPopup && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border bg-white p-5 text-center shadow-2xl dark:bg-slate-900" style={{ borderColor: 'rgba(45, 163, 45, 0.35)' }}>
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ backgroundColor: 'rgba(45, 163, 45, 0.12)', color: 'var(--solid-emerald)' }}>
              <Check size={22} />
            </div>
            <h2 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{accessPopup.title}</h2>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{accessPopup.message}</p>
            {accessPopup.days !== null && (
              <p className="mt-3 text-sm font-semibold" style={{ color: 'var(--solid-emerald)' }}>
                {accessPopup.days} day{accessPopup.days === 1 ? '' : 's'} remaining
              </p>
            )}
            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setAccessPopup(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                disabled={!accessPopup.canProceed}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white brightness-100 transition hover:brightness-110 disabled:opacity-60"
                style={{ backgroundColor: 'var(--solid-emerald)' }}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}


      {showSuccess && (
        <SuccessPopup 
          message="Payment Received!" 
          subMessage="Your plan will be updated within 24 hours."
          onClose={() => setShowSuccess(false)}
        />
      )}
    </div>
  );
}
