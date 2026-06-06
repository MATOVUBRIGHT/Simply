import { X } from 'lucide-react';

interface ImageModalProps {
  src: string;
  alt: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function ImageModal({ src, alt, isOpen, onClose }: ImageModalProps) {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[800000] flex items-center justify-center p-4 bg-white/95 dark:bg-slate-900/95 animate-backdrop-in"
      onClick={onClose}
    >
      <button 
        onClick={onClose}
        className="absolute top-4 right-4 p-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full transition-colors shadow-lg z-10"
      >
        <X size={20} className="text-slate-600 dark:text-slate-300" />
      </button>
      <div 
        className="relative max-w-full max-h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        <img 
          src={src} 
          alt={alt}
          className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl animate-modal-in"
        />
      </div>
    </div>
  );
}
