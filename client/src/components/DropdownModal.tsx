import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface DropdownModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxHeight?: string;
  icon?: React.ReactNode;
  iconColor?: string;
}

export default function DropdownModal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  maxHeight = 'max-h-80',
  icon,
  iconColor = 'text-indigo-500'
}: DropdownModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[800000] flex items-center justify-center p-4"
      style={{ animation: 'fadeIn 0.2s ease-out' }}
    >
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={onClose}
        style={{ animation: 'fadeIn 0.2s ease-out' }}
      />
      <div 
        ref={modalRef}
        className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-700"
        style={{ 
          animation: 'slideUp 0.3s ease-out',
          maxHeight: 'calc(100vh - 2rem)'
        }}
      >
        <div className="sticky top-0 z-10 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-3">
              {icon && (
                <div className={`w-10 h-10 rounded-xl bg-white dark:bg-slate-700 shadow-sm flex items-center justify-center`}>
                  <span className={iconColor}>{icon}</span>
                </div>
              )}
              <div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-white">{title}</h3>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="p-2 hover:bg-white/50 dark:hover:bg-slate-700/50 rounded-xl transition-colors"
            >
              <X size={20} className="text-slate-500" />
            </button>
          </div>
        </div>
        <div className={`overflow-y-auto ${maxHeight}`}>
          {children}
        </div>
      </div>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.95); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
