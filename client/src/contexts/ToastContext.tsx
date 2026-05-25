import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from 'react';

type ToastType = 'success' | 'error' | 'info' | 'warning';

interface Toast {
  id: string;
  message: string;
  type: ToastType;
  isExiting?: boolean;
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

const TOAST_SOUND_PATHS: Partial<Record<ToastType, string>> = {
  success: 'sound/success.mp3',
  error: 'sound/error.wav',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const soundRefs = useRef<Partial<Record<ToastType, HTMLAudioElement>>>({});
  const soundsUnlockedRef = useRef(false);
  const lastSoundTimeRef = useRef(0);

  const resolveSoundPath = useCallback((path: string) => {
    if (typeof window === 'undefined') return path;
    if (window.location.protocol === 'file:') {
      return new URL(path.replace(/^\//, ''), document.baseURI).toString();
    }
    return `/${path.replace(/^\//, '')}`;
  }, []);

  const getSound = useCallback((type: ToastType) => {
    const path = TOAST_SOUND_PATHS[type];
    if (!path || typeof window === 'undefined') return null;

    const existing = soundRefs.current[type];
    if (existing) return existing;

    const audio = new Audio(resolveSoundPath(path));
    audio.preload = 'auto';
    audio.volume = 0.65;
    soundRefs.current[type] = audio;
    return audio;
  }, [resolveSoundPath]);

  const unlockSounds = useCallback(() => {
    if (soundsUnlockedRef.current) return;
    soundsUnlockedRef.current = true;

    (['success', 'error'] as ToastType[]).forEach((type) => {
      const audio = getSound(type);
      if (!audio) return;

      const previousVolume = audio.volume;
      audio.volume = 0.001;
      audio.currentTime = 0;
      void audio.play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
          audio.volume = previousVolume;
        })
        .catch(() => {
          audio.volume = previousVolume;
        });
    });
  }, [getSound]);

  const playToastSound = useCallback((type: ToastType) => {
    if (type !== 'success' && type !== 'error') return;

    const now = Date.now();
    // Prevent harsh overlap if multiple toasts fire in the same instant.
    if (now - lastSoundTimeRef.current < 120) return;
    lastSoundTimeRef.current = now;

    const audio = getSound(type);
    if (!audio) return;

    audio.currentTime = 0;
    void audio.play().catch(() => {});
  }, [getSound]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const options: AddEventListenerOptions = { passive: true, once: true };
    window.addEventListener('pointerdown', unlockSounds, options);
    window.addEventListener('keydown', unlockSounds, { once: true });
    window.addEventListener('touchstart', unlockSounds, options);
    return () => {
      window.removeEventListener('pointerdown', unlockSounds);
      window.removeEventListener('keydown', unlockSounds);
      window.removeEventListener('touchstart', unlockSounds);
    };
  }, [unlockSounds]);

  const removeToast = useCallback((id: string) => {
    const timeout = timeoutRefs.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutRefs.current.delete(id);
    }
    
    setToasts((prev) => prev.map(t => 
      t.id === id ? { ...t, isExiting: true } : t
    ));
    
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 400);
  }, []);

  // Instant add toast without waiting for state
  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = { id, message, type };

    // Batch updates: if there are many toasts, only show the last 3
    setToasts((prev) => {
      const active = prev.filter(t => !t.isExiting);
      if (active.length >= 3) {
        const oldest = active[0];
        // We can't call removeToast here easily because of closure, 
        // but we can mark it for exit in the state update
        return prev.map(t => t.id === oldest.id ? { ...t, isExiting: true } : t).concat(newToast);
      }
      return [...prev, newToast];
    });

    playToastSound(type);

    const removeTimeout = setTimeout(() => {
      removeToast(id);
    }, 5000);
    timeoutRefs.current.set(id, removeTimeout);
  }, [playToastSound, removeToast]);

  useEffect(() => {
    return () => {
      timeoutRefs.current.forEach(timeout => clearTimeout(timeout));
      Object.values(soundRefs.current).forEach((audio) => {
        if (!audio) return;
        audio.pause();
      });
      soundRefs.current = {};
    };
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

function ToastContainer({ toasts, onRemove }: { toasts: Toast[]; onRemove: (id: string) => void }) {
  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <div 
          key={toast.id} 
          className={`toast toast-${toast.type} ${toast.isExiting ? 'toast-exit' : 'toast-enter'}`}
        >
          <div className="toast-icon">
            {toast.type === 'success' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            {toast.type === 'warning' && (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            )}
          </div>
          <span className="toast-message">{toast.message}</span>
          <button
            onClick={() => onRemove(toast.id)}
            className="toast-close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
