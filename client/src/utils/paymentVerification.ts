import { dataService } from '../lib/database/SupabaseDataService';
import { supabase } from '../lib/supabase';
import {
  BillingCycle,
  SubscriptionAccessState,
  cachePlanStateLocally,
  getPlanById,
  getPlanStaffLimit,
  getPlanStudentCount,
} from './plans';
import { EMBEDDED_ACCESS_GRANTS, PAYMENT_ACCESS_HASH_SALT, EmbeddedAccessGrant } from './accessGrants';
import { createVerifiedPlanProof } from './planProof';
import { canRedeemUnlimitedCodeInCurrentApp } from './unlimitedAccess';

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
  if (cycle === 'one_time') return 12;
  return 3;
}

function normalizeVerificationCode(code: string) {
  return code.trim();
}

function compactVerificationCode(code: string) {
  return code.trim().toUpperCase().replace(/[\s-]+/g, '');
}

function getVerificationCodeCandidates(code: string) {
  return Array.from(new Set([
    normalizeVerificationCode(code),
    normalizeVerificationCode(code).toUpperCase(),
    compactVerificationCode(code),
  ].filter(Boolean)));
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

async function isCodeUsedByAnotherTenant(codeHash: string, tenantId: string) {
  if (!supabase || typeof navigator !== 'undefined' && !navigator.onLine) {
    throw new Error('Online verification is required.');
  }
  const { data, error } = await supabase
    .from('subscriptions')
    .select('school_id')
    .contains('metadata', { verificationCodeHash: codeHash })
    .limit(5);
  if (error) throw error;
  return Boolean(data?.some(row => String(row.school_id || '') !== tenantId));
}

export async function redeemPaymentVerificationCode(
  tenantId: string,
  authUserId: string | undefined,
  rawCode: string
): Promise<VerificationCodeResult> {
  const code = normalizeVerificationCode(rawCode);
  if (!code) return { status: 'invalid', message: 'Enter a verification code.' };

  try {
    const online = typeof navigator === 'undefined' ? true : navigator.onLine;
    if (!online) {
      return {
        status: 'error',
        message: 'Connect to the internet the first time you activate a Schofy code. After it verifies, this device can continue offline.',
      };
    }

    const candidateHashes = await Promise.all(
      getVerificationCodeCandidates(code).map(async (candidate) => ({
        candidate,
        hash: await hashVerificationCode(candidate),
      }))
    );
    const matched = candidateHashes.find(({ hash }) => EMBEDDED_ACCESS_GRANTS.some((item) => item.codeHash === hash));
    const codeHash = matched?.hash || candidateHashes[0]?.hash || '';
    const grant = codeHash ? EMBEDDED_ACCESS_GRANTS.find((item) => item.codeHash === codeHash) : undefined;
    if (!grant) return { status: 'invalid', message: 'This verification code is not valid.' };
    if (grant.planId === 'unlimited' && !canRedeemUnlimitedCodeInCurrentApp()) {
      return {
        status: 'invalid',
        message: 'This Unlimited code works only in the Schofy Unlimited desktop version on desktop. On the web, sign in online to activate it for this account.',
        grant,
      };
    }

    const isUnlimitedGrant = grant.planId === 'unlimited';
    const terminated = await loadTerminatedVerificationCodeHashes();
    if (terminated.includes(codeHash)) {
      return { status: 'terminated', message: 'This verification code has been terminated.', grant };
    }

    const tenantUsedCodes = await getSettingHashList(tenantId, 'usedPaymentVerificationCodes');
    const usedLocal = new Set([
      ...getLocalUsedVerificationCodeHashes(),
      ...tenantUsedCodes,
    ]);
    const usedByAnotherTenant = supabase && online ? await isCodeUsedByAnotherTenant(codeHash, tenantId) : false;
    const sameTenantUnlimitedCode = canRedeemUnlimitedCodeInCurrentApp()
      && isUnlimitedGrant
      && (
        tenantUsedCodes.includes(codeHash)
        || localStorage.getItem('schofy_plan_verification_code_hash') === codeHash
      );
    if (usedByAnotherTenant || (usedLocal.has(codeHash) && !sameTenantUnlimitedCode)) {
      return { status: 'used', message: 'This verification code has already been used.', grant };
    }

    const plan = getPlanById(grant.planId);
    if (!plan) return { status: 'invalid', message: 'This code points to a plan that no longer exists.', grant };

    const now = new Date();
    const isUnlimitedPlan = plan.id === 'unlimited';
    const expiry = isUnlimitedPlan ? new Date('2099-12-31T23:59:59.999Z') : addMonths(now, cycleMonths(grant.billingCycle));
    const used = await getPlanStudentCount(tenantId);
    const remaining = isUnlimitedPlan ? Number.MAX_SAFE_INTEGER : Math.max(0, plan.studentLimit - used);
    const state: SubscriptionAccessState = {
      plan,
      selectedPlanId: plan.id,
      used,
      remaining,
      eligible: isUnlimitedPlan || used < plan.studentLimit,
      expiryDate: expiry.toISOString(),
      status: 'active',
      daysRemaining: Math.ceil((expiry.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      requiresPlanAction: false,
    };

    const nextUsed = Array.from(new Set([...usedLocal, codeHash]));
    const remoteVerifiedAt = now.toISOString();
    const metadata = {
      source: 'verification_code',
      approvedByCode: true,
      approvedByAdmin: true,
      verificationCodeHash: codeHash,
      verificationCodeLabel: grant.label,
      verificationTokenHash: grant.tokenHash,
      billingCycle: grant.billingCycle,
      amount: grant.amount,
      planName: grant.planName,
      unlimited: isUnlimitedPlan,
      activatedAt: remoteVerifiedAt,
    };

    const receipt = {
      planId: plan.id,
      planName: plan.name,
      billingCycle: grant.billingCycle,
      amount: grant.amount,
      paidAt: remoteVerifiedAt,
      expiresAt: expiry.toISOString(),
      source: 'verification_code',
      verificationCodeLabel: grant.label,
      verificationTokenHash: grant.tokenHash,
    };
    const settingsPayload = {
      subscriptionPlanId: plan.id,
      subscriptionPlanLimit: plan.studentLimit,
      subscriptionStaffLimit: getPlanStaffLimit(plan),
      subscriptionPlanEligible: true,
      subscriptionExpiryDate: expiry.toISOString(),
      subscriptionBillingCycle: grant.billingCycle,
      usedPaymentVerificationCodes: nextUsed,
      subscriptionReceipt: receipt,
    };

    if (!supabase || !online) {
      return {
        status: 'error',
        message: 'Online Schofy verification is required before this code can unlock local access.',
      };
    }

    try {
      const { error: subError } = await supabase.from('subscriptions').insert({
        id: crypto.randomUUID(),
        school_id: tenantId,
        user_id: authUserId || tenantId,
        plan: plan.id,
        status: 'active',
        starts_at: remoteVerifiedAt,
        ends_at: expiry.toISOString(),
        metadata,
        created_at: remoteVerifiedAt,
        updated_at: remoteVerifiedAt,
      });
      if (subError) throw subError;

      const { error: settingsError } = await supabase.from('settings').upsert(
        Object.entries(settingsPayload).map(([key, value]) => ({
          school_id: tenantId,
          key,
          value,
          created_at: remoteVerifiedAt,
          updated_at: remoteVerifiedAt,
        })),
        { onConflict: 'school_id,key' }
      );
      if (settingsError) throw settingsError;
    } catch (syncError) {
      console.warn('Payment verification rejected because remote activation could not be recorded:', syncError);
      return {
        status: 'error',
        message: 'Could not record this code online. Connect to internet and try again, or contact Schofy support.',
      };
    }

    writeHashList(USED_CODES_KEY, nextUsed);
    localStorage.setItem('schofy_plan_remote_verified_at', remoteVerifiedAt);
    localStorage.setItem('schofy_plan_verification_code_hash', codeHash);
    localStorage.setItem('schofy_sub_expiry', expiry.toISOString());
    localStorage.setItem('schofy_sub_status', 'active');
    localStorage.setItem('schofy_sub_plan', plan.id);
    localStorage.setItem('schofy_sub_pending', '0');
    cachePlanStateLocally(tenantId, state);
    await createVerifiedPlanProof({
      tenantId,
      schofy_sub_expiry: expiry.toISOString(),
      schofy_sub_status: 'active',
      schofy_sub_plan: plan.id,
      schofy_sub_pending: '0',
      remoteVerifiedAt,
      verificationCodeHash: codeHash,
      source: 'verification_code',
    });
    void dataService.saveSettings(tenantId, settingsPayload);

    return {
      status: 'valid',
      message: `${plan.name} access verified on this device. Your plan is active until ${expiry.toLocaleDateString()} and can continue offline here.`,
      grant,
      expiryDate: expiry.toISOString(),
    };
  } catch (error) {
    console.error('Payment verification failed:', error);
    return { status: 'error', message: 'Could not verify this code right now. Please try again.' };
  }
}
