/**
 * PortalDropdown — renders action buttons / menu items via a portal so they
 * are never clipped by overflow:hidden or overflow:auto parents.
 *
 * Usage:
 *   <PortalDropdown
 *     trigger={<button ref={triggerRef}>Actions</button>}
 *     triggerRef={triggerRef}
 *     isOpen={open}
 *     onClose={() => setOpen(false)}
 *   >
 *     <PortalDropdown.Item icon={<Edit />} label="Edit" onClick={...} />
 *     <PortalDropdown.Divider />
 *     <PortalDropdown.Item icon={<Trash />} label="Delete" onClick={...} danger />
 *   </PortalDropdown>
 */
import { useEffect, useRef, useState, ReactNode } from 'react';
import { createPortal } from 'react-dom';

interface DropdownItemProps {
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}

function Item({ icon, label, onClick, danger, disabled }: DropdownItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
        danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 dark:hover:text-indigo-400'
      }`}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      {label}
    </button>
  );
}

function Divider() {
  return <div className="shrink-0 w-px h-5 bg-slate-200 dark:bg-slate-600 mx-0.5" />;
}

interface PortalDropdownProps {
  /** The trigger element — must be a button with a ref */
  triggerRef: React.RefObject<HTMLElement>;
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Unique id for the panel (used for click-outside detection) */
  id?: string;
}

export function PortalDropdown({ triggerRef, isOpen, onClose, children, id }: PortalDropdownProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  // Recalculate position whenever it opens
  useEffect(() => {
    if (!isOpen || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }, [isOpen, triggerRef]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      onClose();
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen, onClose, triggerRef]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      className="fixed z-[99999] flex flex-wrap items-center gap-1 overflow-visible p-1.5 bg-white dark:bg-slate-800 rounded-xl shadow-2xl border border-slate-200 dark:border-slate-700 animate-dropdown-in"
      style={{
        top: pos.top,
        right: pos.right,
        width: 'max-content',
        maxWidth: 'calc(100vw - 16px)',
      }}
      onClick={e => e.stopPropagation()}
    >
      {children}
    </div>,
    document.body
  );
}

PortalDropdown.Item = Item;
PortalDropdown.Divider = Divider;

export default PortalDropdown;
