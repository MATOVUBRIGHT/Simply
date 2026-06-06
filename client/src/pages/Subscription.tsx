import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

import { useNavigate } from 'react-router-dom';
import { Check, CreditCard, Crown, Zap, Star, HelpCircle, Phone, X, MessageCircle, ChevronDown, ChevronUp, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { PLAN_DEFINITIONS, PlanDefinition, getCurrentBillingCycle, getLatestReceipt, getSubscriptionAccessState, hasSeenPlanIntro, markPlanIntroSeen, saveCurrentPlan } from '../utils/plans';
import { useConfirm } from '../components/ConfirmModal';

const faqs = [
  { q: 'How does the student limit work?', a: 'Your plan determines max enrolled students. Reach the limit to upgrade before adding more.' },
  { q: 'Can I switch plans?', a: 'Yes, upgrades are immediate, downgrades should only be used when your enrolled students fit the lower limit.' },
  { q: 'Payment methods?', a: 'Airtel Money only. Activation within 24 hours.' },
  { q: 'Refunds?', a: 'No, all payments are non-refundable.' },
];

export default function Subscription() {
  const navigate = useNavigate();
  const { user, schoolId, logout } = useAuth();
  const confirm = useConfirm();
  const tenantId = schoolId || user?.id;
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'term' | 'yearly'>('term');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanDefinition | null>(null);
  const [expandedFAQ, setExpandedFAQ] = useState<number | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [transactionId, setTransactionId] = useState('');
  const [currentPlanId, setCurrentPlanId] = useState<string | null>(null);
  const [latestReceipt, setLatestReceipt] = useState<Awaited<ReturnType<typeof getLatestReceipt>>>(null);
  const [showContinueModal, setShowContinueModal] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPlanState();
  }, []);

  async function loadPlanState() {
    if (!tenantId || !user?.id) return;
    try {
      const [savedBillingCycle, usage, receipt] = await Promise.all([
        getCurrentBillingCycle(tenantId),
        getSubscriptionAccessState(tenantId, undefined, { authUserId: user.id }),
        getLatestReceipt(tenantId),
      ]);

      setBillingCycle(savedBillingCycle);
      setCurrentPlanId(usage.selectedPlanId);
      setLatestReceipt(receipt);
    } catch (error) {
      console.error('Failed to load plan state:', error);
    } finally {
      setLoading(false);
    }
  }

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const handleSubscribe = (planId: string) => {
    const plan = PLAN_DEFINITIONS.find(p => p.id === planId);
    if (!plan) return;
    if (billingCycle === 'yearly' || plan.contactOnly) {
      const message = encodeURIComponent(`Hello Schofy Support,\n\nI want to buy the ${plan.name} plan for my school.`);
      window.open(`https://wa.me/256750034304?text=${message}`, '_blank');
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

  const getPrice = (plan: PlanDefinition) => plan.priceLabel || (billingCycle === 'yearly' ? 'Contact' : `$${billingCycle === 'monthly' ? plan.monthlyPrice : plan.termPrice}`);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--primary-color-50), #ffffff)' }}>
        <div className="text-center">
          <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-slate-200 border-t-transparent" style={{ borderTopColor: 'var(--primary-color)' }} />
          <p className="mt-4 text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, var(--primary-color-50), #ffffff)' }}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={handleLogout} className="flex items-center gap-2 text-slate-600 hover:text-red-600 transition-colors">
              <LogOut size={20} />
              <span className="text-sm font-medium">Back to Login</span>
            </button>
            <div className="w-px h-6 bg-slate-300"></div>
            <h1 className="text-xl font-bold text-slate-900">Schofy</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-4">
            Choose Your Perfect Plan
          </h2>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Select a plan that fits your school's needs. Upgrade or downgrade anytime.
          </p>
        </div>

        {/* Billing Cycle Toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
            {(['monthly', 'term', 'yearly'] as const).map((cycle) => (
              <button
                key={cycle}
                onClick={() => setBillingCycle(cycle)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  billingCycle === cycle
                    ? 'text-white shadow-md'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
                style={billingCycle === cycle ? { backgroundColor: 'var(--primary-color)' } : undefined}
              >
                {cycle === 'yearly' ? 'Yearly' : cycle === 'term' ? 'Per Term' : 'Monthly'}
              </button>
            ))}
          </div>
        </div>

        {/* Plan Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {PLAN_DEFINITIONS.map((plan) => {
            const isCurrentPlan = plan.id === currentPlanId;
            return (
              <div
                key={plan.id}
                className={`relative flex flex-col rounded-2xl border-2 bg-white transition-all hover:shadow-xl hover:-translate-y-1 ${
                  plan.popular ? 'shadow-lg' :
                  isCurrentPlan ? 'border-green-500' :
                  'border-slate-200 hover:border-slate-300'
                }`}
                style={plan.popular ? { borderColor: 'var(--primary-color)', boxShadow: '0 14px 35px color-mix(in srgb, var(--primary-color) 12%, transparent)' } : undefined}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <span className="flex items-center gap-1.5 rounded-full px-5 py-1.5 text-xs font-bold text-white shadow-lg" style={{ backgroundColor: 'var(--primary-color)' }}>
                      <Zap size={12} /> RECOMMENDED
                    </span>
                  </div>
                )}

                <div className="p-6 flex flex-col flex-grow">
                  <div className="flex items-center gap-2 mb-4">
                    {plan.id === 'enterprise' && <Crown className="text-amber-500" size={24} />}
                    {plan.id === 'professional' && <Star className="text-violet-500" size={24} />}
                    <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  </div>

                  <div className="mb-3">
                    <span className="text-4xl font-extrabold text-slate-900">{getPrice(plan)}</span>
                    {billingCycle !== 'yearly' && <span className="text-slate-500 ml-1">/{billingCycle === 'monthly' ? 'mo' : 'term'}</span>}
                  </div>
                  <p className="mb-6 font-semibold" style={{ color: 'var(--primary-color)' }}>{plan.limitLabel || `Up to ${plan.studentLimit} students`}</p>

                  <div className="space-y-3 flex-grow">
                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Check size={16} className="text-green-500 flex-shrink-0" />
                        <span className="text-sm text-slate-700">{f}</span>
                      </div>
                    ))}
                    {plan.notIncluded.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 opacity-40">
                        <span className="text-sm text-slate-500 line-through">{f}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-8 space-y-3">
                    {isCurrentPlan ? (
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold text-white shadow-lg transition-all hover:brightness-110"
                        style={{ backgroundColor: 'var(--primary-color)', boxShadow: '0 10px 22px var(--primary-color-shadow)' }}
                      >
                        <RefreshCw size={18} /> Renew Plan
                      </button>
                    ) : (
                      <button
                        onClick={() => handleSubscribe(plan.id)}
                        className={`w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all ${
                          billingCycle === 'yearly' || plan.contactOnly ? 'bg-amber-500 hover:bg-amber-600 text-white' :
                          plan.popular ? 'text-white shadow-lg hover:brightness-110' :
                          'bg-slate-900 hover:bg-slate-800 text-white'
                        }`}
                        style={plan.popular ? { backgroundColor: 'var(--primary-color)', boxShadow: '0 10px 22px var(--primary-color-shadow)' } : undefined}
                      >
                        {billingCycle === 'yearly' || plan.contactOnly ? <><MessageCircle size={18} /> Contact Us</> : <><CreditCard size={18} /> Subscribe</>}
                      </button>
                    )}
                    {isCurrentPlan && (
                      <div className="text-center">
                        <span className="text-xs font-medium text-green-600 flex items-center justify-center gap-1">
                          <Check size={12} /> Active Plan
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 mb-8">
          <h3 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <HelpCircle style={{ color: 'var(--primary-color)' }} size={20} />
            Frequently Asked Questions
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-slate-200 rounded-xl overflow-hidden">
                <button 
                  onClick={() => setExpandedFAQ(expandedFAQ === i ? null : i)} 
                  className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 hover:bg-slate-100 text-left"
                >
                  <span className="text-sm font-medium text-slate-900">{faq.q}</span>
                  {expandedFAQ === i ? <ChevronUp size={16} className="text-slate-500" /> : <ChevronDown size={16} className="text-slate-500" />}
                </button>
                {expandedFAQ === i && (
                  <div className="px-4 py-3 bg-white border-t border-slate-200">
                    <p className="text-sm text-slate-600">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Contact Section */}
        <div className="rounded-2xl p-6 text-center text-white" style={{ background: 'linear-gradient(135deg, var(--primary-color-700), var(--primary-color))' }}>
          <h3 className="text-lg font-bold mb-2">Need help choosing?</h3>
          <p className="mb-4 text-white/80">Contact us for custom enterprise solutions</p>
          <div className="flex justify-center gap-3">
            <a href="https://wa.me/256750034304" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 font-medium transition-colors hover:bg-white/90" style={{ color: 'var(--primary-color)' }}>
              <MessageCircle size={18} /> 0750034304
            </a>
            <a href="tel:0775011029" className="flex items-center gap-2 rounded-lg bg-white/20 px-5 py-2.5 font-medium hover:bg-white/30 transition-colors">
              <Phone size={18} /> 0775011029
            </a>
          </div>
        </div>
      </main>

      {/* Payment Modal */}
      {showPaymentModal && selectedPlan && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-slate-900">Subscribe to {selectedPlan.name}</h2>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                <X size={20} />
              </button>
            </div>

            {!paymentSubmitted ? (
              <div className="p-5 space-y-4">
                <div className="rounded-xl p-4 theme-note">
                  <div className="flex justify-between text-sm"><span className="text-slate-600">Plan</span><span className="font-bold text-slate-900">{selectedPlan.name}</span></div>
                  <div className="mt-2 flex justify-between"><span className="text-slate-600">Amount</span><span className="text-2xl font-extrabold" style={{ color: 'var(--primary-color)' }}>${billingCycle === 'monthly' ? selectedPlan.monthlyPrice : selectedPlan.termPrice}</span></div>
                </div>

                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                  <p className="text-sm font-medium text-amber-800">Pay via Airtel Money</p>
                  <p className="text-xs text-amber-700 mt-1">1. Send money to 0750034304</p>
                  <p className="text-xs text-amber-700">2. Enter your Transaction ID below</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Transaction ID (TID)</label>
                  <input
                    type="text"
                    value={transactionId}
                    onChange={(e) => setTransactionId(e.target.value)}
                    placeholder="Enter Airtel TID"
                    className="w-full rounded-xl border border-slate-300 px-4 py-3 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>

                <button
                  onClick={async () => {
                    if (!transactionId.trim()) {
                      await confirm({
                        title: 'Transaction ID Required',
                        description: 'Please enter Transaction ID before submitting payment.',
                        confirmLabel: 'OK',
                        cancelLabel: 'Close',
                        variant: 'info',
                      });
                      return;
                    }
                    if (!user?.id) {
                      await confirm({
                        title: 'Sign In Required',
                        description: 'Please sign in first before submitting payment.',
                        confirmLabel: 'OK',
                        cancelLabel: 'Close',
                        variant: 'info',
                      });
                      return;
                    }
                    const usage = await saveCurrentPlan(tenantId!, selectedPlan.id, billingCycle, {
                      authUserId: user.id,
                    });
                    setCurrentPlanId(usage.selectedPlanId);
                    setPaymentSubmitted(true);
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl py-3.5 font-semibold text-white hover:brightness-110"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  <Check size={18} /> Submit Payment
                </button>
              </div>
            ) : (
              <div className="p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check size={32} className="text-green-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-900 mb-2">Payment Submitted!</h2>
                <p className="text-slate-600 mb-6">Your subscription will be activated within 24 hours.</p>
                <button
                  onClick={() => {
                    window.location.href = '/';
                  }}
                  className="w-full rounded-xl py-3.5 font-semibold text-white hover:brightness-110"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  Go to Dashboard
                </button>
              </div>
            )}
          </div>
        </div>
      , document.body)}

      {/* Continue Modal */}
      {showContinueModal && selectedPlan && latestReceipt && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-5 border-b border-slate-200">
              <h2 className="text-xl font-bold text-slate-900">Continue Subscription?</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-600">
                You already have a receipt for <strong>{latestReceipt.planName}</strong>. 
                Subscribe to <strong>{selectedPlan.name}</strong>?
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowContinueModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-700 font-medium hover:bg-slate-200"
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
                  className="flex-1 rounded-xl py-3 font-medium text-white hover:brightness-110"
                  style={{ backgroundColor: 'var(--primary-color)' }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
