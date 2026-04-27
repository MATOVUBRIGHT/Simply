import type { Notification, Student } from '@schofy/shared';
import { dataService } from '../lib/database/SupabaseDataService';

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
    id: 'nursery',
    name: 'Nursery',
    monthlyPrice: 5,
    termPrice: 12,
    period: 'month',
    features: [
      'Up to 100 students',
      'Nursery classes (Baby, Nursery, Middle, Top)',
      'Attendance tracking',
      'Fee management',
      'Parent notifications',
      'Basic reports',
      'Email support',
    ],
    notIncluded: ['Primary classes', 'Secondary classes', 'Advanced analytics'],
    popular: false,
    studentLimit: 100,
  },
  {
    id: 'nursery_primary',
    name: 'Nursery & Primary',
    monthlyPrice: 10,
    termPrice: 25,
    period: 'month',
    features: [
      'Up to 300 students',
      'Nursery + Primary classes (P.1–P.7)',
      'Full attendance & gradebook',
      'Fee management & invoicing',
      'Parent notifications',
      'Advanced reports',
      'Priority support',
      'Data export',
    ],
    notIncluded: ['Secondary classes'],
    popular: true,
    studentLimit: 300,
  },
  {
    id: 'secondary',
    name: 'Secondary',
    monthlyPrice: 15,
    termPrice: 35,
    period: 'month',
    features: [
      'Up to 500 students',
      'Secondary classes (S.1–S.6)',
      'Full attendance & gradebook',
      'Fee management & invoicing',
      'Payroll management',
      'Parent notifications',
      'Advanced analytics',
      'Priority support',
      'API access',
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
  await dataService.saveSettings(userId, { [key]: value });
}

async function getSetting<T>(userId: string, key: string) {
  const rows = await dataService.getAll(userId, 'settings');
  const row = rows.find((s: { key?: string }) => s.key === key);
  return row?.value as T | undefined;
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
  const students = await dataService.getAll(userId, 'students');
  return students.filter(countsTowardPlan).length;
}

export async function persistPlanEligibility(tenantId: string, eligible: boolean) {
  await putSetting(tenantId, SETTINGS_KEYS.currentPlanEligible, eligible);
}

const EXPIRING_DAYS_THRESHOLD = 14;

function pickEndsAt(row: Record<string, unknown> | null | undefined): string | null {
  if (!row) return null;
  const v = (row.endsAt ?? row.ends_at) as string | undefined;
  return v && String(v).trim() ? String(v) : null;
}

async function getLatestLocalSubscription(
  tenantId: string,
  authUserId: string
): Promise<Record<string, unknown> | null> {
  const rows = await dataService.getAll(tenantId, 'subscriptions');
  const filtered = (rows as Record<string, unknown>[]).filter((r) => {
    const del = r.deletedAt ?? r.deleted_at;
    if (del) return false;
    const school = (r.schoolId ?? r.school_id) as string | undefined;
    const uid = (r.userId ?? r.user_id) as string | undefined;
    if (school && school !== tenantId) return false;
    if (uid && uid !== authUserId && uid !== tenantId) return false;
    return true;
  });
  filtered.sort((a, b) => {
    const ta = new Date(String(a.updatedAt ?? a.updated_at ?? 0)).getTime();
    const tb = new Date(String(b.updatedAt ?? b.updated_at ?? 0)).getTime();
    return tb - ta;
  });
  return filtered[0] ?? null;
}

function classifySubscription(expiry: Date | null): { status: SubscriptionStatus; daysRemaining: number | null } {
  if (!expiry || Number.isNaN(expiry.getTime())) {
    return { status: 'incomplete', daysRemaining: null };
  }
  const now = Date.now();
  const end = expiry.getTime();
  if (end <= now) return { status: 'expired', daysRemaining: 0 };
  const days = Math.ceil((end - now) / (24 * 60 * 60 * 1000));
  if (days <= EXPIRING_DAYS_THRESHOLD) return { status: 'expiring', daysRemaining: days };
  return { status: 'active', daysRemaining: days };
}

/**
 * @param tenantId IndexedDB partition (usually `schoolId || user.id`).
 * @param opts.authUserId Account owner for `subscriptions.user_id` when it differs from tenantId.
 */
export async function getSubscriptionAccessState(
  tenantId: string,
  planId?: string,
  opts?: { authUserId?: string }
): Promise<SubscriptionAccessState> {
  const authUserId = opts?.authUserId || tenantId;
  const subRow = await getLatestLocalSubscription(tenantId, authUserId);
  const settingsPlanId = planId ?? (await getCurrentPlanId(tenantId));
  const planFromRow = subRow?.plan != null ? String(subRow.plan).trim() : '';
  const selectedPlanId =
    (planFromRow && getPlanById(planFromRow) ? planFromRow : null) ??
    (settingsPlanId && getPlanById(settingsPlanId) ? settingsPlanId : null);
  const currentPlan = selectedPlanId ? getPlanById(selectedPlanId) : null;
  const used = await getPlanStudentCount(tenantId);

  if (!currentPlan) {
    return {
      plan: null,
      selectedPlanId: null,
      used,
      remaining: 0,
      eligible: false,
      expiryDate: null,
      status: 'incomplete',
      daysRemaining: null,
      requiresPlanAction: true,
    };
  }

  const endsFromRow = pickEndsAt(subRow);
  const endsFromSettings = await getSetting<string>(tenantId, SETTINGS_KEYS.expiryDate);
  const expiryIso = endsFromRow || endsFromSettings || null;
  const expiryDate = expiryIso && !Number.isNaN(new Date(expiryIso).getTime()) ? new Date(expiryIso) : null;
  const { status, daysRemaining } = classifySubscription(expiryDate);
  const remaining = Math.max(0, currentPlan.studentLimit - used);
  const eligible = remaining > 0 && (status === 'active' || status === 'expiring');

  await persistPlanEligibility(tenantId, eligible);

  return {
    plan: currentPlan,
    selectedPlanId,
    used,
    remaining,
    eligible,
    expiryDate: expiryDate ? expiryDate.toISOString() : null,
    status,
    daysRemaining,
    requiresPlanAction: status === 'incomplete' || status === 'expired',
  };
}

export async function getPlanUsage(tenantId: string, planId?: string, opts?: { authUserId?: string }) {
  return getSubscriptionAccessState(tenantId, planId, opts);
}

export async function saveCurrentPlan(
  tenantId: string,
  planId: string,
  billingCycle: BillingCycle = DEFAULT_BILLING_CYCLE,
  opts?: { authUserId?: string }
) {
  const authUserId = opts?.authUserId || tenantId;
  const currentPlanId = await getCurrentPlanId(tenantId);
  const subRow = await getLatestLocalSubscription(tenantId, authUserId);
  const currentExpiry =
    pickEndsAt(subRow) || (await getSetting<string>(tenantId, SETTINGS_KEYS.expiryDate)) || null;
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

  await putSetting(tenantId, SETTINGS_KEYS.currentPlanId, planId);
  await putSetting(tenantId, SETTINGS_KEYS.billingCycle, billingCycle);
  await putSetting(tenantId, SETTINGS_KEYS.expiryDate, nextExpiry.toISOString());
  await putSetting(tenantId, SETTINGS_KEYS.receipt, {
    planId,
    planName: selectedPlan.name,
    billingCycle,
    amount: billingCycle === 'monthly' ? selectedPlan.monthlyPrice : billingCycle === 'yearly' ? 'Contact' : selectedPlan.termPrice,
    paidAt: now.toISOString(),
    expiresAt: nextExpiry.toISOString(),
  });

  const startsAt =
    (subRow?.startsAt as string) ||
    (subRow?.starts_at as string) ||
    now.toISOString();
  const existingId = (subRow?.id as string) || undefined;
  const meta = {
    billingCycle,
    receiptAt: now.toISOString(),
    source: 'client',
  };

  if (existingId && typeof existingId === 'string') {
    await dataService.update(tenantId, 'subscriptions', existingId, {
      id: existingId,
      schoolId: tenantId,
      userId: authUserId,
      plan: planId,
      status: 'active',
      startsAt,
      endsAt: nextExpiry.toISOString(),
      metadata: meta,
    } as any);
  } else {
    await dataService.create(tenantId, 'subscriptions', {
      schoolId: tenantId,
      userId: authUserId,
      plan: planId,
      status: 'active',
      startsAt,
      endsAt: nextExpiry.toISOString(),
      metadata: meta,
    } as any);
  }

  return getSubscriptionAccessState(tenantId, planId, opts);
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

export async function ensurePlanRenewalNotifications(tenantId: string, opts?: { authUserId?: string }) {
  const state = await getSubscriptionAccessState(tenantId, undefined, opts);
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
  const existing = await dataService.get(tenantId, 'notifications', notificationId);
  if (!existing) {
    await dataService.create(tenantId, 'notifications', {
      id: notificationId,
      title,
      message,
      type,
      read: false,
      createdAt: new Date().toISOString(),
      link: '/plans',
    } as any);
  }

  return state;
}

export async function shouldShowRenewalPopup(tenantId: string, opts?: { authUserId?: string }) {
  const state = await getSubscriptionAccessState(tenantId, undefined, opts);
  if (state.status !== 'expiring' && state.status !== 'expired') {
    return { show: false, state };
  }

  const todayKey = formatDateKey(new Date());
  const lastShown = await getSetting<string>(tenantId, SETTINGS_KEYS.renewPopupDate);
  return {
    show: lastShown !== todayKey,
    state,
  };
}

export async function markRenewalPopupShown(userId: string) {
  await putSetting(userId, SETTINGS_KEYS.renewPopupDate, formatDateKey(new Date()));
}
