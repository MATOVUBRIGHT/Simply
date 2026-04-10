import { useState, useEffect } from 'react';
import { Check, CreditCard, Crown, Zap, Shield, Star, Download, HelpCircle, Phone, X, AlertTriangle, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_DEFINITIONS, PlanDefinition, SubscriptionAccessState, getCurrentBillingCycle, getLatestReceipt, getSubscriptionAccessState, hasSeenPlanIntro, markPlanIntroSeen, saveCurrentPlan } from '../utils/plans';

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
  const [transactionId, setTransactionId] = useState('');
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [accessState, setAccessState] = useState<SubscriptionAccessState | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<Awaited<ReturnType<typeof getLatestReceipt>>>(null);
  const [showIntroModal, setShowIntroModal] = useState(false);
  const [showContinueModal, setShowContinueModal] = useState(false);
  const [modalCenterY, setModalCenterY] = useState<number | null>(null);

  useEffect(() => {
    if (user?.id || schoolId) loadPlanState();
  }, [user?.id, schoolId]);

  useEffect(() => {
    const anyModalOpen = showPaymentModal || showFAQModal || showUpgradeModal || showIntroModal || showContinueModal;

    if (!anyModalOpen) {
      setModalCenterY(null);
      return;
    }

    const updateModalCenter = () => {
      setModalCenterY(window.scrollY + (window.innerHeight / 2));
    };

    updateModalCenter();
    window.addEventListener('scroll', updateModalCenter, { passive: true });
    window.addEventListener('resize', updateModalCenter);

    return () => {
      window.removeEventListener('scroll', updateModalCenter);
      window.removeEventListener('resize', updateModalCenter);
    };
  }, [showPaymentModal, showFAQModal, showUpgradeModal, showIntroModal, showContinueModal]);

  async function loadPlanState() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    try {
      const [savedBillingCycle, usage, receipt] = await Promise.all([
        getCurrentBillingCycle(authId),
        getSubscriptionAccessState(authId),
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
    if (billingCycle === 'yearly') {
      window.open('https://wa.me/256750034304', '_blank');
      return;
    }
    setSelectedPlan(plan);
    if (latestReceipt) {
      setShowContinueModal(true);
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

  const getPrice = (plan: PlanDefinition) => billingCycle === 'yearly' ? 'Contact' : `$${billingCycle === 'monthly' ? plan.monthlyPrice : plan.termPrice}`;
  const checkPlanLimit = (planId: string) => studentCount <= (PLAN_DEFINITIONS.find(p => p.id === planId)?.studentLimit || 0);
  const currentCycle = latestReceipt?.billingCycle || null;
  const currentCycleLabel = currentCycle === 'monthly' ? 'Current Monthly' : currentCycle === 'yearly' ? 'Current Yearly' : currentCycle === 'term' ? 'Current Term' : 'Current';
  const modalContentStyle = modalCenterY === null ? undefined : { top: `${modalCenterY}px` };

  return (
    <div className="relative space-y-4 text-slate-900 dark:text-white">
      <div className="rounded-xl border p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          🎉 Your account is now fully unlocked! Schofy is now free to use with no student limits and real-time cloud sync across all your devices.
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

      {/* Current Plan Status */}
      {currentPlanId && accessState && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-green-800 dark:bg-green-900/20">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/50 flex items-center justify-center flex-shrink-0">
              <Check className="text-green-600 dark:text-green-400" size={20} />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-green-900 dark:text-green-100">
                Your Current Plan: {PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.name || 'Unknown'}
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                {accessState.status === 'active' ? 'Active' : 
                 accessState.status === 'expiring' ? `Expires in ${accessState.daysRemaining} days` :
                 accessState.status === 'expired' ? 'Expired' : 'Unknown'} • 
                {currentCycle === 'monthly' ? ' Monthly' : 
                 currentCycle === 'yearly' ? ' Yearly' : ' Term'} billing
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-green-600 dark:text-green-400">
                <span>Students: {studentCount}/{PLAN_DEFINITIONS.find(p => p.id === currentPlanId)?.studentLimit || 0}</span>
                {accessState.expiryDate && (
                  <span>Expires: {new Date(accessState.expiryDate).toLocaleDateString()}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {accessState.status === 'expiring' && (
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg flex items-center gap-1"
                >
                  <AlertTriangle size={12} /> Extend
                </button>
              )}
              {accessState.status === 'expired' && (
                <button
                  onClick={() => setShowUpgradeModal(true)}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg flex items-center gap-1"
                >
                  <AlertTriangle size={12} /> Renew
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
        {PLAN_DEFINITIONS.map((plan) => {
          const isAtLimit = !checkPlanLimit(plan.id);
          const isCurrentPlan = plan.id === currentPlanId;
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
              {isCurrentPlan && !plan.popular && (
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
                  {billingCycle !== 'yearly' && <span className="text-sm text-slate-500 dark:text-slate-400">/{billingCycle === 'monthly' ? 'mo' : 'term'}</span>}
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
                        billingCycle === 'yearly' ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                        plan.popular ? 'bg-indigo-500 hover:bg-indigo-600 text-white shadow-lg shadow-indigo-500/30' :
                        'bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-900 dark:text-white'
                      }`}
                    >
                      {billingCycle === 'yearly' ? <><MessageCircle size={16} /> Contact Us</> : <><CreditCard size={16} /> Subscribe</>}
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

      {showPaymentModal && selectedPlan && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="pointer-events-none absolute inset-0" />
          <div style={modalContentStyle} className="absolute left-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
            <div className="animate-modal-in max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
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

                      const usage = await saveCurrentPlan(authId, selectedPlan.id, billingCycle);
                      setCurrentPlanId(usage.selectedPlanId);
                      setStudentCount(usage.used);
                      setAccessState(usage);
                      setLatestReceipt(await getLatestReceipt(authId));
                      setPaymentSubmitted(true);
                    }}
                    className="flex-1 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1"
                  >
                    <Check size={12} /> Submit
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-3"><Check size={24} className="text-green-500" /></div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Payment Submitted!</h2>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">TID: <span className="font-mono font-bold text-slate-900 dark:text-white">{transactionId}</span></p>
                {latestReceipt && (
                  <div className="mb-4 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 p-3 text-left">
                    <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-200">Receipt saved</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">{latestReceipt.planName} • ${latestReceipt.amount} • {latestReceipt.billingCycle}</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300">Expires {new Date(latestReceipt.expiresAt).toLocaleDateString()}</p>
                  </div>
                )}
                <div className="flex gap-2 justify-center">
                  <button onClick={handleDownloadInvoice} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-medium flex items-center gap-1">
                    <Download size={12} /> Download Receipt
                  </button>
                  <button onClick={() => setShowPaymentModal(false)} className="px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium">Close</button>
                </div>
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {showFAQModal && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div style={modalContentStyle} className="absolute left-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
            <div className="animate-modal-in max-h-[80vh] w-full overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
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
        </div>
      )}

      {showUpgradeModal && upgradeToPlan && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div style={modalContentStyle} className="absolute left-1/2 z-10 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 px-4">
            <div className="animate-modal-in w-full rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
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
        </div>
      )}

      {showIntroModal && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div style={modalContentStyle} className="absolute left-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
            <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Select A Plan First</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Choose monthly, per term, or yearly before paying.</p>
            </div>
            <div className="p-5 space-y-3 text-sm text-slate-700 dark:text-slate-300">
              <p>New users do not have a current plan by default.</p>
              <p>Pick your billing cycle and then pay only once for the plan you want.</p>
            </div>
              <div className="p-5 pt-0 flex justify-end">
                <button
                  onClick={async () => {
                    const authId = schoolId || user?.id;
                    if (authId) await markPlanIntroSeen(authId);
                    setShowIntroModal(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showContinueModal && selectedPlan && latestReceipt && (
        <div className="absolute inset-0 z-50 bg-black/50 backdrop-blur-sm">
          <div style={modalContentStyle} className="absolute left-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2 px-4">
            <div className="w-full rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Continue With New Subscription?</h2>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                You already have a paid plan receipt for <strong>{latestReceipt.planName}</strong> on <strong>{latestReceipt.billingCycle}</strong>.
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Do you want to continue and subscribe to <strong>{selectedPlan.name}</strong> on <strong>{billingCycle}</strong>?
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Current receipt expires on {new Date(latestReceipt.expiresAt).toLocaleDateString()}.
              </p>
            </div>
            <div className="p-5 pt-0 flex gap-3">
              <button
                onClick={() => {
                  setShowContinueModal(false);
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowContinueModal(false);
                  setShowPaymentModal(true);
                  setPaymentSubmitted(false);
                  setTransactionId('');
                }}
                className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium"
              >
                Continue
              </button>
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
