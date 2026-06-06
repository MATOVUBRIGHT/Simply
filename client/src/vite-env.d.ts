/// <reference types="vite/client" />

declare module '*.svg' {
  const content: string;
  export default content;
}

declare module '*.png' {
  const content: string;
  export default content;
}

declare module '*.jpg' {
  const content: string;
  export default content;
}

declare module 'uuid' {
  export function v4(): string;
}

interface Window {
  electronAPI?: {
    writeBackup?: (key: string, data: string) => Promise<{ success: boolean; error?: string }>;
    readBackup?: (key: string) => Promise<string | null>;
    getAppVersion?: () => Promise<string>;
    openExternal?: (url: string) => Promise<{ success: boolean; error?: string }>;
    checkOnline?: () => Promise<boolean>;
  };
}
