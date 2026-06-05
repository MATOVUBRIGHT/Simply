import { useEffect, useState, useRef, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';

import { Plus, Trash2, Book, BookOpen, GraduationCap, Hash, ChevronDown, ChevronRight, Download, Upload, FileText, X, ArrowRight, Check, Square, CheckSquare, Trash, Pencil, Search, Settings } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Class, Subject } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import { exportToCSV, exportToPDF, exportToExcel } from '../utils/export';
import { getClassDisplayName, getClassSection, sortClassesBySectionThenLevel } from '../utils/classroom';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { addToRecycleBin } from '../utils/recycleBin';
import { useTableData } from '../lib/store';
import { useConfirm } from '../components/ConfirmModal';
import { SuccessPopup } from '../components/SuccessPopup';
import { PortalDropdown } from '../components/PortalDropdown';
import { PortalSelect } from '../components/PortalSelect';
import { FullscreenButton } from '../components/FullscreenButton';
import { deleteInThirtyPercentBatches, runTasksInThirtyPercentBatches } from '../utils/bulkDelete';
import { getSubjectCode as readSubjectCode, getSubjectDisplayCode, normalizeSubjectCode } from '../utils/subjects';
import { useMinimumLoading } from '../hooks/useMinimumLoading';

const ugandaSubjects: Record<string, { name: string; code: string }[]> = {
  'nursery': [
    { name: 'Reading Readiness', code: 'RR' },
    { name: 'Number Work', code: 'NW' },
    { name: 'Creative Arts', code: 'ART' },
    { name: 'Music & Movement', code: 'MUS' },
    { name: 'Environmental Studies', code: 'ENV' },
    { name: 'Physical Education', code: 'PE' },
    { name: 'Language Development', code: 'LANG' },
  ],
  'primary': [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Science', code: 'SCI' },
    { name: 'Social Studies', code: 'SST' },
    { name: 'Religious Education', code: 'RE' },
    { name: 'Physical Education', code: 'PE' },
    { name: 'Art & Craft', code: 'ART' },
    { name: 'Music', code: 'MUS' },
    { name: 'Agriculture', code: 'AGR' },
    { name: 'Local Languages', code: 'LL' },
  ],
  'jss': [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Physics', code: 'PHY' },
    { name: 'Chemistry', code: 'CHEM' },
    { name: 'Biology', code: 'BIO' },
    { name: 'Geography', code: 'GEO' },
    { name: 'History', code: 'HIST' },
    { name: 'Religious Education', code: 'RE' },
    { name: 'Computer Studies', code: 'COMP' },
    { name: 'Art & Design', code: 'ART' },
    { name: 'Music', code: 'MUS' },
    { name: 'Agriculture', code: 'AGR' },
    { name: 'Entrepreneurship', code: 'ENT' },
    { name: 'Physical Education', code: 'PE' },
  ],
  'ss': [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Physics', code: 'PHY' },
    { name: 'Chemistry', code: 'CHEM' },
    { name: 'Biology', code: 'BIO' },
    { name: 'Geography', code: 'GEO' },
    { name: 'History', code: 'HIST' },
    { name: 'Religious Education', code: 'RE' },
    { name: 'Computer Studies', code: 'COMP' },
    { name: 'Economics', code: 'ECON' },
    { name: 'Commerce', code: 'COMM' },
    { name: 'Literature', code: 'LIT' },
    { name: 'Entrepreneurship', code: 'ENT' },
    { name: 'Agriculture', code: 'AGR' },
    { name: 'Art & Design', code: 'ART' },
    { name: 'Physical Education', code: 'PE' },
    { name: 'General Paper', code: 'GP' },
  ],
};

const subjectColors = [
  'from-blue-500 to-indigo-600',
  'from-emerald-500 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-amber-500 to-orange-600',
  'from-rose-500 to-pink-600',
  'from-sky-500 to-blue-600',
  'from-fuchsia-500 to-purple-600',
  'from-lime-500 to-emerald-600',
];

function getSubjectColor(name: string) {
  const index = (name || 'S').charCodeAt(0) % subjectColors.length;
  return subjectColors[index];
}

function getSubjectName(subject: any) {
  return String(subject?.name || subject?.subjectName || subject?.subject_name || '').trim();
}

function getSubjectCode(subject: any) {
  return readSubjectCode(subject);
}

function getSubjectClassId(subject: any) {
  return String(subject?.classId || subject?.class_id || '').trim();
}

const SubjectActions = ({ 
  sub, 
  group, 
  onEdit, 
  onDelete 
}: {
  sub: any;
  group: any;
  onEdit: (group: any) => void;
  onDelete: (payload: { name: string; ids: string[] }) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={btnRef}
        onClick={e => { e.stopPropagation(); setIsOpen(v => !v); }}
        className={`p-1.5 rounded-lg transition-all ${
          isOpen
            ? 'bg-indigo-600 text-white shadow-md ring-2 ring-indigo-500/20'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
        }`}
        title="Actions"
      >
        <Settings size={14} className={isOpen ? 'animate-spin-slow' : ''} />
      </button>

      <PortalDropdown triggerRef={btnRef} isOpen={isOpen} onClose={() => setIsOpen(false)} id={`subject-actions-${sub.id}`}>
        {group && (
          <>
            <PortalDropdown.Item icon={<Pencil size={13} />} label="Edit" onClick={() => { onEdit(group); setIsOpen(false); }} />
            <PortalDropdown.Divider />
          </>
        )}
        <PortalDropdown.Item icon={<Trash2 size={13} />} label="Remove" danger onClick={() => { onDelete({ name: getSubjectName(sub) || 'Subject', ids: [sub.id] }); setIsOpen(false); }} />
      </PortalDropdown>
    </>
  );
};

const SubjectRow = memo(({
  sub,
  i,
  group,
  selectMode,
  isSelected,
  onSelect,
  onEdit,
  onDelete,
  onDoubleClick,
}: {
  sub: any;
  i: number;
  group: any;
  selectMode: boolean;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onEdit: (group: any) => void;
  onDelete: (payload: { name: string; ids: string[] }) => void;
  onDoubleClick: (group: any) => void;
}) => {
  return (
    <tr
      className={`cursor-pointer transition-colors ${
        isSelected
          ? 'bg-indigo-50 dark:bg-indigo-900/20'
          : i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'
      } hover:bg-slate-50 dark:hover:bg-slate-700/30`}
      onClick={() => onSelect(sub.id)}
      onDoubleClick={() => onDoubleClick(group || { name: getSubjectName(sub) || 'Subject', ids: [sub.id] })}
    >
      <td className="px-4 py-2.5 text-xs text-slate-400">
        {selectMode ? (
          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'
          }`}>
            {isSelected && <Check size={10} className="text-white" />}
          </div>
        ) : (
          i + 1
        )}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${getSubjectColor(getSubjectName(sub))} flex items-center justify-center shrink-0`}>
            <Book size={13} className="text-white" />
          </div>
          <span className="font-medium text-slate-800 dark:text-white">{getSubjectName(sub) || 'Untitled subject'}</span>
        </div>
      </td>
      <td className="px-4 py-2.5">
        <span className="inline-flex items-center font-mono text-xs font-semibold text-slate-600 dark:text-slate-300">
          {getSubjectDisplayCode(sub)}
        </span>
      </td>
      <td className="px-4 py-2.5 text-right" onClick={e => e.stopPropagation()}>
        <SubjectActions
          sub={sub}
          group={group}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
});

export default function Subjects() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { data: subjectsData, loading } = useTableData(sid, 'subjects');
  const { data: classesData } = useTableData(sid, 'classes');
  const { data: settingsData } = useTableData(sid, 'settings');

  const subjects = useMemo(() =>
    [...subjectsData].sort((a: any, b: any) =>
      new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
    ) as Subject[], [subjectsData]);

  const classes = useMemo(() =>
    sortClassesBySectionThenLevel([...classesData]) as Class[], [classesData]);
  const listLoading = useMinimumLoading(loading, 2000);

  const schoolType = useMemo(() => {
    const s = settingsData.find((s: any) => s.key === 'schoolType');
    return (s?.value as string) || 'nursery_primary';
  }, [settingsData]);

  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: '', code: '', customSubject: false });
  const [entryMode, setEntryMode] = useState<'single' | 'multiple'>('single');
  const [multipleSubjectText, setMultipleSubjectText] = useState('');
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportSuccess, setShowImportSuccess] = useState(false);
  const [importStep, setImportStep] = useState<'upload' | 'map' | 'preview'>('upload');
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [importPreview, setImportPreview] = useState<Partial<Subject>[]>([]);
  const [importWarnings, setImportWarnings] = useState<{ row: number; subject: string; className: string; reason: string }[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<Set<string>>(new Set());
  const [lastClickedId, setLastClickedId] = useState<string | null>(null);
  const clickTimeoutRef = useRef<number | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const confirm = useConfirm();
  const { addToast } = useToast();

  // Edit state
  const [editGroup, setEditGroup] = useState<{ name: string; code: string; ids: string[]; classIds: string[] } | null>(null);
  const [editForm, setEditForm] = useState({ name: '', code: '' });
  const [editClassIds, setEditClassIds] = useState<string[]>([]);
  const [editLevel, setEditLevel] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  const subjectExpectedFields = [
    { key: 'name', label: 'Subject Name', required: true },
    { key: 'code', label: 'Code', required: true },
    { key: 'classId', label: 'Class', required: true },
  ];

function getClassLevel(classId: string): string {
    const cls = classes.find(c => c.id === classId) as any;
    if (!cls) return '';
    const name = cls.name?.toLowerCase() || '';
    const section = getClassSection(cls);
    if (section === 0) return 'nursery';
    if (section === 1) return 'primary';
    if (section === 2) {
      const level = cls.level || 0;
      if (level >= 18) return 'ss';
      if (/^s[.\s-]*[56]\b/.test(name) || /^ss[.\s-]*[12]\b/.test(name)) return 'ss';
      return 'jss';
    }
    if (name.startsWith('p.') || name.startsWith('p ')) return 'primary';
    if (name.startsWith('s.') || name.startsWith('s ')) return /^s[.\s-]*[56]\b/.test(name) ? 'ss' : 'jss';
    return 'primary';
  }

  // Levels available based on school type from settings
  const availableLevels = (() => {
    const levels: { key: string; label: string }[] = [];
    if (schoolType.includes('nursery')) levels.push({ key: 'nursery', label: 'Nursery' });
    if (schoolType.includes('primary') || schoolType === 'nursery_primary') levels.push({ key: 'primary', label: 'Primary' });
    if (schoolType.includes('secondary') || schoolType === 'primary_secondary') {
      levels.push({ key: 'jss', label: 'S.1-S.4 (JSS)' });
      levels.push({ key: 'ss', label: 'S.5-S.6 (SS)' });
    }
    if (schoolType === 'all') {
      levels.push({ key: 'jss', label: 'S.1-S.4 (JSS)' });
      levels.push({ key: 'ss', label: 'S.5-S.6 (SS)' });
    }
    return levels;
  })();

  function generateSubjectCode(name: string) {
    const cleaned = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim();
    if (!cleaned) return '';

    const words = cleaned.split(/\s+/).filter(Boolean);
    const base = words.length === 1
      ? words[0].slice(0, 4)
      : words.map((word) => word[0]).join('').slice(0, 6);

    const existingCodes = new Set(subjects.map((subject) => getSubjectCode(subject).toUpperCase()));
    if (!existingCodes.has(base)) {
      return base;
    }

    let suffix = 2;
    while (existingCodes.has(`${base}${suffix}`)) {
      suffix += 1;
    }

    return `${base}${suffix}`;
  }

  function generateSubjectCodeWithExisting(name: string, existingCodes: Set<string>) {
    const cleaned = name.toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').trim();
    if (!cleaned) return '';

    const words = cleaned.split(/\s+/).filter(Boolean);
    const base = words.length === 1
      ? words[0].slice(0, 4)
      : words.map((word) => word[0]).join('').slice(0, 6);

    if (!existingCodes.has(base)) {
      existingCodes.add(base);
      return base;
    }

    let suffix = 2;
    while (existingCodes.has(`${base}${suffix}`)) {
      suffix += 1;
    }

    const code = `${base}${suffix}`;
    existingCodes.add(code);
    return code;
  }

  const classesForSelectedLevel = sortClassesBySectionThenLevel(
    classes.filter((c) => getClassLevel(c.id) === selectedLevel)
  );
  const visibleClassOptions = selectedLevel ? classesForSelectedLevel : classes;

  function resetSubjectForm() {
    setShowForm(false);
    setSelectedLevel('');
    setSelectedClassIds([]);
    setFormData({ name: '', code: '', customSubject: false });
    setEntryMode('single');
    setMultipleSubjectText('');
  }

  function toggleClassSelection(classId: string) {
    setSelectedClassIds((prev) =>
      prev.includes(classId)
        ? prev.filter((id) => id !== classId)
        : [...prev, classId],
    );
  }

  function handleSelectAllClasses() {
    const levelClassIds = classesForSelectedLevel.map((classItem) => classItem.id);
    setSelectedClassIds((prev) =>
      prev.length === levelClassIds.length ? [] : levelClassIds,
    );
  }

  function handleRowClick(subjectId: string) {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
      if (lastClickedId === subjectId) {
        setSelectMode(true);
        setSelectedSubjects(prev => {
          const newSet = new Set(prev);
          newSet.add(subjectId);
          return newSet;
        });
      } else {
        setSelectedSubjects(prev => {
          const newSet = new Set(prev);
          if (newSet.has(subjectId)) {
            newSet.delete(subjectId);
          } else {
            newSet.add(subjectId);
          }
          return newSet;
        });
      }
      setLastClickedId(null);
    } else {
      setLastClickedId(subjectId);
      clickTimeoutRef.current = window.setTimeout(() => {
        if (!selectMode) {
          setLastClickedId(null);
        }
        clickTimeoutRef.current = null;
      }, 300);
    }
  }

  function handleSelectAll() {
    if (selectedSubjects.size === subjects.length) {
      setSelectedSubjects(new Set());
    } else {
      setSelectedSubjects(new Set(subjects.map(s => s.id)));
    }
  }

  function handleSelectClassSubjects(classSubjectIds: string[]) {
    setSelectMode(true);
    setSelectedSubjects(prev => {
      const next = new Set(prev);
      const allSelected = classSubjectIds.every(id => next.has(id));
      classSubjectIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  }

  async function handleBulkDelete() {
    await deleteSelectedSubjectIds(Array.from(selectedSubjects));
  }

  async function deleteSelectedSubjectIds(subjectIds: string[]) {
    const id = schoolId || user?.id;
    if (!id || subjectIds.length === 0) return;
    const ok = await confirm({
      title: `Delete ${subjectIds.length} Subject${subjectIds.length > 1 ? 's' : ''}`,
      description: `This will delete ${subjectIds.length} subject entr${subjectIds.length > 1 ? 'ies' : 'y'} and move them to the recycle bin.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      const now = new Date().toISOString();
      const recycleItems = subjectIds
        .map(idSubject => subjects.find(s => s.id === idSubject))
        .filter(Boolean) as Subject[];
      recycleItems.forEach(subject => {
        addToRecycleBin(id, { id: `subject-${Date.now()}-${Math.random()}`, type: 'subject', name: getSubjectName(subject) || 'Subject', data: subject, deletedAt: now });
      });
      await deleteInThirtyPercentBatches(id, 'subjects', subjectIds);
      setSelectedSubjects(prev => {
        const next = new Set(prev);
        subjectIds.forEach(subjectId => next.delete(subjectId));
        return next;
      });
      setSelectMode(false);
      addToast(`${subjectIds.length} subjects deleted`, 'success');
    } catch {
      addToast('Failed to delete subjects', 'error');
    }
  }

  async function deleteSubjectIdsWithoutSelection(subjectIds: string[]) {
    const id = schoolId || user?.id;
    if (!id || subjectIds.length === 0) return;
    const now = new Date().toISOString();
    const recycleItems = subjectIds
      .map(idSubject => subjects.find(s => s.id === idSubject))
      .filter(Boolean) as Subject[];
    recycleItems.forEach(subject => {
      addToRecycleBin(id, { id: `subject-${Date.now()}-${Math.random()}`, type: 'subject', name: getSubjectName(subject) || 'Subject', data: subject, deletedAt: now });
    });
    await deleteInThirtyPercentBatches(id, 'subjects', subjectIds);
  }

  // Delete the subject entries supplied by the caller. Class rows pass only
  // their own subject id so deleting from a selected class stays class-scoped.
  async function handleDeleteGroup(group: { name: string; ids: string[] }) {
    const id = schoolId || user?.id;
    if (!id) return;
    const ok = await confirm({
      title: `Delete "${group.name}"`,
      description: group.ids.length === 1
        ? `Remove "${group.name}" from 1 class? This cannot be undone.`
        : `Remove "${group.name}" from all ${group.ids.length} classes it's assigned to? This cannot be undone.`,
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await deleteSubjectIdsWithoutSelection(group.ids);
      addToast(`"${group.name}" deleted`, 'success');
    } catch {
      addToast('Failed to delete subject', 'error');
    }
  }

  function openEditGroup(group: { name: string; code: string; ids: string[]; classIds: string[] }) {
    setEditGroup(group);
    setEditForm({ name: group.name, code: group.code });
    setEditClassIds([...group.classIds]);
    setEditLevel('');
  }

  function closeEditGroup() {
    setEditGroup(null);
    setEditForm({ name: '', code: '' });
    setEditClassIds([]);
    setEditLevel('');
  }

  async function handleEditSubmit(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id || !editGroup || editSubmitting) return;
    const name = editForm.name.trim();
    const code = normalizeSubjectCode(editForm.code);
    if (!name || !code) { addToast('Name and code are required', 'error'); return; }
    if (editClassIds.length === 0) { addToast('Select at least one class', 'error'); return; }
    setEditSubmitting(true);
    try {
      const now = new Date().toISOString();
      const prevClassIds = editGroup.classIds;
      const toRemove = prevClassIds.filter(cid => !editClassIds.includes(cid));
      const toAdd = editClassIds.filter(cid => !prevClassIds.includes(cid));
      const toKeep = prevClassIds.filter(cid => editClassIds.includes(cid));

      // Delete removed class entries
      for (const cid of toRemove) {
        const idx = editGroup.classIds.indexOf(cid);
        if (idx !== -1) await dataService.delete(id, 'subjects', editGroup.ids[idx]);
      }
      // Update kept entries (name/code may have changed)
      for (const cid of toKeep) {
        const idx = editGroup.classIds.indexOf(cid);
        if (idx !== -1) {
          const subj = subjects.find(s => s.id === editGroup.ids[idx]);
          if (subj) await dataService.update(id, 'subjects', editGroup.ids[idx], { ...subj, name, code } as any);
        }
      }
      // Add new class entries
      for (const cid of toAdd) {
        await dataService.create(id, 'subjects', { id: uuidv4(), name, code, classId: cid, createdAt: now } as any);
      }
      addToast(`"${name}" updated`, 'success');
      closeEditGroup();
    } catch {
      addToast('Failed to update subject', 'error');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const singleName = formData.name.trim();
    const singleCode = normalizeSubjectCode(formData.code);
    const usedCodes = new Set(subjects.map((subject) => getSubjectCode(subject).toUpperCase()).filter(Boolean));
    const subjectEntries = entryMode === 'multiple'
      ? multipleSubjectText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const parts = line.split(/\s*(?:,|\||\t| - )\s*/).map((part) => part.trim()).filter(Boolean);
          const name = parts[0] || '';
          const explicitCode = normalizeSubjectCode(parts[1] || '');
          return { name, code: explicitCode || generateSubjectCodeWithExisting(name, usedCodes) };
        })
        .filter((entry) => entry.name && entry.code)
      : [{ name: singleName, code: singleCode }].filter((entry) => entry.name && entry.code);

    if (subjectEntries.length === 0) {
      addToast(entryMode === 'multiple' ? 'Enter at least one subject' : 'Subject name and code are required', 'error');
      return;
    }
    if (selectedClassIds.length === 0) { addToast('Select at least one class', 'error'); return; }
    const id = schoolId || user?.id;
    if (!id || submitting) return;
    setSubmitting(true);
    try {
      const now = new Date().toISOString();
      const existingKeys = new Set(subjects.map(s => `${getSubjectName(s).toLowerCase()}::${getSubjectClassId(s)}`));
      const newSubjects: Subject[] = [];
      subjectEntries.forEach(({ name, code }) => {
        selectedClassIds.forEach((classId) => {
          const key = `${name.toLowerCase()}::${classId}`;
          if (existingKeys.has(key)) return;
          existingKeys.add(key);
          newSubjects.push({ id: uuidv4(), name, code, classId, createdAt: now } satisfies Subject);
        });
      });

      if (newSubjects.length === 0) {
        addToast(subjectEntries.length === 1 ? 'Subject already exists for all selected classes' : 'Subjects already exist for all selected classes', 'warning');
        return;
      }
      // Fire all creates in parallel; optimistic cache updates happen immediately.
      await Promise.all(newSubjects.map(s => dataService.create(id, 'subjects', s as any)));
      resetSubjectForm();
      addToast(
        subjectEntries.length === 1
          ? `Added "${subjectEntries[0].name}" to ${newSubjects.length} class${newSubjects.length > 1 ? 'es' : ''}`
          : `Added ${newSubjects.length} subject entr${newSubjects.length === 1 ? 'y' : 'ies'} from ${subjectEntries.length} subjects`,
        'success'
      );
    } catch {
      addToast('Failed to add subject', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  function handleExportCSV() {
    const columns = [
      { key: 'name' as keyof Subject, label: 'Subject Name' },
      { key: 'code' as keyof Subject, label: 'Code' },
      { key: 'classId' as keyof Subject, label: 'Class' },
    ];
    exportToCSV(subjects.map(subject => ({ ...subject, code: getSubjectDisplayCode(subject) })), 'subjects', columns);
    addToast('Exported to CSV', 'success');
  }

  function handleExportPDF() {
    const columns = [
      { key: 'name', label: 'Subject Name' },
      { key: 'code', label: 'Code' },
      { key: 'classId', label: 'Class' },
    ];
    exportToPDF('Subjects Report', subjects.map(subject => ({ ...subject, code: getSubjectDisplayCode(subject) })), columns, 'subjects');
    addToast('Exported to PDF', 'success');
    setShowExportMenu(false);
  }

  function handleExportExcel() {
    const columns = [
      { key: 'name' as keyof Subject, label: 'Subject Name' },
      { key: 'code' as keyof Subject, label: 'Code' },
      { key: 'classId' as keyof Subject, label: 'Class' },
    ];
    exportToExcel(subjects.map(subject => ({ ...subject, code: getSubjectDisplayCode(subject) })), 'subjects', columns);
    addToast('Exported to Excel', 'success');
    setShowExportMenu(false);
  }

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function downloadTemplate() {
    import('xlsx').then(({ utils, writeFile }) => {
      const headers = subjectExpectedFields.map(f => f.label);
      // Use actual class names from the school
      const classNames = (classes as any[]).map((c: any) => c.name);
      const sampleClasses = classNames.length >= 3
        ? [classNames[0], classNames[0], classNames[1]]
        : ['P.4', 'P.4', 'P.5'];
      const classListHint = classNames.length > 0 ? classNames.join(', ') : 'P.1, P.2, P.3, S.1, S.2';
      const sampleRows = [
        ['Mathematics', 'MATH', sampleClasses[0]],
        ['English Language', 'ENG', sampleClasses[1]],
        ['Science', 'SCI', sampleClasses[2]],
      ];
      const ws = utils.aoa_to_sheet([
        [`// SUBJECT IMPORT TEMPLATE - Class Name must match one of: ${classListHint}`],
        headers,
        ...sampleRows,
      ]);
      ws['!cols'] = headers.map(h => ({ wch: Math.max(h.length + 4, 16) }));
      const wb = utils.book_new();
      utils.book_append_sheet(wb, ws, 'Subjects');
      writeFile(wb, 'subject-import-template.xlsx');
      addToast('Template downloaded', 'success');
    });
  }

  function closeImportModal() {
    setShowImportModal(false);
    setImportStep('upload');
    setCsvHeaders([]);
    setCsvData([]);
    setFieldMapping({});
    setImportPreview([]);
    setImportWarnings([]);
    setIsImporting(false);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows: any[][] = utils.sheet_to_json(ws, { header: 1, defval: '' });
      const dataRows = rows.filter((r: any[]) => !String(r[0] ?? '').startsWith('//'));
      if (dataRows.length < 2) { addToast('File must have headers and at least one data row', 'error'); return; }
      const headers = dataRows[0].map((h: any) => String(h ?? '').trim()).filter(Boolean);
      const data = dataRows.slice(1).map((row: any[]) => headers.map((_: any, i: number) => String(row[i] ?? '').trim()));
      setCsvHeaders(headers);
      setCsvData(data);
      const norm = (s: string) => s.toLowerCase().replace(/[\s_()\-\/]/g, '').replace(/[^a-z0-9]/g, '');
      const camelWords = (s: string) => s.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/[\s_\-]/g, '');
      const autoMapping: Record<string, string> = {};
      subjectExpectedFields.forEach(field => {
        const nKey = norm(field.key); const nLabel = norm(field.label); const nCamel = camelWords(field.key);
        const matchingHeader = headers.find(h => { const nH = norm(h); return nH === nKey || nH === nLabel || nH === nCamel || nH.includes(nKey) || nKey.includes(nH) || nH.includes(nLabel) || nLabel.includes(nH); });
        if (matchingHeader) autoMapping[field.key] = matchingHeader;
      });
      setFieldMapping(autoMapping);
      setImportStep('map');
      setShowImportModal(true);
    } catch (error) { addToast('Failed to read Excel file', 'error'); }
    event.target.value = '';
  }

  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
      else current += char;
    }
    result.push(current.trim());
    return result;
  }

  function resolveImportClass(raw: string): { id: string; name: string } | null {
    const value = String(raw || '').trim();
    if (!value) return null;
    const normClass = (s: string) => s.toLowerCase().replace(/[\s._\-]/g, '');
    const key = normClass(value);
    const exact = (classes as any[]).find((c: any) => normClass(c.name || '') === key || String(c.id) === value);
    if (exact) return { id: exact.id, name: exact.name || value };
    const loose = (classes as any[]).find((c: any) => {
      const classKey = normClass(c.name || '');
      return classKey && (classKey.includes(key) || key.includes(classKey));
    });
    return loose ? { id: loose.id, name: loose.name || value } : null;
  }

  function processMapping() {
    const mappedData: Partial<Subject>[] = [];
    const warnings: { row: number; subject: string; className: string; reason: string }[] = [];
    for (let rowIndex = 0; rowIndex < csvData.length; rowIndex++) {
      const row = csvData[rowIndex];
      const subject: Partial<Subject> = {};
      subjectExpectedFields.forEach(field => {
        const csvHeader = fieldMapping[field.key];
        if (csvHeader) {
          const headerIndex = csvHeaders.indexOf(csvHeader);
          if (headerIndex !== -1 && row[headerIndex]) {
            (subject as any)[field.key] = row[headerIndex];
          }
        }
      });
      const name = String((subject as any).name || '').trim();
      const code = normalizeSubjectCode((subject as any).code);
      const rawClass = String((subject as any).classId || '').trim();
      if (!name) {
        warnings.push({ row: rowIndex + 2, subject: '-', className: rawClass || '-', reason: 'Missing subject name' });
        continue;
      }
      if (!code) {
        warnings.push({ row: rowIndex + 2, subject: name, className: rawClass || '-', reason: 'Missing subject code' });
        continue;
      }
      const resolvedClass = resolveImportClass(rawClass);
      if (!resolvedClass) {
        warnings.push({ row: rowIndex + 2, subject: name, className: rawClass || '-', reason: rawClass ? 'Class not found' : 'Missing class' });
        continue;
      }
      mappedData.push({ ...subject, name, code, classId: resolvedClass.id, className: resolvedClass.name } as any);
    }
    setImportPreview(mappedData);
    setImportWarnings(warnings);
    setImportStep('preview');
    if (warnings.length > 0) {
      addToast(`${warnings.length} row${warnings.length === 1 ? '' : 's'} flagged and skipped. Fix the class/name/code to import them.`, 'warning');
    }
  }

  async function executeImport() {
    const id = schoolId || user?.id;
    if (importPreview.length === 0 || !id) { addToast('No valid subjects to import', 'error'); return; }
    setIsImporting(true);
    setImportProgress(0);

    try {
      const now = new Date().toISOString();
      const previewSnapshot = [...importPreview];
      const subjectsToImport: Subject[] = previewSnapshot.map((data) => ({
          id: uuidv4(),
          name: (data.name as string) || 'Unknown',
          code: normalizeSubjectCode(data.code),
          classId: (data.classId as string) || '',
          createdAt: now,
        }));
      setImportProgress(50);
      await dataService.bulkCreate(id, 'subjects', subjectsToImport as any[]);
      setImportProgress(100);
      
      setIsImporting(false);
      closeImportModal();
      setShowImportSuccess(true);
    } catch (error) {
      setIsImporting(false);
      addToast('Failed to import subjects', 'error');
    }
  }

  const uniqueSubjects = [...new Set(subjects.map(s => getSubjectName(s)).filter(Boolean))];
  const primaryCount = [...new Set(subjects.filter(s => getClassLevel(getSubjectClassId(s)) === 'primary').map(s => getSubjectName(s)))].length;
  const secondaryCount = [...new Set(subjects.filter(s => ['jss','ss'].includes(getClassLevel(getSubjectClassId(s)))).map(s => getSubjectName(s)))].length;

  // Group subjects by name: one row per subject, showing all assigned classes.
  const groupedSubjects = useMemo(() => {
    const map = new Map<string, { name: string; code: string; ids: string[]; classIds: string[] }>();
    for (const s of subjects) {
      const name = getSubjectName(s);
      if (!name) continue;
      const code = getSubjectCode(s);
      const classId = getSubjectClassId(s);
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name, code, ids: [], classIds: [] });
      }
      const entry = map.get(key)!;
      entry.ids.push(s.id);
      if (classId) entry.classIds.push(classId);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [subjects]);

  const filteredGrouped = searchTerm
    ? groupedSubjects.filter(s =>
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.classIds.some(cid => {
          const cls = classes.find((c: any) => c.id === cid);
          return cls?.name?.toLowerCase().includes(searchTerm.toLowerCase());
        })
      )
    : groupedSubjects;

  // Class-grouped accordion state
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());
  function toggleClassAccordion(classId: string) {
    setExpandedClasses(prev => { const n = new Set(prev); n.has(classId) ? n.delete(classId) : n.add(classId); return n; });
  }

  // Group subjects by class for accordion view
  const classesSorted = useMemo(() =>
    sortClassesBySectionThenLevel([...classes]) as any[],
    [classes]
  );

  const subjectsByClass = useMemo(() => {
    const grouped = classesSorted.map(cls => {
      const classSubjects = subjects.filter((s: any) => getSubjectClassId(s) === cls.id);
      const filtered = searchTerm
        ? classSubjects.filter((s: any) =>
            getSubjectName(s).toLowerCase().includes(searchTerm.toLowerCase()) ||
            getSubjectCode(s).toLowerCase().includes(searchTerm.toLowerCase())
          )
        : classSubjects;
      if (filtered.length === 0) return null;
      return { cls, subjects: [...filtered].sort((a: any, b: any) => getSubjectName(a).localeCompare(getSubjectName(b))) };
    }).filter(Boolean) as { cls: any; subjects: any[] }[];

    const assignedClassIds = new Set(classesSorted.map(cls => cls.id));
    const unassignedSubjects = subjects.filter((s: any) => {
      const classId = getSubjectClassId(s);
      return !classId || !assignedClassIds.has(classId);
    });
    const filteredUnassigned = searchTerm
      ? unassignedSubjects.filter((s: any) =>
          getSubjectName(s).toLowerCase().includes(searchTerm.toLowerCase()) ||
          getSubjectCode(s).toLowerCase().includes(searchTerm.toLowerCase())
        )
      : unassignedSubjects;
    if (filteredUnassigned.length > 0) {
      grouped.push({
        cls: { id: '__unassigned__', name: 'Unassigned Subjects' },
        subjects: [...filteredUnassigned].sort((a: any, b: any) => getSubjectName(a).localeCompare(getSubjectName(b))),
      });
    }
    return grouped;
  }, [classesSorted, subjects, searchTerm]);

  useEffect(() => {
    if (subjectsByClass.length === 0) return;
    setExpandedClasses(prev => {
      const next = new Set(prev);
      subjectsByClass.forEach(({ cls }) => next.add(cls.id));
      return next;
    });
  }, [subjectsByClass]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            Subjects
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage subjects for each class</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative" ref={exportMenuRef}>
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)} 
              className="btn btn-secondary"
              title="Export"
            >
              <Download size={16} />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown size={14} className={`transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg z-[9999] overflow-hidden">
                <button
                  onClick={handleExportPDF}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  Export PDF
                </button>
                <button
                  onClick={handleExportCSV}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <Download size={14} />
                  Export CSV
                </button>
                <button
                  onClick={handleExportExcel}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  <FileText size={14} />
                  Export Excel
                </button>
              </div>
            )}
          </div>
          <button onClick={() => setShowImportModal(true)} className="btn btn-secondary" title="Import CSV">
            <Upload size={16} />
            <span className="hidden sm:inline">Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".xlsx,.xls"
            className="hidden"
          />
          <button onClick={() => setShowForm(true)} className="btn btn-primary shadow-lg shadow-primary-500/25">
            <Plus size={16} />
            Add Subject
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="card-solid-purple p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-violet text-white">
              <Book size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Total Subjects</p>
              <p className="text-3xl font-bold text-white">
                {uniqueSubjects.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-emerald p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-green text-white">
              <BookOpen size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Total Entries</p>
              <p className="text-3xl font-bold text-white">
                {subjects.length}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-blue text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Primary</p>
              <p className="text-3xl font-bold text-white">
                {primaryCount}
              </p>
            </div>
          </div>
        </div>
        <div className="card-solid-violet p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-amber text-white">
              <GraduationCap size={24} />
            </div>
            <div>
              <p className="text-sm text-white/80">Secondary</p>
              <p className="text-3xl font-bold text-white">
                {secondaryCount}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }} onClick={() => resetSubjectForm()}>
          <div className="w-full max-w-lg animate-modal-in" style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 20px 60px rgba(0,0,0,0.12), 0 4px 20px rgba(0,0,0,0.07)', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
              <div className="p-7 overflow-y-auto flex-1">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: '#EEF2FF' }}>
                    <Book size={20} className="text-indigo-600" />
                  </div>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <h3 className="font-bold text-slate-900 text-[17px] leading-snug">Add Subject</h3>
                    <p className="text-[14px] text-slate-500 mt-1">Fill in the subject details below.</p>
                  </div>
                  <button type="button" onClick={resetSubjectForm} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
                    <X size={16} className="text-slate-400" />
                  </button>
                </div>
                <div className="space-y-5">

                <div>
                  <label className="form-label">Entry Type</label>
                  <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
                    {(['single', 'multiple'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setEntryMode(mode)}
                        className={`rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-colors ${
                          entryMode === mode
                            ? 'bg-white text-primary-700 shadow-sm dark:bg-slate-700 dark:text-primary-300'
                            : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {entryMode === 'single' ? (
                  <>
                    {/* Subject name */}
                    <div>
                      <label className="form-label">Subject Name *</label>
                      {selectedLevel && ugandaSubjects[selectedLevel]?.length > 0 && !formData.customSubject ? (
                        <PortalSelect
                          value={formData.name}
                          onChange={value => {
                            if (value === '__custom__') {
                              setFormData(prev => ({ ...prev, name: '', code: '', customSubject: true }));
                            } else {
                              const subject = ugandaSubjects[selectedLevel]?.find(item => item.name === value);
                              setFormData(prev => ({ ...prev, name: value, code: subject ? generateSubjectCode(subject.name) || subject.code : prev.code, customSubject: false }));
                            }
                          }}
                          options={[
                            { value: '', label: 'Select subject' },
                            ...ugandaSubjects[selectedLevel].map(subject => ({ value: subject.name, label: subject.name })),
                            { value: '__custom__', label: '+ Custom subject...' },
                          ]}
                        />
                      ) : (
                        <div className="flex gap-2">
                          <input
                            value={formData.name}
                            onChange={e => {
                              const n = e.target.value;
                              setFormData(prev => ({ ...prev, name: n, code: generateSubjectCode(n) || prev.code }));
                            }}
                            className="form-input flex-1"
                            placeholder="e.g. Mathematics"
                            autoFocus
                            required={entryMode === 'single'}
                          />
                          {formData.customSubject && (
                            <button type="button" onClick={() => setFormData(prev => ({ ...prev, name: '', code: '', customSubject: false }))}
                              className="btn btn-secondary text-xs px-3">Presets</button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Code */}
                    <div>
                      <label className="form-label">Subject Code *</label>
                      <input
                        value={formData.code}
                        onChange={e => setFormData(prev => ({ ...prev, code: e.target.value.toUpperCase() }))}
                        className="form-input font-mono"
                        placeholder="e.g. MATH"
                        maxLength={10}
                        required={entryMode === 'single'}
                      />
                    </div>
                  </>
                ) : (
                  <div>
                    <label className="form-label">Subjects *</label>
                    <textarea
                      value={multipleSubjectText}
                      onChange={e => setMultipleSubjectText(e.target.value)}
                      className="form-input min-h-40 font-mono text-sm"
                      placeholder={'Mathematics, MATH\nEnglish, ENG\nScience'}
                      autoFocus
                      required={entryMode === 'multiple'}
                    />
                    <p className="mt-2 text-xs text-slate-500">Use one subject per line. Add a code after a comma, or leave it blank to auto-generate.</p>
                  </div>
                )}

                {/* Level filter */}
                <div>
                  <label className="form-label">Filter by Level <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => { setSelectedLevel(''); setSelectedClassIds([]); }}
                      className={`btn text-sm ${!selectedLevel ? 'btn-primary' : 'btn-secondary'}`}>All</button>
                    {availableLevels.map(({ key, label }) => (
                      <button key={key} type="button"
                        onClick={() => { setSelectedLevel(selectedLevel === key ? '' : key); setSelectedClassIds([]); }}
                        className={`btn text-sm ${selectedLevel === key ? 'btn-primary' : 'btn-secondary'}`}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Class selection */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label mb-0">Assign to Classes *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setSelectedClassIds(visibleClassOptions.map(c => c.id))}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:underline">All</button>
                      <span className="text-slate-300">-+</span>
                      <button type="button" onClick={() => setSelectedClassIds([])}
                        className="text-xs text-slate-500 hover:underline">None</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                    {visibleClassOptions.map(cls => {
                      const sel = selectedClassIds.includes(cls.id);
                      return (
                        <button key={cls.id} type="button" onClick={() => toggleClassSelection(cls.id)}
                          className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all ${
                            sel ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                                : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-500'
                          }`}>
                          <span className="truncate">{cls.name}</span>
                          {sel && <Check size={13} className="shrink-0 ml-1" />}
                        </button>
                      );
                    })}
                    {visibleClassOptions.length === 0 && (
                      <p className="col-span-3 text-sm text-slate-400 py-2">No classes found. Add classes first.</p>
                    )}
                  </div>
                  {selectedClassIds.length > 0 && (
                    <p className="text-xs text-slate-500 mt-2">{selectedClassIds.length} class{selectedClassIds.length > 1 ? 'es' : ''} selected</p>
                  )}
                </div>
                </div>
                {/* Footer */}
                <div className="flex gap-3 justify-end pt-4">
                  <button type="button" onClick={resetSubjectForm} className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]" style={{ background: '#F3F4F6' }} onMouseEnter={e => (e.currentTarget.style.background = '#E5E7EB')} onMouseLeave={e => (e.currentTarget.style.background = '#F3F4F6')}>Cancel</button>
                  <button type="submit" disabled={submitting || (entryMode === 'single' ? (!formData.name || !formData.code) : !multipleSubjectText.trim()) || selectedClassIds.length === 0}
                    className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2 disabled:opacity-50" style={{ backgroundColor: 'var(--primary-color)', boxShadow: '0 2px 8px rgba(79,70,229,0.3)' }}>
                    {submitting ? 'Saving...' : entryMode === 'multiple' ? 'Save Subjects' : 'Save Subject'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      <div className="card">
        <div className="card-header bg-gradient-to-r from-sky-50 to-cyan-50 dark:from-sky-900/20 dark:to-cyan-900/20">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-cyan-400 flex items-center justify-center shadow-md">
                <BookOpen size={20} className="text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-800 dark:text-white">All Subjects</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {subjectsByClass.length} class{subjectsByClass.length !== 1 ? 'es' : ''} -+ {subjects.length} subject entr{subjects.length !== 1 ? 'ies' : 'y'}
                  {searchTerm ? ` matching "${searchTerm}"` : ''}
                </p>
              </div>
            </div>
            <div className="relative w-64 min-w-0">
              <Search size={18} className="search-input-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search subjects..."
                className="search-input"
              />
            </div>
          </div>
        </div>

        {listLoading ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
            <p className="text-slate-500">Loading subjects...</p>
          </div>
        ) : subjectsByClass.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
              <Book size={32} className="text-violet-400" />
            </div>
            <p className="text-slate-500 font-medium">{searchTerm ? 'No subjects match your search' : 'No subjects yet'}</p>
            <p className="text-slate-400 text-sm">{searchTerm ? 'Try a different search term' : 'Add subjects for your classes'}</p>
            {!searchTerm && <button onClick={() => setShowForm(true)} className="text-primary-500 hover:text-primary-600 text-sm">Add your first subject</button>}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {subjectsByClass.map(({ cls, subjects: classSubjects }) => {
              const isOpen = expandedClasses.has(cls.id);
              const classSubjectIds = classSubjects.map((subject: any) => subject.id);
              const selectedInClass = classSubjectIds.filter((subjectId: string) => selectedSubjects.has(subjectId)).length;
              return (
                <div key={cls.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleClassAccordion(cls.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        toggleClassAccordion(cls.id);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-5 py-4 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
                      <BookOpen size={15} className="text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-slate-800 dark:text-white">{cls.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">{classSubjects.length} subject{classSubjects.length !== 1 ? 's' : ''}</p>
                    </div>
                    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => handleSelectClassSubjects(classSubjectIds)}
                        className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                          selectedInClass === classSubjects.length
                            ? 'bg-indigo-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                        }`}
                      >
                        {selectedInClass === classSubjects.length ? <CheckSquare size={13} /> : <Square size={13} />}
                        {selectedInClass > 0 ? `${selectedInClass}/${classSubjects.length}` : 'Select all'}
                      </button>
                      {selectedInClass > 0 && (
                        <button
                          type="button"
                          onClick={() => deleteSelectedSubjectIds(classSubjectIds.filter((subjectId: string) => selectedSubjects.has(subjectId)))}
                          className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
                        >
                          <Trash2 size={13} />
                          Delete
                        </button>
                      )}
                    </div>
                    <ChevronRight size={18} className={`text-slate-400 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-90' : ''}`} />
                  </div>

                  {isOpen && (
                    <div className="border-t border-slate-100 dark:border-slate-700/50 overflow-x-auto">
                      <table className="w-full text-sm border-collapse">
                        <thead>
                          <tr className="bg-slate-50 dark:bg-slate-700/50">
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 w-8">#</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300">Subject</th>
                            <th className="px-4 py-2.5 text-left font-semibold text-slate-600 dark:text-slate-300 w-28">Code</th>
                            <th className="px-4 py-2.5 text-right font-semibold text-slate-600 dark:text-slate-300 w-24">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {classSubjects.map((sub: any, i: number) => (
                            <SubjectRow
                              key={sub.id}
                              sub={sub}
                              i={i}
                              group={groupedSubjects.find(g => g.name.toLowerCase() === getSubjectName(sub).toLowerCase())}
                              selectMode={selectMode}
                              isSelected={selectedSubjects.has(sub.id)}
                              onSelect={handleRowClick}
                              onEdit={openEditGroup}
                              onDelete={handleDeleteGroup}
                              onDoubleClick={() => handleDeleteGroup({ name: getSubjectName(sub) || 'Subject', ids: [sub.id] })}
                            />
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Edit Subject Modal */}
      {editGroup && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={closeEditGroup}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-700 overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Pencil size={18} className="text-white" />
                <h3 className="font-bold text-white">Edit Subject - {editGroup.name}</h3>
              </div>
              <button onClick={closeEditGroup} className="p-1 hover:bg-white/20 rounded-lg transition-colors"><X size={18} className="text-white" /></button>
            </div>
            <form onSubmit={handleEditSubmit} className="flex flex-col overflow-hidden">
              <div className="p-5 space-y-5 overflow-y-auto">
                {/* Name */}
                <div>
                  <label className="form-label">Subject Name *</label>
                  <input value={editForm.name} onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
                    className="form-input" placeholder="e.g. Mathematics" required autoFocus />
                </div>
                {/* Code */}
                <div>
                  <label className="form-label">Subject Code *</label>
                  <input value={editForm.code} onChange={e => setEditForm(p => ({ ...p, code: e.target.value.toUpperCase() }))}
                    className="form-input font-mono" placeholder="e.g. MATH" maxLength={10} required />
                </div>
                {/* Level filter */}
                <div>
                  <label className="form-label">Filter by Level <span className="text-slate-400 font-normal text-xs">(optional)</span></label>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setEditLevel('')}
                      className={`btn text-sm ${!editLevel ? 'btn-primary' : 'btn-secondary'}`}>All</button>
                    {availableLevels.map(({ key, label }) => (
                      <button key={key} type="button" onClick={() => setEditLevel(editLevel === key ? '' : key)}
                        className={`btn text-sm ${editLevel === key ? 'btn-primary' : 'btn-secondary'}`}>{label}</button>
                    ))}
                  </div>
                </div>
                {/* Class assignment */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="form-label mb-0">Assigned Classes *</label>
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditClassIds(classes.map(c => c.id))}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">All</button>
                      <span className="text-slate-300">-+</span>
                      <button type="button" onClick={() => setEditClassIds([])}
                        className="text-xs text-slate-500 hover:underline">None</button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-52 overflow-y-auto pr-1">
                    {sortClassesBySectionThenLevel(editLevel ? classes.filter(c => getClassLevel(c.id) === editLevel) : classes)
                      .map(cls => {
                        const sel = editClassIds.includes(cls.id);
                        const isOriginal = editGroup.classIds.includes(cls.id);
                        return (
                          <button key={cls.id} type="button"
                            onClick={() => setEditClassIds(prev => prev.includes(cls.id) ? prev.filter(id => id !== cls.id) : [...prev, cls.id])}
                            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-all ${
                              sel ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                  : 'border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                            }`}>
                            <span className="truncate">{cls.name}</span>
                            <div className="flex items-center gap-1 shrink-0 ml-1">
                              {isOriginal && !sel && <span className="text-[9px] text-red-400">remove</span>}
                              {!isOriginal && sel && <span className="text-[9px] text-emerald-500">new</span>}
                              {sel && <Check size={12} />}
                            </div>
                          </button>
                        );
                      })}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">{editClassIds.length} class{editClassIds.length !== 1 ? 'es' : ''} selected</p>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex gap-2 justify-end shrink-0 bg-slate-50 dark:bg-slate-800/50">
                <button type="button" onClick={closeEditGroup} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={editSubmitting || !editForm.name || !editForm.code || editClassIds.length === 0}
                  className="btn btn-primary disabled:opacity-50">
                  {editSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {showImportModal && createPortal(
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) closeImportModal(); }}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md animate-modal-in border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in">
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Upload size={18} className="text-white" />
                <h2 className="font-bold text-white">Import Subjects</h2>
              </div>
              <button onClick={closeImportModal} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <X size={18} className="text-white" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto max-h-[calc(85vh-56px)]">
              {importStep === 'upload' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 mb-4">
                    <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 rounded-lg transition-colors text-sm font-medium">
                      <Download size={14} />
                      Download Template
                    </button>
                  </div>

                  <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors cursor-pointer text-center"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={28} className="mx-auto text-slate-400 mb-2" />
                    <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">Click to upload Excel file (.xlsx)</p>
                    <p className="text-xs text-slate-400 mt-1">or drag and drop</p>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                    <h4 className="font-medium text-slate-700 dark:text-slate-200 mb-2 text-sm">Expected Fields:</h4>
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      {subjectExpectedFields.map(field => (
                        <div key={field.key} className="flex items-center gap-1.5">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${field.required ? 'bg-red-500' : 'bg-slate-400'}`} />
                          <span className="text-slate-600 dark:text-slate-300 truncate">{field.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {importStep === 'map' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 rounded">1</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">2 Map</span>
                    <ArrowRight size={12} />
                    <span className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-500 rounded">3</span>
                  </div>

                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded-lg">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">File Column</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Sample</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Maps To</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {csvHeaders.map((header, idx) => {
                          const sample = csvData[0]?.[idx] || '';
                          const currentMapping = Object.entries(fieldMapping).find(([, v]) => v === header)?.[0] || '';
                          return (
                            <tr key={header} className={idx % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50/50 dark:bg-slate-800/50'}>
                              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{header}</td>
                              <td className="px-3 py-2 text-slate-400 truncate max-w-[80px]">{sample}</td>
                              <td className="px-3 py-2">
                                <PortalSelect
                                  value={currentMapping}
                                  onChange={nextKey => {
                                    setFieldMapping(prev => {
                                      const next = { ...prev };
                                      Object.keys(next).forEach(key => { if (next[key] === header) delete next[key]; });
                                      if (nextKey) next[nextKey] = header;
                                      return next;
                                    });
                                  }}
                                  className="py-1 text-xs"
                                  options={[
                                    { value: '', label: 'Skip' },
                                    ...subjectExpectedFields.map(field => ({ value: field.key, label: `${field.label}${field.required ? ' *' : ''}` })),
                                  ]}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button onClick={closeImportModal} className="btn btn-secondary py-1.5 px-3 text-sm">Cancel</button>
                    <button onClick={processMapping} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1">
                      Preview <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              )}

              {importStep === 'preview' && (
                <div data-preview-fullscreen-root className="space-y-3 rounded-xl bg-white p-1 dark:bg-slate-800">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 1</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-green-600 text-white rounded flex items-center gap-1"><Check size={10} /> 2</span>
                      <ArrowRight size={12} />
                      <span className="px-1.5 py-0.5 bg-indigo-600 text-white rounded font-medium">3</span>
                    </div>
                    <FullscreenButton />
                  </div>

                  <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-2.5">
                    <p className="text-sm text-emerald-700 dark:text-emerald-300">
                      <strong>{importPreview.length}</strong> subjects ready to import
                    </p>
                  </div>

                  {importWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-800 dark:bg-amber-900/20">
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                        {importWarnings.length} row{importWarnings.length === 1 ? '' : 's'} flagged and skipped
                      </p>
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                        These rows will not import until the subject name, code, and class match your existing classes.
                      </p>
                      <div className="mt-2 max-h-28 overflow-y-auto rounded border border-amber-200 bg-white/70 dark:border-amber-800 dark:bg-slate-900/30">
                        <table className="w-full text-xs">
                          <thead className="sticky top-0 bg-amber-100 dark:bg-amber-900/40">
                            <tr>
                              <th className="px-2 py-1.5 text-left font-semibold text-amber-800 dark:text-amber-200">Row</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-amber-800 dark:text-amber-200">Subject</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-amber-800 dark:text-amber-200">Class</th>
                              <th className="px-2 py-1.5 text-left font-semibold text-amber-800 dark:text-amber-200">Issue</th>
                            </tr>
                          </thead>
                          <tbody>
                            {importWarnings.map((warning, index) => (
                              <tr key={`${warning.row}-${index}`} className="border-t border-amber-100 dark:border-amber-900/40">
                                <td className="px-2 py-1.5 text-amber-700 dark:text-amber-300">{warning.row}</td>
                                <td className="px-2 py-1.5 text-slate-700 dark:text-slate-200">{warning.subject}</td>
                                <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{warning.className}</td>
                                <td className="px-2 py-1.5 text-amber-700 dark:text-amber-300">{warning.reason}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden max-h-40 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">#</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Name</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Code</th>
                          <th className="px-2 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300">Class</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {importPreview.map((subject, index) => (
                          <tr key={index} className="hover:bg-slate-50 dark:hover:bg-slate-700/30">
                            <td className="px-2 py-1.5 text-slate-500">{index + 1}</td>
                            <td className="px-2 py-1.5">{(subject as any).name || '-'}</td>
                            <td className="px-2 py-1.5">{getSubjectDisplayCode(subject) || '-'}</td>
                            <td className="px-2 py-1.5">{(subject as any).className || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-between pt-2">
                    <button onClick={() => setImportStep('map')} className="btn btn-secondary py-1.5 px-3 text-sm" disabled={isImporting}>Back</button>
                    <button onClick={executeImport} disabled={isImporting || importPreview.length === 0} className="btn btn-primary py-1.5 px-3 text-sm flex items-center gap-1 disabled:opacity-70">
                      {isImporting ? <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Importing {importProgress}%</> : <><Check size={14} /> Import {importPreview.length}</>}
                    </button>
                  </div>
                  {isImporting && (
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-2">
                      <div className="bg-primary-500 h-1.5 rounded-full transition-all duration-300" style={{ width: `${importProgress}%` }} />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      , document.body)}

      {showImportSuccess && (
        <SuccessPopup 
          message="Import Complete!" 
          subMessage="Subject records have been updated."
          onClose={() => setShowImportSuccess(false)}
        />
      )}
    </div>
  );
}
