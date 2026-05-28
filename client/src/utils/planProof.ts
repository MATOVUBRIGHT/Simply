const PROOF_KEY_PREFIX = 'schofy_verified_plan_backup_';
const DEVICE_SECRET_KEY = 'schofy_plan_device_secret';

export type VerifiedPlanProofValues = {
  schofy_sub_expiry: string;
  schofy_sub_status: string;
  schofy_sub_plan: string;
  schofy_sub_pending: string;
  tenantId: string;
  remoteVerifiedAt: string;
  verificationCodeHash?: string;
  source: 'remote_subscription' | 'verification_code';
};

type StoredVerifiedPlanProof = {
  savedAt: number;
  values: VerifiedPlanProofValues;
  proof: string;
};

function getOrCreateDeviceSecret() {
  let secret = localStorage.getItem(DEVICE_SECRET_KEY);
  if (!secret) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    secret = Array.from(bytes).map(byte => byte.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(DEVICE_SECRET_KEY, secret);
  }
  return secret;
}

function stablePayload(values: VerifiedPlanProofValues) {
  return [
    values.tenantId,
    values.schofy_sub_plan,
    values.schofy_sub_status,
    values.schofy_sub_pending,
    values.schofy_sub_expiry,
    values.remoteVerifiedAt,
    values.verificationCodeHash || '',
    values.source,
  ].join('|');
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function verifiedPlanProofKey(tenantId: string) {
  return `${PROOF_KEY_PREFIX}${tenantId}`;
}

export async function createVerifiedPlanProof(values: VerifiedPlanProofValues) {
  const proof = await sha256Hex(`${getOrCreateDeviceSecret()}::${stablePayload(values)}`);
  const stored: StoredVerifiedPlanProof = { savedAt: Date.now(), values, proof };
  localStorage.setItem(verifiedPlanProofKey(values.tenantId), JSON.stringify(stored));
  return stored;
}

export async function readVerifiedPlanProof(tenantId: string): Promise<StoredVerifiedPlanProof | null> {
  try {
    const parsed = JSON.parse(localStorage.getItem(verifiedPlanProofKey(tenantId)) || 'null') as StoredVerifiedPlanProof | null;
    if (!parsed?.values || !parsed.proof) return null;
    if (parsed.values.tenantId !== tenantId) return null;
    const expected = await sha256Hex(`${getOrCreateDeviceSecret()}::${stablePayload(parsed.values)}`);
    if (expected !== parsed.proof) return null;
    const expiry = new Date(parsed.values.schofy_sub_expiry);
    const active = parsed.values.schofy_sub_status === 'active' || parsed.values.schofy_sub_status === 'expiring';
    const pending = parsed.values.schofy_sub_pending === '1';
    if (!active || pending || Number.isNaN(expiry.getTime()) || expiry.getTime() <= Date.now()) return null;
    return parsed;
  } catch {
    localStorage.removeItem(verifiedPlanProofKey(tenantId));
    return null;
  }
}

export async function restoreVerifiedPlanProof(tenantId: string) {
  const proof = await readVerifiedPlanProof(tenantId);
  if (!proof) return false;
  const { values } = proof;
  localStorage.setItem('schofy_sub_expiry', values.schofy_sub_expiry);
  localStorage.setItem('schofy_sub_status', values.schofy_sub_status);
  localStorage.setItem('schofy_sub_plan', values.schofy_sub_plan);
  localStorage.setItem('schofy_sub_pending', values.schofy_sub_pending);
  return true;
}
