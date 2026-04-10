import type { Notification, Student } from '@schofy/shared';
import { userDBManager } from '../lib/database/UserDatabaseManager';

export interface PlanDefinition {
  id: string;
  name: string;
  monthlyPrice: number;
  termPrice: number;
  period: string;
  features: string[];
  notIncluded: string[];
  popular: boolean;
  studentLimit: number;
}

export type BillingCycle = 'monthly' | 'term' | 'yearly';
export type SubscriptionStatus = 'incomplete' | 'active' | 'expiring' | 'expired';

export interface SubscriptionAccessState {
  plan: PlanDefinition | null;
  selectedPlanId: string | null;
  used: number;
  remaining: number;
  eligible: boolean;
  expiryDate: string | null;
  status: SubscriptionStatus;
  daysRemaining: number | null;
  requiresPlanAction: boolean;
}

export const PLAN_DEFINITIONS: PlanDefinition[] = [
  {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 6,
    termPrice: 15,
    period: 'month',
    features: [
      'Up to 50 students',
      'Attendance & gradebook',
      'Fee management',
      'Parent notifications',
      '5GB storage',
      'Email support',
      'Basic reports',
    ],
    notIncluded: ['Online payments', 'Advanced analytics', 'API access'],
    popular: true,
    studentLimit: 50,
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 12,
    termPrice: 30,
    period: 'month',
    features: [
      'Up to 100 students',
      'Full feature access',
      'Online payment integration',
      'Parent portal',
      '20GB storage',
      'Priority support',
      'Advanced analytics',
      'Data export',
    ],
    notIncluded: [],
    popular: false,
    studentLimit: 100,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 20,
    termPrice: 49,
    period: 'month',
    features: [
      'Up to 500 students',
      'Everything in Professional',
      'Priority phone support',
      'Dedicated account manager',
      'Custom integrations',
      'API access',
      'SSO authentication',
      'SLA guarantee',
    ],
    notIncluded: [],
    popular: false,
    studentLimit: 500,
  },
];

const DEFAULT_BILLING_CYCLE: BillingCycle = 'term';
const SETTINGS_KEYS = {
  currentPlanId: 'subscriptionPlanId',
  currentPlanEligible: 'subscriptionPlanEligible',
  expiryDate: 'subscriptionExpiryDate',
  billingCycle: 'subscriptionBillingCycle',
  renewPopupDate: 'subscriptionRenewPopupDate',
  receipt: 'subscriptionReceipt',
  planIntroSeen: 'subscriptionPlanIntroSeen',
};

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function formatDateKey(date: Date) {
  return date.toISOString().split('T')[0];
}

function cycleDurationMonths(cycle: BillingCycle) {
  switch (cycle) {
    case 'monthly':
      return 1;
    case 'term':
      return 3;
    case 'yearly':
      return 12;
    default:
      return 3;
  }
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

async function putSetting(userId: string, key: string, value: unknown) {
  await userDBManager.put(userId, 'settings', { id: key, key, value });
}

async function getSetting<T>(userId: string, key: string) {
  const record = await userDBManager.get(userId, 'settings', key);
  return record?.value as T | undefined;
}

export function getPlanById(planId: string | null | undefined) {
  return PLAN_DEFINITIONS.find(plan => plan.id === planId) || null;
}

export function countsTowardPlan(student: Pick<Student, 'status'> | { status?: string }) {
  return student.status !== 'completed';
}

export async function getCurrentPlanId(userId: string) {
  const saved = await getSetting<string>(userId, SETTINGS_KEYS.currentPlanId);
  return typeof saved === 'string' && saved.trim() ? saved : null;
}

export async function getCurrentBillingCycle(userId: string) {
  const saved = await getSetting<BillingCycle>(userId, SETTINGS_KEYS.billingCycle);
  return saved || DEFAULT_BILLING_CYCLE;
}

export async function getCurrentPlan(userId: string) {
  return getPlanById(await getCurrentPlanId(userId));
}

export async function getPlanStudentCount(userId: string) {
  const students = await userDBManager.getAll(userId, 'students');
  return students.filter(countsTowardPlan).length;
}

export async function persistPlanEligibility(userId: string, eligible: boolean) {
  await putSetting(userId, SETTINGS_KEYS.currentPlanEligible, eligible);
}

export async function getSubscriptionAccessState(userId: string, planId?: string): Promise<SubscriptionAccessState> {
  const selectedPlanId = planId || await getCurrentPlanId(userId) || 'starter';
  const currentPlan = getPlanById(selectedPlanId) || PLAN_DEFINITIONS[0];
  const used = await getPlanStudentCount(userId);
  const remaining = Math.max(0, currentPlan.studentLimit - used);

  await persistPlanEligibility(userId, true);

  return {
    plan: currentPlan,
    selectedPlanId,
    used,
    remaining,
    eligible: true,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    daysRemaining: 365,
    requiresPlanAction: false,
  };
}

export async function getPlanUsage(userId: string, planId?: string) {
  return getSubscriptionAccessState(userId, planId);
}

export async function saveCurrentPlan(userId: string, planId: string, billingCycle: BillingCycle = DEFAULT_BILLING_CYCLE) {
  const currentPlanId = await getCurrentPlanId(userId);
  const currentExpiry = await getSetting<string>(userId, SETTINGS_KEYS.expiryDate);
  const now = new Date();
  const selectedPlan = getPlanById(planId) || PLAN_DEFINITIONS[0];

  let baseDate = now;
  if (currentPlanId === planId && currentExpiry) {
    const parsedCurrentExpiry = new Date(currentExpiry);
    if (!Number.isNaN(parsedCurrentExpiry.getTime()) && parsedCurrentExpiry > now) {
      baseDate = parsedCurrentExpiry;
    }
  }

  const nextExpiry = addMonths(baseDate, cycleDurationMonths(billingCycle));

  await putSetting(userId, SETTINGS_KEYS.currentPlanId, planId);
  await putSetting(userId, SETTINGS_KEYS.billingCycle, billingCycle);
  await putSetting(userId, SETTINGS_KEYS.expiryDate, nextExpiry.toISOString());
  await putSetting(userId, SETTINGS_KEYS.receipt, {
    planId,
    planName: selectedPlan.name,
    billingCycle,
    amount: billingCycle === 'monthly' ? selectedPlan.monthlyPrice : billingCycle === 'yearly' ? 'Contact' : selectedPlan.termPrice,
    paidAt: now.toISOString(),
    expiresAt: nextExpiry.toISOString(),
  });

  return getSubscriptionAccessState(userId, planId);
}

export async function getLatestReceipt(userId: string) {
  return (await getSetting<{
    planId: string;
    planName: string;
    billingCycle: BillingCycle;
    amount: number | string;
    paidAt: string;
    expiresAt: string;
  }>(userId, SETTINGS_KEYS.receipt)) || null;
}

export async function hasSeenPlanIntro(userId: string) {
  return Boolean(await getSetting<boolean>(userId, SETTINGS_KEYS.planIntroSeen));
}

export async function markPlanIntroSeen(userId: string) {
  await putSetting(userId, SETTINGS_KEYS.planIntroSeen, true);
}

export async function ensurePlanRenewalNotifications(userId: string) {
  const state = await getSubscriptionAccessState(userId);
  const todayKey = formatDateKey(new Date());

  let title = '';
  let message = '';
  let type: Notification['type'] = 'warning';

  if (state.status === 'expired') {
    title = `Subscription expired: ${state.plan?.name || 'No plan selected'}`;
    message = 'Your subscription has expired. Renew your plan to continue using Schofy.';
    type = 'error';
  } else if (state.status === 'expiring' && state.daysRemaining !== null) {
    title = `Renew soon: ${state.plan?.name || 'Current plan'}`;
    message = `Your plan expires in ${state.daysRemaining} day${state.daysRemaining === 1 ? '' : 's'}. Renew to avoid interruption.`;
    type = 'warning';
  } else {
    return state;
  }

  const notificationId = `subscription-${state.status}-${todayKey}`;
  const existing = await userDBManager.get(userId, 'notifications', notificationId);
  if (!existing) {
    await userDBManager.put(userId, 'notifications', {
      id: notificationId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
      link: '/plans',
    });
  }

  return state;
}

export async function shouldShowRenewalPopup(userId: string) {
  const state = await getSubscriptionAccessState(userId);
  if (state.status !== 'expiring' && state.status !== 'expired') {
    return { show: false, state };
  }

  const todayKey = formatDateKey(new Date());
  const lastShown = await getSetting<string>(userId, SETTINGS_KEYS.renewPopupDate);
  return {
    show: lastShown !== todayKey,
    state,
  };
}

export async function markRenewalPopupShown(userId: string) {
  await putSetting(userId, SETTINGS_KEYS.renewPopupDate, formatDateKey(new Date()));
}
