import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowLeft, Check, CheckSquare, Clock3, DoorOpen, HeartPulse, Home, MoreHorizontal, Plus, Printer, Search, Square, Trash2, UserRoundCheck, Users, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useActiveStudents } from '../contexts/StudentsContext';
import { useToast } from '../contexts/ToastContext';
import { useTableData } from '../lib/store';
import { PortalDropdown } from '../components/PortalDropdown';
import { openPrintPreview } from '../utils/printPreview';
import LiveEditable from '../components/LiveEditable';

type MonitorStatus = 'sick-bay' | 'sent-home' | 'passout' | 'visitor';

type MonitorRecord = {
  id: string;
  type: MonitorStatus;
  name: string;
  className: string;
  admissionNo?: string;
  reason: string;
  time: string;
  expectedIn?: string;
  teacherOnDuty?: string;
  headTeacher?: string;
  createdAt?: string;
  contact: string;
};

type LeaveSheetText = {
  passoutTitle: string;
  sickTitle: string;
  dateLabel: string;
  fullNameLabel: string;
  gradeLabel: string;
  admNoLabel: string;
  reasonLabel: string;
  timeOutLabel: string;
  expectedInLabel: string;
  teacherLabel: string;
  headTeacherLabel: string;
  signLabel: string;
};

type LeaveSheetStyle = {
  primaryColor: string;
  textColor: string;
  lineColor: string;
  footerBg: string;
  footerTextColor: string;
  watermarkOpacity: number;
};

const defaultLeaveSheetText: LeaveSheetText = {
  passoutTitle: 'LEAVE OUT SHEET',
  sickTitle: 'SICK LEAVE SHEET',
  dateLabel: 'DATE:',
  fullNameLabel: 'FULL NAME:',
  gradeLabel: 'GRADE:',
  admNoLabel: 'ADM NO:',
  reasonLabel: 'REASON TO BE OUT:',
  timeOutLabel: 'TIME OUT:',
  expectedInLabel: 'TIME EXPECTED IN:',
  teacherLabel: 'TEACHER ON DUTY NAME:',
  headTeacherLabel: 'HEAD TEACHER NAME:',
  signLabel: 'SIGN:',
};

const defaultLeaveSheetStyle: LeaveSheetStyle = {
  primaryColor: '#b91c1c',
  textColor: '#111827',
  lineColor: '#6b7280',
  footerBg: '#b91c1c',
  footerTextColor: '#ffffff',
  watermarkOpacity: 0.1,
};

const monitorConfig: Record<MonitorStatus, { label: string; shortLabel: string; icon: any; color: string; bg: string; soft: string; button: string }> = {
  'sick-bay': {
    label: 'Sick Learners',
    shortLabel: 'Sick',
    icon: HeartPulse,
    color: 'text-rose-600',
    bg: 'from-rose-500 to-red-600',
    soft: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/20 dark:text-rose-300 dark:border-rose-800',
    button: 'bg-rose-500 text-white hover:bg-rose-600',
  },
  'sent-home': {
    label: 'Sent Home',
    shortLabel: 'Sent home',
    icon: Home,
    color: 'text-amber-600',
    bg: 'from-amber-500 to-orange-600',
    soft: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
    button: 'bg-amber-500 text-white hover:bg-amber-600',
  },
  passout: {
    label: 'Passouts',
    shortLabel: 'Passout',
    icon: DoorOpen,
    color: 'text-sky-600',
    bg: 'from-sky-500 to-blue-600',
    soft: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
    button: 'bg-sky-500 text-white hover:bg-sky-600',
  },
  visitor: {
    label: 'Visitors',
    shortLabel: 'Visitor',
    icon: UserRoundCheck,
    color: 'text-emerald-600',
    bg: 'from-emerald-500 to-teal-600',
    soft: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
    button: 'bg-emerald-500 text-white hover:bg-emerald-600',
  },
};

const monitorStatuses = Object.keys(monitorConfig) as MonitorStatus[];

function todayTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(createdAt?: string) {
  if (!createdAt) return 'Just now';
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return 'Just now';
  const minutes = Math.floor(elapsedMs / 60000);
  if (minutes < 1) return 'Less than 1 min';
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes} min`;
}

function getLearnerName(student: any) {
  return `${student?.firstName || ''} ${student?.lastName || ''}`.trim() || 'Unnamed learner';
}

function getLearnerId(student: any) {
  return student?.studentId || student?.admissionNo || student?.id || 'No ID';
}

function todayDate() {
  return new Date().toLocaleDateString();
}

function LeaveOutSheet({
  logo,
  schoolName,
  form,
  text,
  styleConfig,
  isLiveEditing,
  onTextChange,
  sheetId = 'live-monitor-leave-sheet',
  showControls = true,
}: {
  logo?: string;
  schoolName: string;
  form: { type: MonitorStatus; name: string; className: string; admissionNo?: string; reason: string; timeOut: string; expectedIn: string; teacherOnDuty: string; headTeacher: string };
  text: LeaveSheetText;
  styleConfig: LeaveSheetStyle;
  isLiveEditing: boolean;
  onTextChange: (key: keyof LeaveSheetText, value: string) => void;
  sheetId?: string;
  showControls?: boolean;
}) {
  const fallbackLogo = '/icon-192.png';
  const title = form.type === 'sick-bay' ? text.sickTitle : text.passoutTitle;
  const sheetLogo = logo || fallbackLogo;
  const lineStyle = { borderColor: styleConfig.lineColor };
  const labelStyle = { color: styleConfig.textColor };

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/40">
      {showControls && <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <div>
          <p className="text-xs font-black uppercase text-slate-400">Printable slip</p>
          <p className="text-sm font-bold text-slate-800 dark:text-white">{title}</p>
        </div>
        <button type="button" onClick={() => openPrintPreview(title, `#${sheetId}`)} className="btn btn-secondary">
          <Printer size={15} /> Print
        </button>
      </div>}

      <div id={sheetId} className="relative mx-auto aspect-[1.42/1] w-full max-w-4xl overflow-hidden rounded-sm border border-slate-200 bg-white p-[3.2%] text-slate-950 shadow-sm print:aspect-auto print:w-[277mm] print:max-w-none print:border-0 print:p-8 print:shadow-none" style={{ color: styleConfig.textColor }}>
        <img src={sheetLogo} alt="" className="absolute left-8 top-6 h-16 w-16 object-contain" />
        <img src={sheetLogo} alt="" className="pointer-events-none absolute left-1/2 top-1/2 h-[72%] w-[62%] -translate-x-1/2 -translate-y-1/2 object-contain" style={{ opacity: styleConfig.watermarkOpacity }} />

        <div className="relative z-10">
          <div className="grid grid-cols-[90px_1fr_180px] items-start gap-4">
            <div />
            <h2 className="text-center text-3xl font-black uppercase tracking-wide" style={{ color: styleConfig.primaryColor }}>
              <LiveEditable value={title} onSave={value => onTextChange(form.type === 'sick-bay' ? 'sickTitle' : 'passoutTitle', value)} isLiveEditing={isLiveEditing} />
            </h2>
            <div className="mt-7 flex items-end gap-1 text-sm font-black uppercase">
              <LiveEditable value={text.dateLabel} onSave={value => onTextChange('dateLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
              <span className="min-w-28 flex-1 border-b px-2 font-semibold normal-case" style={lineStyle}>{todayDate()}</span>
            </div>
          </div>

          <div className="mt-9 grid grid-cols-[auto_1fr_auto_170px_auto_150px] items-end gap-x-3 gap-y-5 text-sm font-black uppercase">
            <LiveEditable value={text.fullNameLabel} onSave={value => onTextChange('fullNameLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.name || ' '}</span>
            <LiveEditable value={text.gradeLabel} onSave={value => onTextChange('gradeLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.className || ' '}</span>
            <LiveEditable value={text.admNoLabel} onSave={value => onTextChange('admNoLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.admissionNo || ' '}</span>
          </div>

          <div className="mt-8 text-sm font-black uppercase">
            <div className="flex items-end gap-2">
              <LiveEditable value={text.reasonLabel} onSave={value => onTextChange('reasonLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
              <span className="min-h-7 flex-1 border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.reason || ' '}</span>
            </div>
            <div className="mt-4 h-7 border-b" style={lineStyle} />
            <div className="mt-4 h-7 border-b" style={lineStyle} />
            <div className="mt-4 h-7 border-b" style={lineStyle} />
          </div>

          <div className="mt-9 grid grid-cols-[auto_1fr_auto_1fr] items-end gap-x-4 text-sm font-black uppercase">
            <LiveEditable value={text.timeOutLabel} onSave={value => onTextChange('timeOutLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.timeOut}</span>
            <LiveEditable value={text.expectedInLabel} onSave={value => onTextChange('expectedInLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.expectedIn || ' '}</span>
          </div>

          <div className="mt-9 grid grid-cols-[auto_1fr_auto_190px] items-end gap-x-3 text-sm font-black uppercase">
            <LiveEditable value={text.teacherLabel} onSave={value => onTextChange('teacherLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.teacherOnDuty || ' '}</span>
            <LiveEditable value={text.signLabel} onSave={value => onTextChange('signLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b pb-1" style={lineStyle}>&nbsp;</span>
          </div>

          <div className="mt-8 grid grid-cols-[auto_1fr_auto_190px] items-end gap-x-3 text-sm font-black uppercase">
            <LiveEditable value={text.headTeacherLabel} onSave={value => onTextChange('headTeacherLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b px-2 pb-1 font-semibold normal-case" style={lineStyle}>{form.headTeacher || ' '}</span>
            <LiveEditable value={text.signLabel} onSave={value => onTextChange('signLabel', value)} isLiveEditing={isLiveEditing} style={labelStyle} />
            <span className="border-b pb-1" style={lineStyle}>&nbsp;</span>
          </div>

          <div className="mt-6 flex items-center justify-center gap-2">
            <img src={sheetLogo} alt="" className="h-8 w-8 object-contain" />
            <span className="px-4 py-1 text-xl font-black uppercase tracking-wide" style={{ backgroundColor: styleConfig.footerBg, color: styleConfig.footerTextColor }}>{schoolName || 'School'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MonitorActions({
  record,
  onSelect,
  onClear,
  onPrint,
}: {
  record: MonitorRecord;
  onSelect: (id: string) => void;
  onClear: (id: string) => void;
  onPrint: (record: MonitorRecord) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(open => !open);
        }}
        className={`rounded-lg p-1.5 transition-all ${
          isOpen
            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/20'
            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700'
        }`}
        title="Activity actions"
      >
        <MoreHorizontal size={15} />
      </button>
      <PortalDropdown triggerRef={btnRef} isOpen={isOpen} onClose={() => setIsOpen(false)}>
        <PortalDropdown.Item icon={<Check size={13} />} label="Select" onClick={() => { onSelect(record.id); setIsOpen(false); }} />
        {(record.type === 'passout' || record.type === 'sick-bay') && (
          <>
            <PortalDropdown.Divider />
            <PortalDropdown.Item icon={<Printer size={13} />} label="Print" onClick={() => { onPrint(record); setIsOpen(false); }} />
          </>
        )}
        <PortalDropdown.Divider />
        <PortalDropdown.Item icon={<Trash2 size={13} />} label="Clear" danger onClick={() => { onClear(record.id); setIsOpen(false); }} />
      </PortalDropdown>
    </>
  );
}

export default function LiveMonitor() {
  const { user, schoolId } = useAuth();
  const tenantId = schoolId || user?.id || 'local';
  const storageKey = `schofy_live_monitor_${tenantId}`;
  const students = useActiveStudents();
  const { data: classes } = useTableData(tenantId, 'classes');
  const { addToast } = useToast();

  const [records, setRecords] = useState<MonitorRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState({
    type: 'sick-bay' as MonitorStatus,
    name: '',
    className: '',
    admissionNo: '',
    reason: '',
    contact: '',
    expectedIn: '',
    teacherOnDuty: '',
    headTeacher: '',
  });
  const [learnerQuery, setLearnerQuery] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const [activeStatus, setActiveStatus] = useState<MonitorStatus | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set());
  const [selectMode, setSelectMode] = useState(false);
  const [templateText, setTemplateText] = useState<LeaveSheetText>(() => {
    try {
      return { ...defaultLeaveSheetText, ...JSON.parse(localStorage.getItem(`schofy_leave_sheet_text_${tenantId}`) || '{}') };
    } catch {
      return defaultLeaveSheetText;
    }
  });
  const [templateStyle, setTemplateStyle] = useState<LeaveSheetStyle>(() => {
    try {
      return { ...defaultLeaveSheetStyle, ...JSON.parse(localStorage.getItem(`schofy_leave_sheet_style_${tenantId}`) || '{}') };
    } catch {
      return defaultLeaveSheetStyle;
    }
  });
  const [isTemplateEditing, setIsTemplateEditing] = useState(false);
  const [printRecord, setPrintRecord] = useState<MonitorRecord | null>(null);
  const [, setNowTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNowTick(tick => tick + 1), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const classById = useMemo(() => {
    return new Map((classes as any[]).map(cls => [cls.id, cls.name || cls.className || cls.title || '']));
  }, [classes]);
  const selectedStudent = useMemo(
    () => students.find((student: any) => student.id === selectedStudentId),
    [selectedStudentId, students]
  );
  const learnerResults = useMemo(() => {
    const needle = learnerQuery.trim().toLowerCase();
    if (!needle) return [];
    return students
      .filter((student: any) => [
        getLearnerName(student),
        student.studentId,
        student.admissionNo,
        student.id,
      ].some(value => String(value || '').toLowerCase().includes(needle)))
      .slice(0, 8);
  }, [learnerQuery, students]);
  const counts = useMemo(() => {
    return records.reduce((acc, record) => {
      acc[record.type] = (acc[record.type] || 0) + 1;
      return acc;
    }, {} as Record<MonitorStatus, number>);
  }, [records]);
  const visibleRecords = useMemo(
    () => activeStatus ? records.filter(record => record.type === activeStatus) : records,
    [activeStatus, records]
  );
  const settings = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem(`schofy_settings_${tenantId}`) || '{}');
    } catch {
      return {};
    }
  }, [tenantId]);
  const latestRecord = records[0];
  const visibleRecordIds = visibleRecords.map(record => record.id);
  const selectedVisibleCount = visibleRecordIds.reduce((count, id) => count + (selectedRecords.has(id) ? 1 : 0), 0);
  const allRecordsSelected = visibleRecords.length > 0 && selectedVisibleCount === visibleRecords.length;

  function persist(next: MonitorRecord[]) {
    setRecords(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSelectedRecords(prev => new Set([...prev].filter(id => next.some(record => record.id === id))));
  }

  function getStudentClassName(student: any) {
    return student?.className || classById.get(student?.classId) || '';
  }

  function selectStudent(student: any) {
    setSelectedStudentId(student.id);
    setLearnerQuery(`${getLearnerName(student)} - ${getLearnerId(student)}`);
    setForm(prev => ({
      ...prev,
      name: getLearnerName(student),
      className: getStudentClassName(student),
      admissionNo: student?.admissionNo || student?.studentId || '',
      contact: student?.parentPhone || student?.guardianPhone || student?.phone || '',
    }));
  }

  function openEntry(type: MonitorStatus) {
    if (type !== 'visitor' && !selectedStudent) {
      addToast('Search and select a learner by name or ID first', 'error');
      return;
    }
    setForm(prev => ({
      ...prev,
      type,
      ...(type === 'visitor' ? { name: '', className: '', admissionNo: '', contact: '' } : {}),
    }));
    setActiveStatus(type);
    setEntryOpen(true);
  }

  function resetEntry() {
    setEntryOpen(false);
    setSelectedStudentId('');
    setLearnerQuery('');
    setForm({
      type: activeStatus || 'sick-bay',
      name: '',
      className: '',
      admissionNo: '',
      reason: '',
      contact: '',
      expectedIn: '',
      teacherOnDuty: '',
      headTeacher: '',
    });
  }

  function addRecord() {
    const name = form.name.trim();
    if (!name) {
      addToast('Enter a learner or visitor name', 'error');
      return;
    }
    const nextRecord: MonitorRecord = {
      id: crypto.randomUUID(),
      type: form.type,
      name,
      className: form.className.trim(),
      admissionNo: form.admissionNo.trim(),
      reason: form.reason.trim(),
      contact: form.contact.trim(),
      expectedIn: form.expectedIn.trim(),
      teacherOnDuty: form.teacherOnDuty.trim(),
      headTeacher: form.headTeacher.trim(),
      time: todayTime(),
      createdAt: new Date().toISOString(),
    };
    persist([nextRecord, ...records]);
    resetEntry();
    addToast(`${monitorConfig[nextRecord.type].label} record added`, 'success');
  }

  function removeRecord(id: string) {
    persist(records.filter(record => record.id !== id));
  }

  function toggleRecordSelection(id: string) {
    setSelectedRecords(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectMode(next.size > 0);
      return next;
    });
  }

  function handleRecordClick(id: string) {
    if (selectMode) toggleRecordSelection(id);
  }

  function handleRecordDoubleClick(id: string) {
    setSelectMode(true);
    setSelectedRecords(prev => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function selectAllRecords() {
    if (allRecordsSelected) {
      setSelectedRecords(new Set());
      setSelectMode(false);
      return;
    }
    setSelectedRecords(new Set(visibleRecords.map(record => record.id)));
    setSelectMode(true);
  }

  function clearSelectedRecords() {
    if (selectedRecords.size === 0) return;
    persist(records.filter(record => !selectedRecords.has(record.id)));
    setSelectedRecords(new Set());
    setSelectMode(false);
    addToast(`${selectedRecords.size} activit${selectedRecords.size === 1 ? 'y' : 'ies'} cleared`, 'success');
  }

  function openStatusPage(type: MonitorStatus) {
    setActiveStatus(type);
    setEntryOpen(false);
    setSelectedRecords(new Set());
    setSelectMode(false);
  }

  function backToDashboard() {
    setActiveStatus(null);
    setEntryOpen(false);
    setSelectedRecords(new Set());
    setSelectMode(false);
  }

  function updateTemplateText(key: keyof LeaveSheetText, value: string) {
    setTemplateText(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(`schofy_leave_sheet_text_${tenantId}`, JSON.stringify(next));
      return next;
    });
  }

  function updateTemplateStyle(key: keyof LeaveSheetStyle, value: string | number) {
    setTemplateStyle(prev => {
      const next = { ...prev, [key]: value };
      localStorage.setItem(`schofy_leave_sheet_style_${tenantId}`, JSON.stringify(next));
      return next;
    });
  }

  function printSavedRecord(record: MonitorRecord) {
    setPrintRecord(record);
    window.setTimeout(() => {
      const title = record.type === 'sick-bay' ? templateText.sickTitle : templateText.passoutTitle;
      openPrintPreview(title, '#live-monitor-saved-sheet');
    }, 50);
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title">
          <h1 className="text-title">{activeStatus ? monitorConfig[activeStatus].label : 'Live Monitor'}</h1>
          <p className="text-subtitle">
            {entryOpen ? 'Complete the entry details and print the leave sheet when needed' : activeStatus ? 'View, select, and manage this live activity category' : 'Sick learners, sent home, passouts, and visitors tracker'}
          </p>
        </div>
        {activeStatus && (
          <button type="button" onClick={backToDashboard} className="btn btn-secondary">
            <ArrowLeft size={16} /> Dashboard
          </button>
        )}
      </div>

      {!activeStatus && !entryOpen && (
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {monitorStatuses.map((key) => {
            const item = monitorConfig[key];
            const Icon = item.icon;
            return (
              <button
                key={key}
                type="button"
                onClick={() => openStatusPage(key)}
                className={`group relative overflow-hidden rounded-lg bg-gradient-to-br ${item.bg} p-4 text-left text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md`}
              >
                <div className="absolute right-0 top-0 h-24 w-24 translate-x-8 -translate-y-8 rounded-full bg-white/15" />
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-black uppercase text-white/75">{item.label}</p>
                    <h3 className="mt-2 text-3xl font-black">{counts[key] || 0}</h3>
                    <p className="mt-1 text-sm font-semibold text-white/75">
                      Open record{(counts[key] || 0) === 1 ? '' : 's'}
                    </p>
                    <span className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/18 px-3 py-1.5 text-xs font-black text-white transition group-hover:bg-white/25">
                      Open page
                    </span>
                  </div>
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-white/18 text-white transition group-hover:scale-105">
                    <Icon size={23} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between gap-4 border-b border-slate-100 p-4 dark:border-slate-700">
            <div>
              <p className="text-xs font-black uppercase text-slate-400">Live desk</p>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">Monitor Dashboard</h2>
            </div>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">
              {records.length} open
            </span>
          </div>
          <div className="p-4">
            <p className="text-xs font-black uppercase text-slate-400">Latest activity</p>
            {latestRecord ? (
              <div className="mt-2 flex items-center gap-3">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 ${monitorConfig[latestRecord.type].color} dark:bg-slate-800`}>
                  {(() => {
                    const Icon = monitorConfig[latestRecord.type].icon;
                    return <Icon size={19} />;
                  })()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-bold text-slate-900 dark:text-white">{latestRecord.name}</p>
                  <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {monitorConfig[latestRecord.type].label} - {latestRecord.time} - {formatDuration(latestRecord.createdAt)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm font-semibold text-slate-500 dark:text-slate-400">No live activity yet.</p>
            )}
          </div>
        </div>
      </div>
      )}

      {activeStatus && (
      <>
      <div className={`rounded-lg border p-4 ${monitorConfig[activeStatus].soft}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {(() => {
              const Icon = monitorConfig[activeStatus].icon;
              return (
                <div className={`flex h-11 w-11 items-center justify-center rounded-lg bg-gradient-to-br ${monitorConfig[activeStatus].bg} text-white`}>
                  <Icon size={21} />
                </div>
              );
            })()}
            <div>
              <p className="text-xs font-black uppercase opacity-75">Current monitor page</p>
              <h2 className="text-lg font-black">{monitorConfig[activeStatus].label}</h2>
            </div>
          </div>
          <button type="button" onClick={() => openEntry(activeStatus)} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition hover:-translate-y-0.5 ${monitorConfig[activeStatus].button}`}>
            <Plus size={15} /> New Entry
          </button>
        </div>
      </div>

      <div className={`grid gap-5 ${entryOpen ? 'xl:grid-cols-[minmax(320px,420px)_1fr]' : ''}`}>
        {entryOpen && (
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              {entryOpen ? <Plus size={19} /> : <Search size={19} />}
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white">Entry Details</h2>
              <p className="text-xs font-semibold text-slate-400">
                {monitorConfig[form.type].label}
              </p>
            </div>
          </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800">
                <div className="min-w-0">
                  <p className="text-xs font-black uppercase text-slate-400">{monitorConfig[form.type].label}</p>
                  <p className="truncate font-bold text-slate-900 dark:text-white">{form.name || 'Visitor entry'}</p>
                </div>
                <button type="button" onClick={resetEntry} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200" aria-label="Cancel entry">
                  <X size={16} />
                </button>
              </div>
              <div>
                <label className="form-label">{form.type === 'visitor' ? 'Visitor Name' : 'Learner Name'}</label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                  readOnly={form.type !== 'visitor'}
                  placeholder={form.type === 'visitor' ? 'e.g. Jane Namuli' : ''}
                />
              </div>
              <div>
                <label className="form-label">Class / Organization</label>
                <input className="form-input" value={form.className} onChange={e => setForm(prev => ({ ...prev, className: e.target.value }))} />
              </div>
              {form.type !== 'visitor' && (
                <div>
                  <label className="form-label">Admission No.</label>
                  <input className="form-input" value={form.admissionNo} onChange={e => setForm(prev => ({ ...prev, admissionNo: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="form-label">Reason</label>
                <textarea className="form-input min-h-[92px]" value={form.reason} onChange={e => setForm(prev => ({ ...prev, reason: e.target.value }))} />
              </div>
              {(form.type === 'passout' || form.type === 'sick-bay') && (
                <>
                  <div>
                    <label className="form-label">Time Expected In</label>
                    <input className="form-input" value={form.expectedIn} onChange={e => setForm(prev => ({ ...prev, expectedIn: e.target.value }))} placeholder="e.g. 4:30 PM" />
                  </div>
                  <div>
                    <label className="form-label">Teacher on Duty</label>
                    <input className="form-input" value={form.teacherOnDuty} onChange={e => setForm(prev => ({ ...prev, teacherOnDuty: e.target.value }))} />
                  </div>
                  <div>
                    <label className="form-label">Head Teacher</label>
                    <input className="form-input" value={form.headTeacher} onChange={e => setForm(prev => ({ ...prev, headTeacher: e.target.value }))} />
                  </div>
                </>
              )}
              <div>
                <label className="form-label">Contact / Guardian</label>
                <input className="form-input" value={form.contact} onChange={e => setForm(prev => ({ ...prev, contact: e.target.value }))} />
              </div>
              <button type="button" onClick={addRecord} className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition hover:-translate-y-0.5 ${monitorConfig[form.type].button}`}>
                <Plus size={16} /> Save Monitor Entry
              </button>
            </div>
        </div>
        )}

        {entryOpen && (form.type === 'passout' || form.type === 'sick-bay') ? (
          <div className="space-y-3">
            <div className="card p-4 print:hidden">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white">Template editor</h3>
                  <p className="text-xs font-semibold text-slate-400">Edit labels by clicking the sheet text while live edit is on.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTemplateEditing(editing => !editing)}
                  className={`rounded-lg px-3 py-2 text-xs font-black transition ${isTemplateEditing ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}
                >
                  {isTemplateEditing ? 'Editing On' : 'Live Edit'}
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                {([
                  ['primaryColor', 'Title'],
                  ['textColor', 'Text'],
                  ['lineColor', 'Lines'],
                  ['footerBg', 'Footer'],
                  ['footerTextColor', 'Footer Text'],
                ] as [keyof LeaveSheetStyle, string][]).map(([key, label]) => (
                  <label key={key} className="text-xs font-bold text-slate-500 dark:text-slate-400">
                    {label}
                    <input
                      type="color"
                      value={String(templateStyle[key])}
                      onChange={event => updateTemplateStyle(key, event.target.value)}
                      className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800"
                    />
                  </label>
                ))}
                <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                  Watermark
                  <input
                    type="range"
                    min="0"
                    max="0.3"
                    step="0.01"
                    value={templateStyle.watermarkOpacity}
                    onChange={event => updateTemplateStyle('watermarkOpacity', Number(event.target.value))}
                    className="mt-3 w-full"
                  />
                </label>
              </div>
            </div>
            <LeaveOutSheet
              logo={settings.schoolLogo}
              schoolName={settings.schoolName || 'School'}
              text={templateText}
              styleConfig={templateStyle}
              isLiveEditing={isTemplateEditing}
              onTextChange={updateTemplateText}
              form={{
                type: form.type,
                name: form.name,
                className: form.className,
                admissionNo: form.admissionNo,
                reason: form.reason,
                timeOut: todayTime(),
                expectedIn: form.expectedIn,
                teacherOnDuty: form.teacherOnDuty,
                headTeacher: form.headTeacher,
              }}
            />
          </div>
        ) : entryOpen ? (
          <div className="card flex flex-col items-center justify-center gap-2 p-8 text-center">
            <UserRoundCheck size={34} className="text-emerald-500" />
            <h2 className="text-lg font-black text-slate-900 dark:text-white">Visitor Entry</h2>
            <p className="max-w-sm text-sm font-semibold text-slate-500 dark:text-slate-400">Visitor entries stay in the live activity list after saving.</p>
          </div>
        ) : (
        <div className="table-container overflow-hidden">
          {activeStatus !== 'visitor' && (
            <div className="border-b border-slate-100 p-4 dark:border-slate-700">
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto] lg:items-end">
                <div>
                  <label className="form-label">Search student</label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="search-input pl-9"
                      value={learnerQuery}
                      onChange={e => {
                        setLearnerQuery(e.target.value);
                        setSelectedStudentId('');
                      }}
                      placeholder="Search student by name, pupil ID, or admission no."
                    />
                  </div>
                </div>
                <button type="button" onClick={() => openEntry(activeStatus)} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition hover:-translate-y-0.5 ${monitorConfig[activeStatus].button}`}>
                  <Plus size={15} /> New Entry
                </button>
              </div>

              {learnerQuery.trim() ? (
              <div className="mt-3 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                {learnerResults.length === 0 ? (
                  <div className="p-4 text-center text-sm font-semibold text-slate-400">No learner found</div>
                ) : (
                  <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-700">
                    {learnerResults.map((student: any) => {
                      const isSelected = selectedStudentId === student.id;
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => selectStudent(student)}
                          onDoubleClick={() => {
                            selectStudent(student);
                            setTimeout(() => openEntry(activeStatus), 0);
                          }}
                          className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50'}`}
                        >
                          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${isSelected ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                            {String(student.firstName || '?').slice(0, 1)}{String(student.lastName || '').slice(0, 1)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-800 dark:text-white">{getLearnerName(student)}</p>
                            <p className="truncate text-xs text-slate-400">{getLearnerId(student)} - {getStudentClassName(student) || 'No class'}</p>
                          </div>
                          {isSelected && <Check size={16} className="text-primary-600" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm font-semibold text-slate-400 dark:border-slate-700">
                  Search student to show matching learners.
                </div>
              )}
            </div>
          )}

          {activeStatus === 'visitor' && (
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4 dark:border-slate-700">
              <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">Visitor records for today</p>
              <button type="button" onClick={() => openEntry(activeStatus)} className={`flex min-h-10 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-black transition hover:-translate-y-0.5 ${monitorConfig[activeStatus].button}`}>
                <Plus size={15} /> Add Visitor Entry
              </button>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-primary-500" />
              <h2 className="font-bold text-slate-900 dark:text-white">Live Activity</h2>
            </div>
            <div className="flex items-center gap-2">
              {records.length > 0 && (
                <button type="button" onClick={selectAllRecords} className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400">
                  {allRecordsSelected ? 'Deselect All' : 'Select All'}
                </button>
              )}
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{visibleRecords.length} open</span>
            </div>
          </div>

          {selectMode && selectedRecords.size > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/20">
              <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{selectedRecords.size} selected</span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={selectAllRecords}
                  className="text-xs font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                >
                  {allRecordsSelected ? 'Deselect All' : `Select All (${visibleRecords.length})`}
                </button>
                <button
                  type="button"
                  onClick={clearSelectedRecords}
                  className="flex items-center gap-1 rounded-lg bg-red-500 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-red-600"
                >
                  <Trash2 size={12} /> Delete
                </button>
                <button
                  type="button"
                  onClick={() => { setSelectedRecords(new Set()); setSelectMode(false); }}
                  className="px-2 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {visibleRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <Users size={34} className="text-slate-300" />
              <p className="font-semibold text-slate-500">No {monitorConfig[activeStatus].label.toLowerCase()} records</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table>
                <thead>
                  <tr>
                    <th className="w-10">#</th>
                    {selectMode && (
                      <th className="w-10">
                        <button type="button" onClick={selectAllRecords} className="rounded p-1 hover:bg-slate-100 dark:hover:bg-slate-700">
                          {allRecordsSelected ? <CheckSquare size={16} className="text-primary-600" /> : <Square size={16} className="text-slate-400" />}
                        </button>
                      </th>
                    )}
                    <th>Person</th>
                    <th>Activity</th>
                    <th>Class / Org</th>
                    <th>Started</th>
                    <th>Duration</th>
                    <th>Reason</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
              {visibleRecords.map((record, index) => {
                const item = monitorConfig[record.type];
                const Icon = item.icon;
                const selected = selectedRecords.has(record.id);
                return (
                  <tr
                    key={record.id}
                    className={`group animate-slide-down cursor-pointer transition-colors ${selected ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/30'}`}
                    style={{ animationDelay: `${Math.min(index, 18) * 18}ms` }}
                    onClick={() => handleRecordClick(record.id)}
                    onDoubleClick={() => handleRecordDoubleClick(record.id)}
                  >
                    <td className="text-center text-xs text-slate-400 dark:text-slate-500">{index + 1}</td>
                    {selectMode && (
                      <td className="text-center">
                        <div className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-colors ${
                          selected ? 'border-primary-600 bg-primary-600' : 'border-slate-300 dark:border-slate-600'
                        }`}>
                          {selected && <Check size={12} className="text-white" />}
                        </div>
                      </td>
                    )}
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                          <Icon size={18} />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-800 dark:text-white">{record.name}</p>
                          <p className="truncate text-xs text-slate-400">{record.contact || 'No contact'}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`inline-flex rounded-md border px-2.5 py-1 text-xs font-bold ${item.soft}`}>{item.shortLabel}</span>
                    </td>
                    <td className="text-sm text-slate-600 dark:text-slate-300">{record.className || 'No class'}</td>
                    <td className="font-mono text-xs text-slate-700 dark:text-slate-300">{record.time}</td>
                    <td>
                      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <Clock3 size={12} /> {formatDuration(record.createdAt)} elapsed
                      </span>
                    </td>
                    <td className="max-w-[240px]">
                      <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">{record.reason || 'No reason added'}</p>
                    </td>
                    <td onClick={(event) => event.stopPropagation()}>
                      <MonitorActions record={record} onSelect={toggleRecordSelection} onClear={removeRecord} onPrint={printSavedRecord} />
                    </td>
                  </tr>
                );
              })}
                </tbody>
              </table>
            </div>
          )}
        </div>
        )}
      </div>
      </>
      )}

      {printRecord && (
        <div className="fixed -left-[9999px] top-0">
          <LeaveOutSheet
            logo={settings.schoolLogo}
            schoolName={settings.schoolName || 'School'}
            text={templateText}
            styleConfig={templateStyle}
            isLiveEditing={false}
            onTextChange={updateTemplateText}
            sheetId="live-monitor-saved-sheet"
            showControls={false}
            form={{
              type: printRecord.type,
              name: printRecord.name,
              className: printRecord.className,
              admissionNo: printRecord.admissionNo,
              reason: printRecord.reason,
              timeOut: printRecord.time,
              expectedIn: printRecord.expectedIn || '',
              teacherOnDuty: printRecord.teacherOnDuty || '',
              headTeacher: printRecord.headTeacher || '',
            }}
          />
        </div>
      )}
    </div>
  );
}
