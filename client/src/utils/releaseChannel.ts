export const isUnlockedRelease = import.meta.env.MODE.includes('unlocked') || import.meta.env.VITE_SCHOFY_UNLOCKED === 'true';
export const releaseChannelLabel = isUnlockedRelease ? 'Unlocked Release' : 'Locked Release';
export const appLogoFileName = isUnlockedRelease ? 'Schofy.logo_unlocked.png' : 'schofy.logo.png';
export const appIconFileName = isUnlockedRelease ? 'icon-192-unlocked.png' : 'icon-192.png';
