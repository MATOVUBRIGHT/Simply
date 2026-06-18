import { X } from 'lucide-react';
import { Portal } from './Portal';

interface ImageModalProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ImageModal({ src, alt, isOpen, onClose }: ImageModalProps) {
  if (!isOpen) return null;

  return (
    <Portal>
      <div 
        className="fixed inset-0 z-[1000000] flex items-center justify-center p-4"
        style={{
          backgroundColor: 'rgba(0,0,0,0.45)',
          WebkitBackdropFilter: 'blur(4px)',
          backdropFilter: 'blur(4px)',
          transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
        }}
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-label={alt}
      >
        <div 
          className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden bg-white dark:bg-slate-800"
          style={{
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)',
            animation: 'modalIn 0.22s cubic-bezier(0.34,1.56,0.64,1) both',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-3 px-5 py-4">
            <p className="min-w-0 truncate text-[17px] font-bold leading-snug text-slate-900 dark:text-white">{alt}</p>
            <button 
              type="button"
              onClick={onClose}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 transition-colors hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
              title="Close image preview"
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-5 pb-5">
            <div className="flex min-h-[280px] items-center justify-center overflow-hidden rounded-2xl bg-slate-100 dark:bg-slate-950">
              <img 
                src={src} 
                alt={alt}
                className="max-h-[72vh] max-w-full object-contain"
              />
            </div>
          </div>
        </div>
      </div>
    </Portal>
  );
}
