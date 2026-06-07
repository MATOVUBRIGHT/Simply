import { isDesktopApp } from './desktopSyncPreference';
import { isUnlockedRelease } from './releaseChannel';

const UNLIMITED_PLAN_ID = 'unlimited';

type UnlimitedAccessSource = 'remote_subscription' | 'verification_code';

export function canUseUnlimitedAccountAccess(options: {
  planId?: string | null;
  source?: UnlimitedAccessSource | string;
  verificationCodeHash?: string | null;
}) {
  if (options.planId !== UNLIMITED_PLAN_ID) return true;
  if (!isDesktopApp()) return true;
  return Boolean(
    isUnlockedRelease &&
    options.source === 'verification_code' &&
    options.verificationCodeHash
  );
}

export function canRedeemUnlimitedCodeInCurrentApp() {
  return !isDesktopApp() || isUnlockedRelease;
}

export function getUnlimitedAccessRequirementMessage() {
  if (!isDesktopApp()) {
    return 'Unlimited web access needs an approved Unlimited plan or verification code. Sign in online once on each device so the account access can be detected.';
  }
  return isUnlockedRelease
    ? 'Unlimited desktop access needs an Unlimited verification code. Enter the code online once, then this device can continue offline.'
    : 'Unlimited codes work only in the Schofy Unlimited desktop version.';
}
