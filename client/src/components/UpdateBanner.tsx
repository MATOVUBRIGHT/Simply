import { useState, useEffect } from 'react';
import { Sparkles, X, ChevronDown, ChevronUp } from 'lucide-react';

// Bump this version string whenever you deploy new features.
// The banner shows once per version, then is dismissed forever.
const APP_VERSION = 'Version1.1';
const STORAGE_KEY = `schofy_seen_update_${APP_VERSION}`;

const CHANGELOG = [
  { text: 'New report card templates with school logo watermark and PDF export.' },
  { text: 'Classes & Timetables now includes colored timetable blocks, full screen editing, room, exam, event, and free-time support.' },
  { text: 'Student profiles now include Subjects, optional OPs, and S5/S6 combinations.' },
  { text: 'Finance adds expenses, profit reporting, payment accounts, invoice improvements, and one-time verification codes.' },
  { text: 'Parents & Emails, Assignments, custom grading, sidebar organization, and assistant read-aloud are now available.' },
  { text: 'Sync, offline queue handling, list performance, imports, searches, filters, and responsive scrolling were improved.' },
];

export default function UpdateBanner() {
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Small delay so it doesn't flash on first paint
    const t = setTimeout(() => {
      if (!localStorage.getItem(STORAGE_KEY)) {
        localStorage.setItem(STORAGE_KEY, '1');
        setVisible(true);
      }
    }, 1200);
    return () => clearTimeout(t);
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9998] w-[calc(100vw-2rem)] max-w-md animate-slide-up">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: 'var(--primary-color)' }}>
          <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
            <Sparkles size={16} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm leading-tight">Schofy updated to {APP_VERSION}</p>
            <p className="text-white/70 text-xs">New features & improvements</p>
          </div>
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white"
            title={expanded ? 'Collapse' : 'See what\'s new'}
          >
            {expanded ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            onClick={dismiss}
            className="p-1.5 hover:bg-white/20 rounded-lg transition-colors text-white"
            title="Dismiss"
          >
            <X size={16} />
          </button>
        </div>

        {/* Changelog — collapsible */}
        {expanded && (
          <div className="px-4 py-3 space-y-2">
            {CHANGELOG.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className="text-slate-700 dark:text-slate-200 leading-snug">- {item.text}</span>
              </div>
            ))}
            <button
              onClick={dismiss}
              className="w-full mt-2 py-2 rounded-xl text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--primary-color)' }}
            >
              Got it
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
