import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bot, Send, Sparkles, Square, Trash2, Volume2, X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { searchInformationCatalog } from '../help/appInformationCatalog';
import { searchSchofyManual } from '../help/schofyManualKnowledge';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  createdAt: number;
  actions?: ChatAction[];
};

type ChatAction = {
  label: string;
  path: string;
};

const CHAT_STORAGE_KEY = 'schofy_assistant_chat';
const CHAT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
function publicAssetPath(fileName: string) {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  return `${normalizedBase}${fileName}`;
}
const ASSISTANT_ICON = publicAssetPath('chat-icon.png');
const ASSISTANT_ICON_FALLBACKS = [
  publicAssetPath('chat icon.png'),
  publicAssetPath('schofy-assistant-icon.png'),
];

const NATURAL_LADY_VOICE_HINTS = [
  'natural', 'neural', 'online', 'premium', 'female', 'woman', 'zira',
  'susan', 'samantha', 'victoria', 'karen', 'moira', 'tessa', 'aria',
  'jenny', 'michelle', 'emma', 'olivia', 'sonia', 'ava',
];

function pickNaturalLadyVoice(voices: SpeechSynthesisVoice[]) {
  const englishVoices = voices.filter((voice) => /^en([-_]|$)/i.test(voice.lang || ''));
  const candidates = englishVoices.length ? englishVoices : voices;
  const scored = candidates
    .map((voice) => {
      const haystack = `${voice.name} ${voice.voiceURI} ${voice.lang}`.toLowerCase();
      const score = NATURAL_LADY_VOICE_HINTS.reduce((total, hint) => (
        haystack.includes(hint) ? total + 1 : total
      ), 0) + (voice.localService ? 0 : 0.5);
      return { voice, score };
    })
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].voice : candidates[0] || null;
}

const quickPrompts = [
  'How do I import students?',
  'How does offline mode work?',
  'Where do I check invoices?',
  'How do I change plans?',
  'How do reports work?',
];

const dailyLauncherTexts = [
  'Hello, need help? You are doing great today.',
  'Hello, need help? Let us make school work smoother.',
  'Hello, need help? One clean step at a time.',
  'Hello, need help? Your records are closer than they look.',
  'Hello, need help? Today is a good day to stay organized.',
  'Hello, need help? I can guide you around Schofy.',
  'Hello, need help? Small fixes make big calm.',
  'Hello, need help? Ask me anything about the app.',
];

const assistantPages: Array<{ label: string; path: string; keywords: string[]; note: string }> = [
  { label: 'Dashboard', path: '/', keywords: ['dashboard', 'home', 'overview', 'stats', 'calendar'], note: 'school overview and current-month calendar' },
  { label: 'Students', path: '/students', keywords: ['student', 'students', 'learners', 'pupils', 'import students', 'export students'], note: 'student lists, imports, exports, and actions' },
  { label: 'Parents', path: '/parents', keywords: ['parents', 'guardians', 'parent details', 'guardian details'], note: 'parent contacts by student and class' },
  { label: 'Parent Emails', path: '/parent-emails', keywords: ['parent emails', 'email parents', 'guardian emails', 'send email'], note: 'select and email parents' },
  { label: 'Add Student', path: '/students/new', keywords: ['add student', 'new student', 'create student'], note: 'new student form' },
  { label: 'Admission', path: '/admission', keywords: ['admission', 'register', 'enroll'], note: 'student admission workflow' },
  { label: 'Teachers & Staff', path: '/staff', keywords: ['staff', 'teacher', 'teachers', 'employees'], note: 'staff and teacher records' },
  { label: 'Classes & Timetables', path: '/classes', keywords: ['class', 'classes', 'stream', 'streams', 'timetable', 'timetables'], note: 'classes, streams, timetables, and class details' },
  { label: 'Attendance', path: '/attendance', keywords: ['attendance', 'present', 'absent', 'late'], note: 'daily attendance marking' },
  { label: 'Day & Boarding', path: '/day-boarding', keywords: ['boarding', 'day', 'hostel', 'dormitory'], note: 'day and boarding students' },
  { label: 'Subjects', path: '/subjects', keywords: ['subject', 'subjects', 'courses'], note: 'subject setup and imports' },
  { label: 'Exams & Grades', path: '/grades', keywords: ['grades', 'exams', 'results'], note: 'exam setup and academic grades' },
  { label: 'Exam Marks', path: '/exam-marks', keywords: ['exam marks', 'marks', 'mark entry', 'scores'], note: 'enter exam marks' },
  { label: 'Finance', path: '/finance', keywords: ['finance', 'fees', 'bursary', 'discount', 'requirements', 'fees structure'], note: 'finance overview and student tags' },
  { label: 'Ledger', path: '/finance?tab=ledger', keywords: ['ledger', 'student ledger', 'opening balance', 'closing balance'], note: 'student fee ledger and balances' },
  { label: 'Payments', path: '/finance?tab=payments', keywords: ['payment', 'payments', 'record payment'], note: 'payment records and imports' },
  { label: 'Payment Accounts', path: '/payment-accounts', keywords: ['accounts', 'payment accounts', 'bank accounts', 'mobile money'], note: 'payment destinations for invoices' },
  { label: 'Invoices', path: '/invoices', keywords: ['invoice', 'invoices', 'billing', 'receipt'], note: 'student invoices and payment details' },
  { label: 'Transport', path: '/transport', keywords: ['transport', 'bus', 'routes'], note: 'transport routes and fees' },
  { label: 'Announcements', path: '/announcements', keywords: ['announcement', 'announcements', 'notice', 'notice board', 'events'], note: 'school notices and events' },
  { label: 'Notifications', path: '/notifications', keywords: ['notification', 'notifications', 'broadcast', 'reply', 'messages'], note: 'broadcasts, replies, and alerts' },
  { label: 'Reports', path: '/reports', keywords: ['report', 'reports', 'print', 'export', 'pdf', 'term report'], note: 'printable and exportable reports' },
  { label: 'Plans', path: '/plans', keywords: ['plan', 'plans', 'subscription', 'upgrade', 'trial', 'billing'], note: 'plan status, trial, renewal, and upgrades' },
  { label: 'Settings', path: '/settings', keywords: ['settings', 'currency', 'logo', 'backup', 'new term', 'sync settings'], note: 'school info, backup, sync, term, and currency' },
  { label: 'Recycle Bin', path: '/recycle-bin', keywords: ['recycle', 'trash', 'deleted', 'restore'], note: 'restore deleted records' },
];

function getRefreshLauncherText() {
  return dailyLauncherTexts[Math.floor(Math.random() * dailyLauncherTexts.length)];
}

function makeGreeting(hour: number, online: boolean) {
  const greetings = hour < 12
    ? [
        'Good morning. I am Schofy assistant, warmed up and ready before the bell rings.',
        'Morning. What are we fixing today before the school day starts moving?',
      ]
    : hour < 17
      ? [
          'Good afternoon. I am Schofy assistant. Tell me what you need and I will point you to the right place.',
          'Afternoon. The app is awake, the data is behaving, and I am here to help.',
        ]
      : [
          'Good evening. I am Schofy assistant. Late admin work counts as dedication, not chaos.',
          'Evening. Let us make this quick and clean so you can close the laptop with peace.',
        ];

  const base = greetings[Math.floor(Math.random() * greetings.length)];
  return online ? base : `${base} You are offline, so I will focus on what works locally.`;
}

function includesAny(text: string, words: string[]) {
  return words.some(word => text.includes(word));
}

function newMessage(role: ChatMessage['role'], text: string, actions?: ChatAction[]): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    text,
    createdAt: Date.now(),
    actions,
  };
}

function pruneOldMessages(messages: ChatMessage[]) {
  const cutoff = Date.now() - CHAT_RETENTION_MS;
  return messages.filter(message => Number(message.createdAt || 0) >= cutoff);
}

function loadStoredMessages() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CHAT_STORAGE_KEY) || '[]') as ChatMessage[];
    if (!Array.isArray(parsed)) return [];
    const fresh = pruneOldMessages(parsed);
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(fresh));
    return fresh;
  } catch {
    localStorage.removeItem(CHAT_STORAGE_KEY);
    return [];
  }
}

function findPageActions(text: string) {
  const normalized = text.toLowerCase();
  return assistantPages
    .filter(page => page.keywords.some(keyword => normalized.includes(keyword)) || normalized.includes(page.label.toLowerCase()))
    .slice(0, 4)
    .map(page => ({ label: page.label, path: page.path }));
}

function makeManualGuidance(input: string, path: string): { text: string; actions?: ChatAction[] } | null {
  const matches = searchSchofyManual(input, path);
  if (matches.length === 0) return null;

  const top = matches[0];
  const route = top.route.includes('/:') ? top.route.split('/:')[0] : top.route;
  const nextStep = top.steps?.[0] || top.summary;
  return {
    text: `${nextStep} Reference: ${top.title}.`,
    actions: [{ label: `Open ${top.title}`, path: route }],
  };
}

function answerFor(input: string, path: string): { text: string; actions?: ChatAction[] } {
  const text = input.toLowerCase();
  const pageActions = findPageActions(text);
  const catalogMatches = searchInformationCatalog(input, path);
  const isHelpQuery = includesAny(text, ['how', 'what', 'where', 'button', 'page', 'explain', 'help', 'search', 'find', 'use', 'open', 'do', 'manual', 'guide', 'steps']);

  if (pageActions.length > 0 && includesAny(text, ['page', 'open', 'go to', 'where', 'find', 'search', 'show', 'take me', 'navigate'])) {
    const labels = pageActions.map(action => action.label).join(', ');
    return {
      text: `I found these matching app areas: ${labels}. Tap one below to open it.`,
      actions: pageActions,
    };
  }

  if (includesAny(text, ['hello', 'hi ', 'hey', 'good morning', 'good afternoon', 'good evening'])) {
    return { text: 'Hello. I am Schofy assistant. Ask me where something is, how to use a feature, or what to do when sync, login, plans, imports, finance, or reports need attention.' };
  }

  if (catalogMatches.length > 0 && isHelpQuery && includesAny(text, ['manual', 'book', 'catalog', 'guide'])) {
    const top = catalogMatches[0];
    return {
      text: `${top.summary} Reference: ${top.title}.`,
      actions: [{ label: `Open ${top.title}`, path: top.route.includes(':id') ? top.route.split('/:')[0] : top.route }],
    };
  }
  if (includesAny(text, ['dashboard', 'home', 'overview', 'stats', 'calendar'])) {
    return { text: 'Dashboard shows your school overview: students, staff, attendance, finance, upcoming announcements, and the current-month calendar.', actions: [{ label: 'Open Dashboard', path: '/' }] };
  }
  if (includesAny(text, ['import', 'excel', 'csv', 'template'])) {
    return { text: 'For imports, open the page you want, use Import, download the template, fill it, upload it, map fields, then preview. Student imports can use Import Available when your plan has fewer remaining slots than the file contains.', actions: [{ label: 'Students Import', path: '/students' }, { label: 'Payments Import', path: '/finance?tab=payments' }, { label: 'Invoices Import', path: '/invoices' }] };
  }
  if (includesAny(text, ['duplicate', 'duplicates', 'replace existing', 'import as new'])) {
    return { text: 'During import preview, duplicates are flagged. Choose Skip, Import as New, or Replace Existing before importing. This helps avoid double records and accidental overwrites.' };
  }
  if (includesAny(text, ['offline', 'local', 'internet', 'connection'])) {
    return { text: 'Offline mode keeps working from the local database. If you are already logged in, desktop can continue locally; changes sync later when cloud sync is enabled and internet returns.', actions: [{ label: 'Open Settings', path: '/settings' }] };
  }
  if (includesAny(text, ['backup', 'google drive', 'cloud backup', 'drive'])) {
    return { text: 'For backups, use Settings backup options. Desktop can keep local data, and cloud/Drive backup should be opened deliberately so the user controls where the backup goes.', actions: [{ label: 'Backup Settings', path: '/settings' }] };
  }
  if (includesAny(text, ['sync', 'realtime', 'cloud', 'supabase'])) {
    return { text: 'Realtime sync updates the current data when online. Manual sync runs immediately, while automatic sync is limited so free-tier cloud calls are not wasted.', actions: [{ label: 'Sync Settings', path: '/settings' }] };
  }
  if (includesAny(text, ['plan', 'subscription', 'upgrade', 'trial', 'approval'])) {
    return { text: 'Plan changes wait for approval and do not replace your current active plan until approved. Open Plans to check current access, request trial, renew, or upgrade.', actions: [{ label: 'Open Plans', path: '/plans' }] };
  }
  if (includesAny(text, ['expired', 'paused', 'pending', 'free tier', 'remaining days'])) {
    return { text: 'If access is expired, paused, or pending without an active current plan, the Plans page explains what to do. If your current plan still has time, a pending upgrade should not block the app.', actions: [{ label: 'Check Plans', path: '/plans' }] };
  }
  if (includesAny(text, ['invoice', 'payment', 'ledger', 'fee', 'finance', 'balance'])) {
    return { text: 'Finance, Invoices, Payments, Accounts, and Ledger are separate pages. Student profiles also have invoice and ledger buttons for that specific student.', actions: pageActions.length ? pageActions : [{ label: 'Open Finance', path: '/finance' }, { label: 'Open Ledger', path: '/finance?tab=ledger' }, { label: 'Open Invoices', path: '/invoices' }] };
  }
  if (includesAny(text, ['bursary', 'bursaries', 'discount', 'full bursary', 'requirements', 'fees structure'])) {
    return { text: 'Fees Structure, Bursary, and Discount should be managed as their own finance workflows. Bursary adds support to selected students; discounts reduce charges; full bursary marks eligible balances as covered.', actions: [{ label: 'Open Invoices', path: '/invoices' }, { label: 'Open Finance', path: '/finance' }] };
  }
  if (includesAny(text, ['report', 'print', 'export', 'pdf'])) {
    return { text: 'Reports can be printed or exported. Ledger and invoice prints use school information, not the app name, so they are ready for school records.', actions: [{ label: 'Open Reports', path: '/reports' }, { label: 'Open Ledger', path: '/finance?tab=ledger' }] };
  }
  if (includesAny(text, ['exam', 'exam marks', 'marks', 'grade', 'grades', 'result', 'report card'])) {
    return { text: 'Use Exams & Grades for academic structure and Exam Marks for mark entry. Report cards are generated from exam results, subjects, students, and the selected report template.', actions: [{ label: 'Exam Marks', path: '/exam-marks' }, { label: 'Exams & Grades', path: '/grades' }] };
  }
  if (includesAny(text, ['attendance', 'present', 'absent', 'late'])) {
    return { text: 'Attendance tracks student or staff presence by date. Pick the date, mark statuses, save, then use Reports for term or date-range summaries.', actions: [{ label: 'Open Attendance', path: '/attendance' }, { label: 'Attendance Reports', path: '/reports' }] };
  }
  if (includesAny(text, ['student', 'admission', 'class', 'boarding', 'hostel', 'dormitory'])) {
    return { text: 'Student records are managed from Students and Admission. Day & Boarding separates day and boarding students, and boarding students can be assigned hostel or dormitory details.', actions: pageActions.length ? pageActions : [{ label: 'Students', path: '/students' }, { label: 'Admission', path: '/admission' }, { label: 'Day & Boarding', path: '/day-boarding' }] };
  }
  if (includesAny(text, ['staff', 'teacher', 'roles', 'permission', 'access'])) {
    return { text: 'Staff records live under Teachers & Staff. Roles & Access controls what staff mode can open, so users only see the areas they are allowed to use.', actions: [{ label: 'Teachers & Staff', path: '/staff' }, { label: 'Roles & Access', path: '/roles' }] };
  }
  if (includesAny(text, ['password', 'login', 'auth', 'security', 'reset'])) {
    return { text: 'Login uses email and password with the security check gate. Forgot password handles reset flow. Saved credentials should only appear when the user explicitly saves them.' };
  }
  if (includesAny(text, ['notification', 'broadcast', 'message', 'reply', 'chat'])) {
    return { text: 'Notifications show school alerts and Schofy assistant broadcasts. If a broadcast allows replies, open it, reply, and attachments or links appear inside the message panel.', actions: [{ label: 'Open Notifications', path: '/notifications' }] };
  }
  if (includesAny(text, ['settings', 'currency', 'logo', 'school info', 'term', 'new term'])) {
    return { text: 'Settings controls school details, logo, currency, term/year, payment accounts, backup, sync preference, and new-term actions. Currency and plan cache are stored locally so they stick offline.', actions: [{ label: 'Open Settings', path: '/settings' }] };
  }
  if (includesAny(text, ['desktop', 'exe', 'release', 'update', 'install'])) {
    return { text: 'Desktop releases are built as installers. Users install the .exe; update prompts can download a new release and reinstall while keeping local app data safe.' };
  }
  if (includesAny(text, ['search', 'find', 'global search', 'ctrl+k'])) {
    return { text: 'Use the main search bar or Ctrl+K to find pages, subpages like Ledger or Exam Marks, students, staff, subjects, and classes.', actions: [{ label: 'Ledger', path: '/finance?tab=ledger' }, { label: 'Exam Marks', path: '/exam-marks' }] };
  }
  if (includesAny(text, ['where', 'page', 'open', 'find'])) {
    if (path.includes('students')) return { text: 'You are already around student tools. Use the page actions at the top for import, export, filters, and adding students.', actions: [{ label: 'Add Student', path: '/students/new' }] };
    if (path.includes('finance') || path.includes('invoice')) return { text: 'You are in the finance area. Use the page tabs/buttons to move between ledger, invoices, payments, and accounts.', actions: [{ label: 'Ledger', path: '/finance?tab=ledger' }, { label: 'Payments', path: '/finance?tab=payments' }, { label: 'Invoices', path: '/invoices' }] };
    if (path.includes('reports')) return { text: 'You are on Reports. Choose a report type, term, and year, then print or export.', actions: [{ label: 'Open Reports', path: '/reports' }] };
    return { text: 'Use the sidebar or main search for pages. Here are common pages:', actions: [{ label: 'Students', path: '/students' }, { label: 'Finance', path: '/finance' }, { label: 'Reports', path: '/reports' }, { label: 'Settings', path: '/settings' }] };
  }

  if (isHelpQuery) {
    const manualGuidance = makeManualGuidance(input, path);
    if (manualGuidance) return manualGuidance;
  }

  return { text: 'I can help with imports, students, finance, invoices, ledger, reports, plans, sync, offline mode, desktop updates, login, and settings. Mention a page name and I can show an open button too.', actions: pageActions };
}

export default function SchofyAssistant() {
  const [open, setOpen] = useState(false);
  const [launcherHidden, setLauncherHidden] = useState(false);
  const [showDailyHint, setShowDailyHint] = useState(true);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>(loadStoredMessages);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [speechVoices, setSpeechVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [launcherImageFailed, setLauncherImageFailed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { isOnline } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);

  const greeting = useMemo(() => makeGreeting(new Date().getHours(), isOnline), [isOnline]);
  const dailyLauncherText = useMemo(getRefreshLauncherText, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowDailyHint(false), 10000);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    setMessages(current => current.length > 0
      ? current
      : [newMessage('assistant', greeting)]);
  }, [greeting, open]);

  useEffect(() => {
    const fresh = pruneOldMessages(messages);
    if (fresh.length !== messages.length) {
      setMessages(fresh);
      return;
    }
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(fresh));
  }, [messages]);

  useEffect(() => {
    if (!open) return;
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open]);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  useEffect(() => {
    if (!open && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
    }
  }, [open]);

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    const loadVoices = () => setSpeechVoices(window.speechSynthesis.getVoices());
    loadVoices();
    window.speechSynthesis.addEventListener('voiceschanged', loadVoices);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const sendMessage = (value = input) => {
    const text = value.trim();
    if (!text) return;
    const answer = answerFor(text, location.pathname);
    setInput('');
    setMessages(current => [
      ...current,
      newMessage('user', text),
      newMessage('assistant', answer.text, answer.actions),
    ]);
  };

  const clearChat = () => {
    setMessages([newMessage('assistant', greeting)]);
  };

  const openPlans = () => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setOpen(false);
    navigate('/plans');
  };

  const openPageAction = (path: string) => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setOpen(false);
    navigate(path);
  };

  const readMessageAloud = (message: ChatMessage) => {
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') return;
    if (speakingId === message.id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(message.text);
    const voice = pickNaturalLadyVoice(speechVoices.length ? speechVoices : window.speechSynthesis.getVoices());
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang || 'en-US';
    utterance.rate = 0.86;
    utterance.pitch = 1.08;
    utterance.volume = 1;
    utterance.onend = () => setSpeakingId(current => current === message.id ? null : current);
    utterance.onerror = () => setSpeakingId(current => current === message.id ? null : current);
    setSpeakingId(message.id);
    window.speechSynthesis.speak(utterance);
  };

  return createPortal(
    <>
      {!open && !launcherHidden && showDailyHint && (
        <div className="fixed bottom-[34px] right-[100px] z-[9998] max-w-[230px] animate-dropdown-in rounded-[10px] border border-emerald-200 bg-gradient-to-br from-white via-emerald-50 to-indigo-50 px-3.5 py-2.5 text-sm font-semibold text-slate-800 shadow-xl ring-1 ring-white/70 backdrop-blur dark:border-slate-700 dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950 dark:text-slate-100 dark:ring-slate-700/60">
          {dailyLauncherText}
          <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-emerald-200 bg-emerald-50 dark:border-slate-700 dark:bg-slate-900" />
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed bottom-5 right-5 z-[9998] flex h-[70px] w-[70px] items-center justify-center rounded-[18px] bg-white text-white shadow-2xl transition-all hover:-translate-y-0.5 hover:shadow-[0_20px_45px_rgba(79,70,229,0.35)] ${open || launcherHidden ? 'scale-90 opacity-0 pointer-events-none' : 'scale-100 opacity-100'}`}
        aria-label="Open Schofy assistant"
      >
        {launcherImageFailed ? (
          <span
            className="flex h-full w-full items-center justify-center rounded-[18px] bg-gradient-to-br from-emerald-500 to-indigo-600 text-white"
            aria-hidden="true"
          >
            <Bot size={30} />
          </span>
        ) : (
          <img
            src={ASSISTANT_ICON}
            alt=""
            className="h-full w-full rounded-[18px] object-cover"
            draggable={false}
            onLoad={() => setLauncherImageFailed(false)}
            onError={(event) => {
              const image = event.currentTarget;
              const nextFallbackIndex = Number(image.dataset.fallbackIndex || 0);
              const nextFallback = ASSISTANT_ICON_FALLBACKS[nextFallbackIndex];
              if (!nextFallback) {
                setLauncherImageFailed(true);
                return;
              }
              image.dataset.fallbackIndex = String(nextFallbackIndex + 1);
              image.src = nextFallback;
            }}
          />
        )}
      </button>
      {!open && !launcherHidden && (
        <button
          type="button"
          onClick={() => setLauncherHidden(true)}
          className="fixed bottom-[78px] right-4 z-[9999] flex h-6 w-6 items-center justify-center rounded-full bg-slate-950/80 text-white shadow-lg transition hover:bg-slate-800"
          aria-label="Hide Schofy assistant until refresh"
        >
          <X size={14} />
        </button>
      )}

      <div className={`fixed inset-0 z-[9999] transition pointer-events-none ${open ? 'bg-slate-950/20 opacity-100' : 'opacity-0'}`}>
        <aside
          className={`pointer-events-auto absolute bottom-0 right-0 top-0 flex w-full max-w-md transform flex-col overflow-hidden rounded-[5px] border-l border-slate-200 bg-transparent shadow-2xl transition-transform duration-300 ease-out dark:border-slate-800 ${open ? 'translate-x-0' : 'translate-x-full'}`}
        >
          <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800" style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--solid-emerald))' }}>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/20 text-white">
                <img
                  src={ASSISTANT_ICON}
                  alt=""
                  className="h-full w-full rounded-2xl object-cover"
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.style.display = 'none';
                  }}
                />
              </div>
              <div>
                <p className="text-sm font-bold text-white">Schofy assistant</p>
                <p className="text-xs text-white/75">{isOnline ? 'Realtime app helper' : 'Offline app helper'}</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button type="button" onClick={clearChat} className="rounded-[5px] p-2 text-white hover:bg-white/20" aria-label="Clear assistant chat">
                <Trash2 size={16} />
              </button>
              <button type="button" onClick={() => { window.speechSynthesis?.cancel(); setSpeakingId(null); setOpen(false); }} className="rounded-[5px] p-2 text-white hover:bg-white/20" aria-label="Close assistant">
                <X size={18} />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4 dark:bg-slate-950">
            {messages.map(message => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[82%] rounded-[5px] px-3.5 py-2.5 text-sm shadow-sm ${
                  message.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200'
                }`}>
                  {message.role === 'assistant' && (
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <Sparkles size={13} className="inline-block text-emerald-500" />
                      {'speechSynthesis' in window && (
                        <button
                          type="button"
                          onClick={() => readMessageAloud(message)}
                          className="rounded-[5px] p-1 text-slate-400 transition hover:bg-slate-100 hover:text-emerald-600 dark:hover:bg-slate-800"
                          title={speakingId === message.id ? 'Stop reading' : 'Read aloud slowly'}
                          aria-label={speakingId === message.id ? 'Stop reading message' : 'Read message aloud'}
                        >
                          {speakingId === message.id ? <Square size={13} /> : <Volume2 size={14} />}
                        </button>
                      )}
                    </div>
                  )}
                  <p>{message.text}</p>
                  {message.role === 'assistant' && message.actions && message.actions.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <p className="w-full text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">Click to open</p>
                      {message.actions.map(action => (
                        <button
                          key={`${message.id}-${action.path}-${action.label}`}
                          type="button"
                          onClick={() => openPageAction(action.path)}
                          className="rounded-[5px] px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition hover:brightness-105"
                          style={{ backgroundColor: 'var(--primary-color)' }}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
              {quickPrompts.map(prompt => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="shrink-0 rounded-[5px] border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-emerald-900/20"
                >
                  {prompt}
                </button>
              ))}
              <button type="button" onClick={clearChat} className="shrink-0 rounded-[5px] bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">
                Clear chat
              </button>
              <button type="button" onClick={openPlans} className="shrink-0 rounded-[5px] bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-300">
                Plans
              </button>
            </div>
            <form
              onSubmit={event => {
                event.preventDefault();
                sendMessage();
              }}
              className="flex items-center gap-2 rounded-[5px] border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950"
            >
              <input
                value={input}
                onChange={event => setInput(event.target.value)}
                placeholder="Ask about Schofy..."
                className="min-w-0 flex-1 bg-transparent px-2 text-sm text-slate-800 outline-none placeholder:text-slate-400 dark:text-slate-100"
              />
              <button type="submit" className="flex h-10 w-10 items-center justify-center rounded-[5px] bg-indigo-600 text-white hover:bg-indigo-700" aria-label="Send message">
                <Send size={16} />
              </button>
            </form>
          </div>
        </aside>
      </div>
    </>,
    document.body,
  );
}
