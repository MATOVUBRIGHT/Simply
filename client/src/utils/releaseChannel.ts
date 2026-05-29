export const isUnlockedRelease = import.meta.env.MODE.includes('unlocked') || import.meta.env.VITE_SCHOFY_UNLOCKED === 'true';
export const releaseChannelLabel = isUnlockedRelease ? 'Unlocked Release' : 'Locked Release';
