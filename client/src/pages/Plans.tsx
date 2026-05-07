import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { Check, CreditCard, Crown, Zap, Shield, Star, Download, HelpCircle, Phone, X, AlertTriangle, MessageCircle, ChevronDown, ChevronUp, Loader2, Clock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_DEFINITIONS, PlanDefinition, SubscriptionAccessState, getCurrentBillingCycle, getLatestReceipt, getSubscriptionAccessState, hasSeenPlanIntro, markPlanIntroSeen, saveCurrentPlan } from '../utils/plans';
import { SuccessPopup } from '../components/SuccessPopup';
import { supabase } from '../lib/supabase';

const faqs = [
  { q: 'How does the student limit work?', a: 'Your plan determines max enrolled students. Reach the limit to upgrade before adding more.' },
  { q: 'Can I switch plans?', a: 'Yes, upgrades are immediate, downgrades should only be used when your enrolled students fit the lower limit.' },
  { q: 'Payment methods?', a: 'Airtel Money only. Activation within 24 hours.' },
  { q: 'Refunds?', a: 'No, all payments are non-refundable.' },
];

export default function Plans() {
  const { user, schoolId } = useAuth();
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
  const [showSuccess, setShowSuccess] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<SubscriptionAccessState | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<Awaited<ReturnType<typeof getLatestReceipt>>>(null);
  const [showTrialModal, setShowTrialModal] = useState(false);
  const [trialRequested, setTrialRequested] = useState(false);
  const [showRenewModal, setShowRenewModal] = useState(false);
  const [renewPlan, setRenewPlan] = useState<typeof PLAN_DEFINITIONS[0] | null>(null);

  useEffect(() => {
    if (user?.id || schoolId) loadPlanState();
  }, [user?.id, schoolId]);

  async function loadPlanState() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    try {
      const [savedBillingCycle, usage, receipt] = await Promise.all([
        getCurrentBillingCycle(authId),
        getSubscriptionAccessState(authId, undefined, { authUserId: user?.id }),
        getLatestReceipt(authId),
        hasSeenPlanIntro(authId),
      ]);

      setBillingCycle(savedBillingCycle);
      setCurrentPlanId(usage.selectedPlanId);
      setStudentCount(usage.used);
      setAccessState(usage);
      setLatestReceipt(receipt);
    } catch (error) {
      console.error('Failed to load plan state:', error);
    }
  }

  const handleSubscribe = (planId: string) => {
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

  const handleDownloadInvoice = () => {
    const invoice = `SCHOFY RECEIPT
================
Receipt: RCP-${Date.now()}
Date: ${new Date().toLocaleDateString()}
Plan: ${(latestReceipt?.planName || 'NO PLAN SELECTED').toUpperCase()}
Amount: ${latestReceipt ? `$${latestReceipt.amount}` : 'N/A'}
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
    if (billingCycle === 'monthly') return `$${plan.monthlyPrice}`;
    if (billingCycle === 'term') return `$${plan.termPrice}`;
    return `$${plan.yearlyPrice}`;
  };

  const checkPlanLimit = (planId: string) => studentCount <= (PLAN_DEFINITIONS.find(p => p.id === planId)?.studentLimit || 0);
  const currentCycle = latestReceipt?.billingCycle || null;
  const currentCycleLabel = currentCycle === 'monthly' ? 'Current Monthly' : currentCycle === 'yearly' ? 'Current Yearly' : currentCycle === 'term' ? 'Current Term' : 'Current';

  return (
    <div className="relative space-y-4 text-slate-900 dark:text-white">
      <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Your account is unlocked! Enjoy features and student limits based on your selected plan below. Real-time cloud sync active across all your devices.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
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
      </div>

      {/* First-time user — no plan yet: show trial request */}
      {!currentPlanId && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/20 p-4">
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
        <div className={`rounded-xl border p-4 ${
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
                {PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.name || 'Unknown'} Plan
                {accessState.status === 'expired' && ' — Expired'}
                {accessState.status === 'expiring' && ` — Expires in ${accessState.daysRemaining} days`}
                {accessState.status === 'active' && ' — Active'}
              </h3>
              <div className={`flex items-center gap-3 mt-1.5 text-xs ${
                accessState.status === 'expired' ? 'text-red-600 dark:text-red-400' :
                accessState.status === 'expiring' ? 'text-amber-600 dark:text-amber-400' :
                'text-green-600 dark:text-green-400'
              }`}>
                <span>Students: {studentCount}/{PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.studentLimit || 0}</span>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {PLAN_DEFINITIONS.map((plan) => {
          const isAtLimit = !checkPlanLimit(plan.id);
          const isCurrentPlan = plan.id === currentPlanId && billingCycle === currentCycle;
          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border-2 bg-white/95 transition-all dark:bg-slate-800/95 ${
                plan.popular ? 'border-indigo-500 dark:border-indigo-400 shadow-lg shadow-indigo-500/10' :
                isCurrentPlan ? 'border-green-500 dark:border-green-400' :
                isAtLimit ? 'border-red-300 dark:border-red-700' :
                'border-slate-200 dark:border-slate-700'
              }`}
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
                  {plan.id === 'enterprise' && <Crown className="text-amber-500" size={20} />}
                  {plan.id === 'professional' && <Star className="text-violet-500" size={20} />}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{plan.name}</h3>
                  {plan.id === 'professional' && (
                    <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                      Most Common
                    </span>
                  )}
                </div>

                <div className="mb-2">
                  <span className="text-3xl font-bold text-slate-900 dark:text-white">{getPrice(plan)}</span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">/{billingCycle === 'monthly' ? 'mo' : billingCycle === 'yearly' ? 'yr' : 'term'}</span>
                </div>
                <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium mb-4">Up to {plan.studentLimit} students</p>

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
                  ) : isAtLimit ? (
                    <button
                      onClick={() => { setUpgradeToPlan(plan); setShowUpgradeModal(true); }}
                      className="w-full py-3 rounded-xl text-sm font-medium bg-red-500 hover:bg-red-600 text-white flex items-center justify-center gap-2"
                    >
                      <AlertTriangle size={16} /> Upgrade Now
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.id)}
                      className={`w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                        plan.popular ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' :
                        'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
                      }`}
                    >
                      <CreditCard size={16} /> Subscribe
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white/95 p-4 dark:border-slate-700 dark:bg-slate-800/95">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white mb-3 flex items-center gap-2">
            <Shield className="text-indigo-500" size={16} />
            Subscription Details
          </h2>
          <div className="grid grid-cols-4 gap-3">
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Plan</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{currentPlanId || 'None'}</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Students</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">{studentCount}/{PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.studentLimit || 0}</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Billing</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white capitalize">{billingCycle}</p>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg text-center">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Amount</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                ${billingCycle === 'monthly'
                  ? PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.monthlyPrice ?? 0
                  : PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.termPrice ?? 0}
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
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Amount: ${latestReceipt.amount}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Paid: {new Date(latestReceipt.paidAt).toLocaleString()}</p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300">Expires: {new Date(latestReceipt.expiresAt).toLocaleDateString()}</p>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-amber-200 bg-gradient-to-r from-amber-500 to-orange-500 p-4 text-white dark:border-amber-700 dark:from-slate-800 dark:via-slate-800 dark:to-amber-900">
          <h3 className="mb-1 text-sm font-bold">Need more than 500 students?</h3>
          <p className="mb-3 text-xs text-amber-100 dark:text-amber-200">Custom enterprise pricing available</p>
          <div className="flex gap-2">
            <a href="https://wa.me/256750034304" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 dark:bg-slate-100 dark:text-amber-700 dark:hover:bg-white">
              <MessageCircle size={12} /> 0750034304
            </a>
            <a href="tel:0775011029" className="flex items-center gap-1 rounded-lg bg-white/20 px-3 py-1.5 text-xs font-medium text-white hover:bg-white/30 dark:bg-slate-700/80 dark:text-slate-100 dark:hover:bg-slate-600">
              <Phone size={12} /> 0775011029
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
                  <div className="mt-1 flex justify-between text-sm"><span className="text-slate-600 dark:text-slate-300">Amount</span><span className="text-xl font-bold text-indigo-600 dark:text-indigo-300">${billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.termPrice}</span></div>
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
                        // Save plan locally
                        const usage = await saveCurrentPlan(authId, selectedPlan.id, billingCycle, {
                          authUserId: user?.id,
                        });

                        // Mark subscription as pending in Supabase so admin can verify
                        if (supabase) {
                          const now = new Date().toISOString();
                          // Find existing sub row
                          const { data: existing } = await supabase
                            .from('subscriptions')
                            .select('id')
                            .eq('school_id', authId)
                            .order('updated_at', { ascending: false })
                            .limit(1)
                            .single();

                          const pendingMeta = {
                            source: 'client',
                            transactionId: transactionId.trim(),
                            billingCycle,
                            submittedAt: now,
                            planId: selectedPlan.id,
                            amount: billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.termPrice,
                          };

                          if (existing?.id) {
                            await supabase.from('subscriptions').update({
                              status: 'pending',
                              plan: selectedPlan.id,
                              updated_at: now,
                              metadata: pendingMeta,
                            }).eq('id', existing.id);
                          } else {
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
                        }

                        // Cache pending state locally so gate blocks immediately
                        localStorage.setItem('schofy_sub_pending', '1');
                        localStorage.setItem('schofy_sub_tid', transactionId.trim());
                        localStorage.setItem('schofy_sub_plan', selectedPlan.id);

                        setCurrentPlanId(usage.selectedPlanId);
                        setStudentCount(usage.used);
                        setAccessState(usage);
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
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Access blocked until admin approves</p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
                    Plan: <strong>{selectedPlan.name}</strong> · Amount: <strong>${billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.termPrice}</strong>
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">Activation within 24 hours after verification.</p>
                </div>

                <div className="space-y-2">
                  {/* WhatsApp with pre-filled message */}
                  <a
                    href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Admin,\n\nPayment submitted:\nSchool: ${user?.email}\nPlan: ${selectedPlan.name}\nBilling: ${billingCycle}\nAmount: $${billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.termPrice}\nTransaction ID: ${transactionId}\n\nPlease verify and activate. Thank you.`)}`}
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
                <p>Students: <strong>{studentCount}</strong> / {PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.studentLimit || 0}</p>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300">Upgrade to <strong>{upgradeToPlan.name}</strong> ({upgradeToPlan.studentLimit} students)</p>
              <div className="flex gap-2">
                <button onClick={() => { setShowUpgradeModal(false); handleSubscribe(upgradeToPlan.id); }} className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium">Upgrade ${billingCycle === 'monthly' ? upgradeToPlan.monthlyPrice : upgradeToPlan.termPrice}</button>
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
                href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Admin,\n\nI would like to request a free trial for my school.\n\nSchool email: ${user?.email}\nSchool ID: ${schoolId || user?.id}\n\nPlease activate the 7-day free trial. Thank you.`)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setTrialRequested(true)}
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
                  { step: '1', icon: '💰', title: 'Send Payment', desc: `Send $${billingCycle === 'monthly' ? renewPlan.monthlyPrice : renewPlan.termPrice} via Airtel Money to 0750034304` },
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
                    ${billingCycle === 'monthly' ? renewPlan.monthlyPrice : renewPlan.termPrice}
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
                  href={`https://wa.me/256750034304?text=${encodeURIComponent(`Hello Schofy Admin,\n\nI want to renew my ${renewPlan.name} plan.\nSchool: ${user?.email}\nBilling: ${billingCycle}\nAmount: $${billingCycle === 'monthly' ? renewPlan.monthlyPrice : renewPlan.termPrice}\n\nPlease assist. Thank you.`)}`}
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
