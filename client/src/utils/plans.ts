import type { Notification, Student } from '@schofy/shared';
import { dataService } from '../lib/database/SupabaseDataService';

export interface PlanDefinition {
  id: string;
  name: string;
  monthlyPrice: number;
  termPrice: number;
  yearlyPrice: number;
  period: string;
  features: string[];
  notIncluded: string[];
  popular: boolean;
  studentLimit: number;
  staffLimit?: number;
  contactOnly?: boolean;
  priceLabel?: string;
  limitLabel?: string;
}

export type BillingCycle = 'monthly' | 'term' | 'yearly';
export type SubscriptionStatus = 'incomplete' | 'active' | 'expiring' | 'expired';
export const UNLIMITED_PLAN_LABEL = 'Unlimited';

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
    monthlyPrice: 5,
    termPrice: 12,
    yearlyPrice: 30,
    period: 'month',
    features: [
      'Up to 100 students',
      'Attendance tracking',
      'Fee management',
      'Basic reports',
      'Email support',
    ],
    notIncluded: ['Advanced analytics', 'Bulk SMS', 'Payroll'],
    popular: false,
    studentLimit: 100,
    staffLimit: 15,
  },
  {
    id: 'professional',
    name: 'Professional',
    monthlyPrice: 10,
    termPrice: 25,
    yearlyPrice: 65,
    period: 'month',
    features: [
      'Up to 300 students',
      'Full attendance & gradebook',
      'Fee management & invoicing',
      'Advanced reports',
      'Priority support',
      'Data export',
    ],
    notIncluded: ['Payroll', 'Custom domains'],
    popular: true,
    studentLimit: 300,
    staffLimit: 45,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    monthlyPrice: 15,
    termPrice: 35,
    yearlyPrice: 95,
    period: 'month',
    features: [
      'Up to 500 students',
      'Full attendance & gradebook',
      'Fee management & invoicing',
      'Payroll management',
      'Advanced analytics',
      'Priority support',
      'API access',
    ],
    notIncluded: [],
    popular: false,
    studentLimit: 500,
    staffLimit: 75,
  },
  {
    id: 'unlimited',
    name: UNLIMITED_PLAN_LABEL,
    monthlyPrice: 0,
    termPrice: 0,
    yearlyPrice: 0,
    period: 'one-time desktop',
    features: [
      'Unlimited students',
      'Full desktop access',
      'Full attendance, finance, reports, and records',
      'Offline-first local database',
      'Online notifications and broadcasts when connected',
      'One-time desktop purchase option',
    ],
    notIncluded: [],
    popular: false,
    studentLimit: Number.MAX_SAFE_INTEGER,
    staffLimit: Number.MAX_SAFE_INTEGER,
    contactOnly: true,
    priceLabel: 'Contact Us',
    limitLabel: 'Unlimited students',
  },
];

const DEFAULT_BILLING_CYCLE: BillingCycle = 'term';
const PLAN_CACHE_PREFIX = 'schofy_plan_cache_';
const PENDING_PLAN_CACHE_PREFIX = 'schofy_pending_plan_';
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

export function getPlanStaffLimit(plan: PlanDefinition | null | undefined) {
  if (!plan) return 0;
  if (typeof plan.staffLimit === 'number') return plan.staffLimit;
  if (!Number.isFinite(plan.studentLimit) || plan.studentLimit >= Number.MAX_SAFE_INTEGER) {
    return Number.MAX_SAFE_INTEGER;
  }
  return Math.max(1, Math.floor(plan.studentLimit * 0.15));
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

function planCacheKey(tenantId: string) {
  return `${PLAN_CACHE_PREFIX}${tenantId}`;
}

function pendingPlanCacheKey(tenantId: string) {
  return `${PENDING_PLAN_CACHE_PREFIX}${tenantId}`;
}

export function cachePlanStateLocally(tenantId: string, state: SubscriptionAccessState, pending = false) {
  if (!tenantId || !state.selectedPlanId) return;
  const plan = getPlanById(state.selectedPlanId);
  if (!plan) return;
  const payload = {
    selectedPlanId: state.selectedPlanId,
    expiryDate: state.expiryDate,
    status: state.status,
    daysRemaining: state.daysRemaining,
    used: state.used,
    pending,
    cachedAt: new Date().toISOString(),
  };
  if (pending) {
    localStorage.setItem(pendingPlanCacheKey(tenantId), JSON.stringify(payload));
    localStorage.setItem('schofy_pending_plan', state.selectedPlanId);
    localStorage.setItem('schofy_pending_plan_name', plan.name);
    localStorage.setItem('schofy_sub_pending', '1');
    return;
  }
  localStorage.setItem(planCacheKey(tenantId), JSON.stringify(payload));
  localStorage.setItem('schofy_sub_plan', state.selectedPlanId);
  localStorage.setItem('schofy_sub_status', state.status);
  localStorage.setItem('schofy_sub_pending', '0');
  localStorage.removeItem('schofy_pending_plan');
  localStorage.removeItem('schofy_pending_plan_name');
  localStorage.removeItem(pendingPlanCacheKey(tenantId));
  if (state.expiryDate) localStorage.setItem('schofy_sub_expiry', state.expiryDate);
}

function getCachedPlanState(tenantId: string, usedOverride?: number): SubscriptionAccessState | null {
  const raw = localStorage.getItem(planCacheKey(tenantId));
  let cached: any = null;
  if (raw) {
    try {
      cached = JSON.parse(raw);
    } catch {
      cached = null;
    }
  }
  const selectedPlanId = cached?.selectedPlanId || localStorage.getItem('schofy_sub_plan');
  const plan = getPlanById(selectedPlanId);
  if (!plan) return null;
  const expiryIso = cached?.expiryDate || localStorage.getItem('schofy_sub_expiry') || null;
  const expiryDate = expiryIso && !Number.isNaN(new Date(expiryIso).getTime()) ? new Date(expiryIso) : null;
  const classified = classifySubscription(expiryDate);
  const used = Number.isFinite(Number(usedOverride)) ? Number(usedOverride) : Number(cached?.used || 0);
  const status = cached?.pending ? 'incomplete' : classified.status;
  const remaining = Math.max(0, plan.studentLimit - used);
  return {
    plan,
    selectedPlanId: plan.id,
    used,
    remaining,
    eligible: remaining > 0 && (status === 'active' || status === 'expiring'),
    expiryDate: expiryDate ? expiryDate.toISOString() : expiryIso,
    status,
    daysRemaining: status === 'incomplete' ? null : classified.daysRemaining,
    requiresPlanAction: status === 'incomplete' || status === 'expired',
  };
}

function hasAdminApproval(row: Record<string, unknown> | null | undefined): boolean {
  const meta = (row?.metadata || {}) as Record<string, unknown>;
  return Boolean(meta.approvedByAdmin || meta.grantedByAdmin || meta.extendedByAdmin || meta.approvedByCode);
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
  const subStatus = subRow?.status != null ? String(subRow.status) : '';
  if (subRow && (subStatus === 'pending' || !hasAdminApproval(subRow))) {
    const used = await getPlanStudentCount(tenantId);
    const requestedPlan = subRow.plan != null ? String(subRow.plan) : planId;
    const pendingPlan = getPlanById(requestedPlan || '') || null;
    const cached = getCachedPlanState(tenantId, used);
    if (cached && cached.status !== 'incomplete' && cached.status !== 'expired') {
      localStorage.setItem('schofy_sub_pending', '1');
      if (pendingPlan) {
        localStorage.setItem(pendingPlanCacheKey(tenantId), JSON.stringify({
          selectedPlanId: pendingPlan.id,
          status: 'incomplete',
          pending: true,
          cachedAt: new Date().toISOString(),
        }));
        localStorage.setItem('schofy_pending_plan', pendingPlan.id);
        localStorage.setItem('schofy_pending_plan_name', pendingPlan.name);
      }
      return cached;
    }
    const pendingState: SubscriptionAccessState = {
      plan: pendingPlan,
      selectedPlanId: pendingPlan?.id || requestedPlan || null,
      used,
      remaining: 0,
      eligible: false,
      expiryDate: null,
      status: 'incomplete',
      daysRemaining: null,
      requiresPlanAction: true,
    };
    if (pendingPlan) cachePlanStateLocally(tenantId, pendingState, true);
    return pendingState;
  }
  const settingsPlanId = planId ?? (await getCurrentPlanId(tenantId));
  const planFromRow = subRow?.plan != null ? String(subRow.plan).trim() : '';
  const selectedPlanId =
    (planFromRow && getPlanById(planFromRow) ? planFromRow : null) ??
    (settingsPlanId && getPlanById(settingsPlanId) ? settingsPlanId : null);
  const currentPlan = selectedPlanId ? getPlanById(selectedPlanId) : null;
  const used = await getPlanStudentCount(tenantId);

  if (!currentPlan) {
    const cached = getCachedPlanState(tenantId, used);
    if (cached) return cached;
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
  const cached = getCachedPlanState(tenantId, used);
  const expiryIso = endsFromRow || endsFromSettings || cached?.expiryDate || null;
  const expiryDate = expiryIso && !Number.isNaN(new Date(expiryIso).getTime()) ? new Date(expiryIso) : null;
  const { status, daysRemaining } = classifySubscription(expiryDate);
  const remaining = Math.max(0, currentPlan.studentLimit - used);
  const eligible = remaining > 0 && (status === 'active' || status === 'expiring');

  await persistPlanEligibility(tenantId, eligible);

  const state: SubscriptionAccessState = {
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
  cachePlanStateLocally(tenantId, state);
  return state;
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

  const startsAt =
    (subRow?.startsAt as string) ||
    (subRow?.starts_at as string) ||
    now.toISOString();
  const meta = {
    billingCycle,
    receiptAt: now.toISOString(),
    source: 'client',
  };

  await dataService.create(tenantId, 'subscriptions', {
    schoolId: tenantId,
    userId: authUserId,
    plan: planId,
    status: 'pending',
    startsAt,
    endsAt: startsAt,
    metadata: { ...meta, requestedEndsAt: nextExpiry.toISOString() },
  } as any);

  const pendingState: SubscriptionAccessState = {
    plan: selectedPlan,
    selectedPlanId: selectedPlan.id,
    used: await getPlanStudentCount(tenantId),
    remaining: 0,
    eligible: false,
    expiryDate: null,
    status: 'incomplete',
    daysRemaining: null,
    requiresPlanAction: true,
  };
  cachePlanStateLocally(tenantId, pendingState, true);
  return getSubscriptionAccessState(tenantId, undefined, opts);
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
