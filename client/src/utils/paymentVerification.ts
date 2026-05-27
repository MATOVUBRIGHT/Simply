import { dataService } from '../lib/database/SupabaseDataService';
import { supabase } from '../lib/supabase';
import {
  BillingCycle,
  SubscriptionAccessState,
  cachePlanStateLocally,
  getPlanById,
  getPlanStudentCount,
} from './plans';
import { EMBEDDED_ACCESS_GRANTS, PAYMENT_ACCESS_HASH_SALT, EmbeddedAccessGrant } from './accessGrants';

const USED_CODES_KEY = 'schofy_used_payment_verification_codes';
const TERMINATED_CODES_KEY = 'schofy_terminated_payment_verification_codes';
export const VERIFICATION_CONTROL_TENANT = 'schofy-system';
export const VERIFICATION_TERMINATED_SETTING = 'paymentVerificationTerminatedCodes';

type VerificationStatus = 'valid' | 'invalid' | 'used' | 'terminated' | 'error';

export interface VerificationCodeResult {
  status: VerificationStatus;
  message: string;
  grant?: EmbeddedAccessGrant;
  expiryDate?: string;
}

function readHashList(key: string): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function writeHashList(key: string, hashes: string[]) {
  localStorage.setItem(key, JSON.stringify(Array.from(new Set(hashes))));
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function cycleMonths(cycle: BillingCycle) {
  if (cycle === 'monthly') return 1;
  if (cycle === 'yearly') return 12;
  return 3;
}

function normalizeVerificationCode(code: string) {
  return code.trim();
}

export async function hashVerificationCode(code: string) {
  const value = `${PAYMENT_ACCESS_HASH_SALT}::${normalizeVerificationCode(code)}`;
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function getVerificationCodeCatalog() {
  return EMBEDDED_ACCESS_GRANTS;
}

export function getLocalUsedVerificationCodeHashes() {
  return readHashList(USED_CODES_KEY);
}

export function getLocalTerminatedVerificationCodeHashes() {
  return readHashList(TERMINATED_CODES_KEY);
}

export function setLocalTerminatedVerificationCodeHashes(hashes: string[]) {
  writeHashList(TERMINATED_CODES_KEY, hashes);
}

async function getSettingHashList(tenantId: string, key: string) {
  const rows = await dataService.getAll(tenantId, 'settings');
  const row = rows.find((s: { key?: string }) => s.key === key);
  const value = row?.value;
  if (Array.isArray(value)) return value.filter((v): v is string => typeof v === 'string');
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function loadTerminatedVerificationCodeHashes() {
  const local = getLocalTerminatedVerificationCodeHashes();
  if (!supabase || typeof navigator !== 'undefined' && !navigator.onLine) return local;
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('school_id', VERIFICATION_CONTROL_TENANT)
      .eq('key', VERIFICATION_TERMINATED_SETTING)
      .maybeSingle();
    if (error) throw error;
    const remote = Array.isArray(data?.value) ? data.value.filter((v): v is string => typeof v === 'string') : [];
    const merged = Array.from(new Set([...local, ...remote]));
    writeHashList(TERMINATED_CODES_KEY, merged);
    return merged;
  } catch {
    return local;
  }
}

async function isCodeUsedRemotely(codeHash: string) {
  if (!supabase || typeof navigator !== 'undefined' && !navigator.onLine) return false;
  try {
    const { data, error } = await supabase
      .from('subscriptions')
      .select('id')
      .contains('metadata', { verificationCodeHash: codeHash })
      .limit(1);
    if (error) throw error;
    return Boolean(data?.length);
  } catch {
    return false;
  }
}

export async function redeemPaymentVerificationCode(
  tenantId: string,
  authUserId: string | undefined,
  rawCode: string
): Promise<VerificationCodeResult> {
  const code = normalizeVerificationCode(rawCode);
  if (!code) return { status: 'invalid', message: 'Enter a verification code.' };

  try {
    const codeHash = await hashVerificationCode(code);
    const grant = EMBEDDED_ACCESS_GRANTS.find((item) => item.codeHash === codeHash);
    if (!grant) return { status: 'invalid', message: 'This verification code is not valid.' };

    const terminated = await loadTerminatedVerificationCodeHashes();
    if (terminated.includes(codeHash)) {
      return { status: 'terminated', message: 'This verification code has been terminated.', grant };
    }

    const usedLocal = new Set([
      ...getLocalUsedVerificationCodeHashes(),
      ...(await getSettingHashList(tenantId, 'usedPaymentVerificationCodes')),
    ]);
    if (usedLocal.has(codeHash) || await isCodeUsedRemotely(codeHash)) {
      return { status: 'used', message: 'This verification code has already been used.', grant };
    }

    const plan = getPlanById(grant.planId);
    if (!plan) return { status: 'invalid', message: 'This code points to a plan that no longer exists.', grant };

    const now = new Date();
    const expiry = addMonths(now, cycleMonths(grant.billingCycle));
    const used = await getPlanStudentCount(tenantId);
    const state: SubscriptionAccessState = {
      plan,
      selectedPlanId: plan.id,
      used,
      remaining: Math.max(0, plan.studentLimit - used),
      eligible: used < plan.studentLimit,
      expiryDate: expiry.toISOString(),
      status: 'active',
      daysRemaining: Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      requiresPlanAction: false,
    };

    const nextUsed = Array.from(new Set([...usedLocal, codeHash]));
    writeHashList(USED_CODES_KEY, nextUsed);
    cachePlanStateLocally(tenantId, state);

    await dataService.create(tenantId, 'subscriptions', {
      schoolId: tenantId,
      userId: authUserId || tenantId,
      plan: plan.id,
      status: 'active',
      startsAt: now.toISOString(),
      endsAt: expiry.toISOString(),
      metadata: {
        source: 'verification_code',
        approvedByCode: true,
        verificationCodeHash: codeHash,
        verificationCodeLabel: grant.label,
        verificationTokenHash: grant.tokenHash,
        billingCycle: grant.billingCycle,
        amount: grant.amount,
        planName: grant.planName,
        activatedAt: now.toISOString(),
      },
    } as any);

    await dataService.saveSettings(tenantId, {
      subscriptionPlanId: plan.id,
      subscriptionPlanEligible: true,
      subscriptionExpiryDate: expiry.toISOString(),
      subscriptionBillingCycle: grant.billingCycle,
      usedPaymentVerificationCodes: nextUsed,
      subscriptionReceipt: {
        planId: plan.id,
        planName: plan.name,
        billingCycle: grant.billingCycle,
        amount: grant.amount,
        paidAt: now.toISOString(),
        expiresAt: expiry.toISOString(),
        source: 'verification_code',
        verificationCodeLabel: grant.label,
        verificationTokenHash: grant.tokenHash,
      },
    });

    return {
      status: 'valid',
      message: `${plan.name} access verified. Your plan is active until ${expiry.toLocaleDateString()}.`,
      grant,
      expiryDate: expiry.toISOString(),
    };
  } catch (error) {
    console.error('Payment verification failed:', error);
    return { status: 'error', message: 'Could not verify this code right now. Please try again.' };
  }
}
