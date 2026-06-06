import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

export type PortalSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type PortalSelectProps = {
  value: string;
  options: PortalSelectOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export function PortalSelect({
  value,
  options,
  onChange,
  placeholder = 'Select',
  className = '',
  disabled = false,
}: PortalSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 180, maxHeight: 288 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find(option => option.value === value);
  const allOption = options.find(option => /^(all|any)\b/i.test(option.label.trim()) && (option.value === '' || option.value === 'all'));
  const filterActive = Boolean(allOption && value && value !== allOption.value);

  function updatePosition() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.max(rect.width, 180);
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const maxHeight = Math.max(160, Math.min(288, Math.max(spaceBelow, spaceAbove) - gap));
    const openUp = spaceBelow < 180 && spaceAbove > spaceBelow;
    setPos({
      top: openUp ? Math.max(8, rect.top - maxHeight - gap) : rect.bottom + gap,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      width,
      maxHeight,
    });
  }

  function toggleOpen() {
    if (disabled) return;
    if (isOpen) {
      setIsOpen(false);
      return;
    }
    updatePosition();
    setIsOpen(true);
  }

  useEffect(() => {
    if (!isOpen) return;

    function handleMouseDown(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }

    updatePosition();
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={toggleOpen}
        className={`form-input flex min-w-0 items-center justify-between gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60 ${filterActive ? 'filter-input-active' : ''} ${className}`}
      >
        <span className={`min-w-0 truncate ${selected ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400'}`}>
          {selected?.label || placeholder}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="fixed z-[999999] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-2xl animate-dropdown-in dark:border-slate-700 dark:bg-slate-800"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
        >
          {options.map(option => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (option.disabled) return;
                  onChange(option.value);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                  active
                    ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                    : 'text-slate-700 hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {active && <Check size={14} className="shrink-0" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

export default PortalSelect;
