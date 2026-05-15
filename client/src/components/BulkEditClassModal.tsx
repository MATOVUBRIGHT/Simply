import { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';
import { Portal } from './Portal';
import type { Class } from '@schofy/shared';
import { sortClassesBySectionThenLevel, groupClassesBySection, getClassDisplayName } from '../utils/classroom';

interface BulkEditClassModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (classId: string) => Promise<void>;
  studentCount: number;
  classes: Class[];
  currentClassId?: string;
}

export function BulkEditClassModal({
  isOpen,
  onClose,
  onSave,
  studentCount,
  classes,
  currentClassId,
}: BulkEditClassModalProps) {
  const [selectedClass, setSelectedClass] = useState(currentClassId || '');
  const [saving, setSaving] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedClass(currentClassId || '');
      requestAnimationFrame(() => setVisible(true));
    } else {
      setVisible(false);
    }
  }, [isOpen, currentClassId]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen]);

  function handleClose() {
    setVisible(false);
    setTimeout(onClose, 180);
  }

  async function handleSave() {
    if (!selectedClass) return;
    setSaving(true);
    try {
      await onSave(selectedClass);
      handleClose();
    } catch (error) {
      console.error('Failed to update classes:', error);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  const groupedClasses = groupClassesBySection(classes);

  return (
    <Portal>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
        style={{
          backgroundColor: visible ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0)',
          WebkitBackdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
          backdropFilter: visible ? 'blur(4px)' : 'blur(0px)',
          transition: 'background-color 0.2s ease, backdrop-filter 0.2s ease',
        }}
        onClick={handleClose}
      >
        <div
          className="bg-white dark:bg-slate-800 w-full max-w-[520px] overflow-hidden"
          style={{
            borderRadius: '20px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)',
            border: '1px solid rgba(0,0,0,0.06)',
            transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(16px)',
            opacity: visible ? 1 : 0,
            transition: 'transform 0.22s cubic-bezier(0.34,1.56,0.64,1), opacity 0.18s ease',
          }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-7 py-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                <Users size={20} className="text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-[17px]">
                  Edit Class for {studentCount} Student{studentCount !== 1 ? 's' : ''}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Assign all selected students to a class
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={18} className="text-slate-400" />
            </button>
          </div>

          {/* Body */}
          <div className="px-7 py-6 max-h-[60vh] overflow-y-auto">
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
              Select Class
            </label>
            
            <div className="space-y-4">
              {groupedClasses.map(({ section, label, classes: sectionClasses }) => (
                <div key={section}>
                  <div className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 px-2">
                    {label}
                  </div>
                  <div className="space-y-1">
                    {sectionClasses.map((cls) => (
                      <button
                        key={cls.id}
                        onClick={() => setSelectedClass(cls.id)}
                          className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all"
                      >
                        <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                            <span className="font-medium text-slate-700 dark:text-slate-200">
                            {getClassDisplayName(cls.id, classes)}
                          </span>
                        </div>
                        {(cls as any).capacity && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            Capacity: {(cls as any).capacity}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="px-7 py-5 border-t border-slate-200 dark:border-slate-700 flex gap-3 justify-end">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
              style={{ background: '#F3F4F6' }}
              onMouseEnter={e => !saving && (e.currentTarget.style.background = '#E5E7EB')}
              onMouseLeave={e => !saving && (e.currentTarget.style.background = '#F3F4F6')}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedClass || saving}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Users size={16} />
                  Update {studentCount} Student{studentCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
