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
  success: '/sound/success.wav',
  error: '/sound/error.wav',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timeoutRefs = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const soundRefs = useRef<Partial<Record<ToastType, HTMLAudioElement>>>({});
  const lastSoundTimeRef = useRef(0);

  const getSound = useCallback((type: ToastType) => {
    const path = TOAST_SOUND_PATHS[type];
    if (!path || typeof window === 'undefined') return null;

    const existing = soundRefs.current[type];
    if (existing) return existing;

    const audio = new Audio(path);
    audio.preload = 'auto';
    audio.volume = 0.65;
    soundRefs.current[type] = audio;
    return audio;
  }, []);

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

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    playToastSound(type);

    setToasts((prev) => {
      const existingIndex = prev.findIndex(t => !t.isExiting);
      if (existingIndex !== -1) {
        const existing = prev[existingIndex];
        const timeout = timeoutRefs.current.get(existing.id);
        if (timeout) {
          clearTimeout(timeout);
          timeoutRefs.current.delete(existing.id);
        }
        
        const newToasts = prev.filter(t => t.id !== existing.id);
        const id = Date.now().toString();
        const newToast: Toast = { id, message, type };
        
        const removeTimeout = setTimeout(() => {
          removeToast(id);
        }, 4000);
        timeoutRefs.current.set(id, removeTimeout);
        
        return [...newToasts, newToast];
      }
      
      const id = Date.now().toString();
      const newToast: Toast = { id, message, type };
      
      const removeTimeout = setTimeout(() => {
        removeToast(id);
      }, 4000);
      timeoutRefs.current.set(id, removeTimeout);
      
      return [...prev, newToast];
    });
  }, [removeToast, playToastSound]);

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
