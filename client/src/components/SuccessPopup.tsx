import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { Portal } from './Portal';

interface SuccessPopupProps {
  message: string;
  subMessage?: string;
  onClose?: () => void;
  duration?: number;
}

export function SuccessPopup({ message, subMessage, onClose, duration = 2000 }: SuccessPopupProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Animate in
    const timerIn = setTimeout(() => setVisible(true), 10);
    
    // Animate out and close
    const timerOut = setTimeout(() => {
      setVisible(false);
      setTimeout(() => {
        if (onClose) onClose();
      }, 300);
    }, duration);

    return () => {
      clearTimeout(timerIn);
      clearTimeout(timerOut);
    };
  }, [duration, onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-[10000] flex items-center justify-center pointer-events-none">
        <div 
          className={`bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 flex flex-col items-center gap-4 transition-all duration-300 ease-out transform ${
            visible ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
          }`}
          style={{ width: 'min(90vw, 320px)' }}
        >
          <div className={`w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-all duration-500 delay-100 transform ${visible ? 'scale-100' : 'scale-0'}`}>
            <Check size={40} className="text-white" strokeWidth={3} />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white">
              {message}
            </h3>
            {subMessage && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                {subMessage}
              </p>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
