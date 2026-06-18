import { useMemo, useState, useRef, useEffect } from 'react';
import { Archive, CalendarDays, Camera, Check, ChevronDown, ChevronRight, GraduationCap, Image as ImageIcon, Search, Users, X, Eye, PackageOpen } from 'lucide-react';
import type { Class, Student } from '@schofy/shared';
import ImageModal from '../components/ImageModal';
import { PortalSelect } from '../components/PortalSelect';
import { useAuth } from '../contexts/AuthContext';
import { useTableData } from '../lib/store';
import { getClassDisplayName, sortClassesBySectionThenLevel } from '../utils/classroom';
import { sortStudentsForList } from '../utils/studentOrdering';
import { compressDataUrl } from '../utils/imageCompression';
import { dataService } from '../lib/database/SupabaseDataService';
import { createPortal } from 'react-dom';

const TERMS = ['Term 1', 'Term 2', 'Term 3', 'Final'];

function getStudentName(student: Student) {
  return `${student.firstName || ''} ${student.lastName || ''}`.trim() || 'Unnamed learner';
}

function getStudentId(student: Student) {
  return student.studentId || student.admissionNo || student.id;
}

function normalizeTerm(value: unknown) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^term\s*[123]$/i.test(text)) return text.replace(/\s+/, ' ').replace(/^term/i, 'Term');
  if (/^[123]$/.test(text)) return `Term ${text}`;
  return text;
}

export default function SchoolRecords() {
  const { user, schoolId } = useAuth();
  const tenantId = schoolId || user?.id || '';
  const { data: studentsData } = useTableData(tenantId, 'students');
  const { data: classesData } = useTableData(tenantId, 'classes');
  const { data: settings } = useTableData(tenantId, 'settings');
  const [selectedYear, setSelectedYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('all');
  const [viewMode, setViewMode] = useState<'archive' | 'album'>('archive');
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [fullPageViewOpen, setFullPageViewOpen] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressProgress, setCompressProgress] = useState(0);

  const students = studentsData as Student[];
  const classes = useMemo(() => sortClassesBySectionThenLevel(classesData as Class[]), [classesData]);
  const currentAcademicYear = useMemo(() => {
    return settings.find((row: any) => row.key === 'currentAcademicYear')?.value
      || settings.find((row: any) => row.key === 'academicYear')?.value
      || String(new Date().getFullYear());
  }, [settings]);
  const currentTerm = useMemo(() => normalizeTerm(
    settings.find((row: any) => row.key === 'currentTerm')?.value || 'Term 1'
  ), [settings]);

  useEffect(() => {
    if (!selectedYear && currentAcademicYear) setSelectedYear(String(currentAcademicYear));
    if (!selectedTerm && currentTerm) setSelectedTerm(currentTerm);
  }, [currentAcademicYear, currentTerm, selectedTerm, selectedYear]);

  const years = useMemo(() => {
    const values = new Set<string>([String(currentAcademicYear), String(new Date().getFullYear())]);
    students.forEach((student: any) => {
      if (student.completedYear) values.add(String(student.completedYear));
      if (student.year) values.add(String(student.year));
      if (student.academicYear) values.add(String(student.academicYear));
      if (student.createdAt) {
        const year = new Date(student.createdAt).getFullYear();
        if (Number.isFinite(year)) values.add(String(year));
      }
    });
    return Array.from(values).filter(Boolean).sort((a, b) => Number(b) - Number(a));
  }, [currentAcademicYear, students]);

  const recordStudents = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return sortStudentsForList(students.filter((student: any) => {
      const studentYear = String(student.completedYear || student.year || student.academicYear || currentAcademicYear);
      const studentTerm = normalizeTerm(student.completedTerm || student.term || currentTerm);
      const matchesYear = selectedYear === 'all' || studentYear === selectedYear;
      const matchesTerm = selectedTerm === 'all' || studentTerm === selectedTerm;
      const matchesClass = selectedClass === 'all' || student.classId === selectedClass;
      const matchesQuery = !needle || [
        getStudentName(student),
        getStudentId(student),
        getClassDisplayName(student.classId, classes),
      ].some(value => String(value || '').toLowerCase().includes(needle));
      return matchesYear && matchesTerm && matchesClass && matchesQuery;
    }));
  }, [classes, currentAcademicYear, currentTerm, query, selectedClass, selectedTerm, selectedYear, students]);

  const archivedStudents = recordStudents.filter((student: any) => student.status === 'completed' || student.status === 'graduated');
  const albumStudents = recordStudents.filter(student => student.photoUrl);
  const selectedClassName = selectedClass === 'all' ? 'All classes' : getClassDisplayName(selectedClass, classes);

  const archiveGroups = useMemo(() => {
    const groups = new Map<string, Student[]>();
    archivedStudents.forEach((student: any) => {
      const year = String(student.completedYear || student.year || currentAcademicYear);
      const term = normalizeTerm(student.completedTerm || student.term || currentTerm) || 'Final';
      const key = `${year} - ${term}`;
      groups.set(key, [...(groups.get(key) || []), student]);
    });
    return Array.from(groups.entries()).map(([label, group]) => ({ label, students: group }));
  }, [archivedStudents, currentAcademicYear, currentTerm]);

  const archiveGroupsToShow = viewMode === 'archive' ? archiveGroups : [];
  const albumStudentsToShow = viewMode === 'album' ? albumStudents : [];

  // Compress selected students
  const compressStudents = async (studentIds: string[]) => {
    if (!tenantId || studentIds.length === 0) return;
    setIsCompressing(true);
    setCompressProgress(0);
    try {
      const studentsToCompress = students.filter(s => studentIds.includes(s.id));
      for (let i = 0; i < studentsToCompress.length; i++) {
        const student = studentsToCompress[i];
        const photoUrl = student.photoUrl;
        if (photoUrl) {
          try {
            const compressed = await compressDataUrl(photoUrl, 800, 0.75);
            if (compressed.length < photoUrl.length) {
              await dataService.update(tenantId, 'students', student.id, { photoUrl: compressed });
            }
          } catch (err) {
            console.error('Failed to compress image for', student.id, err);
          }
        }
        setCompressProgress(Math.round(((i + 1) / studentsToCompress.length) * 100));
      }
    } finally {
      setIsCompressing(false);
      setCompressProgress(0);
    }
  };



  // Ensure default selected year is the current academic year on first load, and current year group is expanded
  const initialYearSetRef = useRef(false);
  useEffect(() => {
    if (!initialYearSetRef.current) {
      initialYearSetRef.current = true;
      setSelectedYear(String(currentAcademicYear));
      setViewMode('archive');
      // Expand current academic year groups by default
      const currentYearGroups = archiveGroups.filter(group => group.label.startsWith(String(currentAcademicYear)));
      setExpandedGroups(new Set(currentYearGroups.map(g => g.label)));
    }
  }, [currentAcademicYear, archiveGroups]);

  // Toggle group expanded state
  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  // Toggle student selection
  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      if (newSet.has(studentId)) {
        newSet.delete(studentId);
      } else {
        newSet.add(studentId);
      }
      return newSet;
    });
  };

  // Select all students in a group
  const selectAllInGroup = (groupStudents: Student[]) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      groupStudents.forEach(s => newSet.add(s.id));
      return newSet;
    });
  };

  // Deselect all students in a group
  const deselectAllInGroup = (groupStudents: Student[]) => {
    setSelectedStudents(prev => {
      const newSet = new Set(prev);
      groupStudents.forEach(s => newSet.delete(s.id));
      return newSet;
    });
  };

  const archivesRef = useRef<HTMLDivElement | null>(null);
  const albumRef = useRef<HTMLDivElement | null>(null);

  function scrollToArchives() {
    archivesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function scrollToAlbum() {
    albumRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title">
          <h1 className="text-title">School Records</h1>
          <p className="text-subtitle">Archives by year and term with class learner albums</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <button
          type="button"
          onClick={() => { setSelectedYear('all'); setSelectedTerm('all'); setSelectedClass('all'); setViewMode('archive'); scrollToArchives(); }}
          className="card-solid-indigo p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Archive Records</p>
            <Archive size={23} />
          </div>
          <p className="mt-3 text-3xl font-black">{archivedStudents.length}</p>
        </button>
        <button
          type="button"
          onClick={() => { setSelectedYear('all'); setSelectedClass('all'); setViewMode('album'); scrollToAlbum(); }}
          className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Album Photos</p>
            <Camera size={23} />
          </div>
          <p className="mt-3 text-3xl font-black">{albumStudents.length}</p>
        </button>
        <button
          type="button"
          onClick={() => { setSelectedYear(prev => prev === 'all' ? String(currentAcademicYear) : 'all'); setViewMode('archive'); scrollToArchives(); }}
          className="card-solid-violet p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Selected Year</p>
            <CalendarDays size={23} />
          </div>
          <p className="mt-3 text-3xl font-black">{selectedYear === 'all' ? 'All' : selectedYear}</p>
        </button>
        <button
          type="button"
          onClick={() => {
            if (selectedClass === 'all' && classes.length > 0) setSelectedClass(classes[0].id);
            else setSelectedClass('all');
            setViewMode('album');
            scrollToAlbum();
          }}
          className="card-solid-amber p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all text-left"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-white/80">Class Album</p>
            <Users size={23} />
          </div>
          <p className="mt-3 truncate text-2xl font-black">{selectedClassName}</p>
        </button>
      </div>

      <div className="grid gap-5">
        {viewMode === 'archive' ? (
          <div ref={archivesRef} className="table-container overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-700">
              <div className="flex items-center gap-2">
                <Archive size={18} className="text-primary-500" />
                <h2 className="font-bold text-slate-900 dark:text-white">Archives</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{archiveGroups.length} groups</span>
            </div>
            <div className="border-b border-slate-100 p-4 dark:border-slate-700">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="grid gap-3 flex-1 lg:grid-cols-[1fr_160px_160px_220px]">
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      className="search-input pl-9"
                      value={query}
                      onChange={event => setQuery(event.target.value)}
                      placeholder="Search learner, ID, or class..."
                    />
                  </div>
                  <PortalSelect
                    value={selectedYear}
                    onChange={setSelectedYear}
                    options={[{ value: 'all', label: 'All years' }, ...years.map(year => ({ value: year, label: year }))]}
                    className={`filter-select ${selectedYear !== 'all' ? 'filter-input-active' : ''}`}
                  />
                  <PortalSelect
                    value={selectedTerm}
                    onChange={setSelectedTerm}
                    options={[{ value: 'all', label: 'All terms' }, ...TERMS.map(term => ({ value: term, label: term }))]}
                    className={`filter-select ${selectedTerm !== 'all' ? 'filter-input-active' : ''}`}
                  />
                  <PortalSelect
                    value={selectedClass}
                    onChange={setSelectedClass}
                    options={[{ value: 'all', label: 'All classes' }, ...classes.map(classItem => ({ value: classItem.id, label: getClassDisplayName(classItem.id, classes) }))]}
                    className={`filter-select ${selectedClass !== 'all' ? 'filter-input-active' : ''}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    {selectedStudents.size} selected
                  </span>
                  <button
                    onClick={() => setArchiveModalOpen(true)}
                    className="btn btn-primary"
                  >
                    <Archive size={16} />
                    Archive Operations
                  </button>
                </div>
              </div>
            </div>
            {archiveGroupsToShow.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
                <GraduationCap size={34} className="text-slate-300" />
                <p className="font-semibold text-slate-500">No archived records found</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-700">
                {archiveGroupsToShow.map(group => {
                  const isExpanded = expandedGroups.has(group.label);
                  const allSelected = group.students.every(s => selectedStudents.has(s.id));
                  const someSelected = group.students.some(s => selectedStudents.has(s.id));
                  return (
                    <div key={group.label}>
                      <div className="flex items-center justify-between gap-3 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <button
                          type="button"
                          onClick={() => toggleGroup(group.label)}
                          className="flex items-center gap-3 flex-1 text-left"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown size={20} className="text-primary-500" />
                            ) : (
                              <ChevronRight size={20} className="text-slate-400" />
                            )}
                            <h3 className="font-black text-slate-900 dark:text-white">{group.label}</h3>
                          </div>
                        </button>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (allSelected) {
                                deselectAllInGroup(group.students);
                              } else {
                                selectAllInGroup(group.students);
                              }
                            }}
                            className="flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                          >
                            <div className="h-4 w-4 flex items-center justify-center rounded border border-slate-300 dark:border-slate-500">
                              {allSelected && <Check size={12} className="text-primary-600" />}
                            </div>
                            {allSelected ? 'Deselect All' : someSelected ? 'Select All' : 'Select All'}
                          </button>
                          <span className="badge badge-info">{group.students.length} learners</span>
                        </div>
                      </div>
                      {isExpanded && (
                        <div className="p-4 pt-0 space-y-2">
                          {group.students.map(student => (
                            <div key={student.id} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 transition-colors hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/50">
                              <div className="flex items-center gap-3 flex-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleStudentSelection(student.id);
                                  }}
                                  className="flex h-5 w-5 items-center justify-center rounded border border-slate-300 dark:border-slate-500"
                                >
                                  {selectedStudents.has(student.id) && <Check size={14} className="text-primary-600" />}
                                </button>
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                  {getStudentName(student).slice(0, 2).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium text-slate-800 dark:text-white">{getStudentName(student)}</p>
                                  <p className="truncate text-xs text-slate-400">{getStudentId(student)} - {getClassDisplayName(student.classId, classes)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div ref={albumRef} className="table-container overflow-hidden">
            <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon size={18} className="text-primary-500" />
                <h2 className="font-bold text-slate-900 dark:text-white">Student Class Album</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{albumStudents.length} photos</span>
            </div>
            <div className="border-b border-slate-100 p-4 dark:border-slate-700">
              <div className="grid gap-3 lg:grid-cols-[1fr_160px_160px_220px]">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    className="search-input pl-9"
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder="Search learner, ID, or class..."
                  />
                </div>
                <PortalSelect
                  value={selectedYear}
                  onChange={setSelectedYear}
                  options={[{ value: 'all', label: 'All years' }, ...years.map(year => ({ value: year, label: year }))]}
                  className={`filter-select ${selectedYear !== 'all' ? 'filter-input-active' : ''}`}
                />
                <PortalSelect
                  value={selectedTerm}
                  onChange={setSelectedTerm}
                  options={[{ value: 'all', label: 'All terms' }, ...TERMS.map(term => ({ value: term, label: term }))]}
                  className={`filter-select ${selectedTerm !== 'all' ? 'filter-input-active' : ''}`}
                />
                <PortalSelect
                  value={selectedClass}
                  onChange={setSelectedClass}
                  options={[{ value: 'all', label: 'All classes' }, ...classes.map(classItem => ({ value: classItem.id, label: getClassDisplayName(classItem.id, classes) }))]}
                  className={`filter-select ${selectedClass !== 'all' ? 'filter-input-active' : ''}`}
                />
              </div>
            </div>

            {albumStudentsToShow.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 py-20 text-center">
                <Camera size={36} className="text-slate-300" />
                <p className="font-semibold text-slate-500">No learner photos for this selection</p>
              </div>
            ) : (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {albumStudentsToShow.map(student => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => student.photoUrl && setPreview({ src: student.photoUrl, alt: getStudentName(student) })}
                    className="group animate-slide-down overflow-hidden rounded-lg border border-slate-200 bg-white text-left shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/50"
                  >
                    <div className="aspect-[4/5] overflow-hidden bg-slate-100 dark:bg-slate-900">
                      <img
                        src={student.photoUrl}
                        alt={getStudentName(student)}
                        loading="lazy"
                        decoding="async"
                        className="h-full w-full object-cover object-top transition duration-300 group-hover:scale-[1.03]"
                      />
                    </div>
                    <div className="p-3">
                      <p className="truncate font-black text-slate-900 dark:text-white">{getStudentName(student)}</p>
                      <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{getStudentId(student)}</p>
                      <p className="mt-1 truncate text-xs text-slate-400">{getClassDisplayName(student.classId, classes)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ImageModal
        src={preview?.src || ''}
        alt={preview?.alt || ''}
        isOpen={!!preview}
        onClose={() => setPreview(null)}
      />

      {/* Archive Operations Modal */}
      {archiveModalOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-800 shadow-2xl overflow-hidden animate-modal-in">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-900 dark:text-white">Archive Operations</h2>
                <p className="text-sm text-slate-500 mt-1">Manage selected student records</p>
              </div>
              <button
                onClick={() => setArchiveModalOpen(false)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  onClick={() => {
                    setArchiveModalOpen(false);
                    setFullPageViewOpen(true);
                  }}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-lg bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                    <Eye size={20} className="text-primary-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">View Records</p>
                    <p className="text-xs text-slate-500">Open selected records in full page view</p>
                  </div>
                </button>
                <button
                  onClick={async () => {
                    await compressStudents(Array.from(selectedStudents));
                    setArchiveModalOpen(false);
                  }}
                  disabled={isCompressing || selectedStudents.size === 0}
                  className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left disabled:opacity-50"
                >
                  <div className="w-10 h-10 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                    <PackageOpen size={20} className="text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {isCompressing ? `Compressing... ${compressProgress}%` : 'Compress Selected'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {isCompressing ? 'Compressing images to save space' : 'Compress selected records back to archive'}
                    </p>
                  </div>
                </button>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-700/50 p-4">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  <strong className="font-semibold">Selected Records:</strong> {selectedStudents.size}
                </p>
              </div>
            </div>
            <div className="p-6 border-t border-slate-200 dark:border-slate-700 flex justify-end">
              <button
                onClick={() => setArchiveModalOpen(false)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Full Page View Modal */}
      {fullPageViewOpen && createPortal(
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-900 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Selected Records</h2>
              <p className="text-sm text-slate-500 mt-1">
                {selectedStudents.size} student{selectedStudents.size !== 1 ? 's' : ''} selected
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setFullPageViewOpen(false)}
                className="btn btn-secondary"
              >
                Close
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              {selectedStudents.size === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 py-20">
                  <GraduationCap size={48} className="text-slate-300" />
                  <p className="text-lg font-semibold text-slate-500">No records selected</p>
                </div>
              ) : (
                students.filter(s => selectedStudents.has(s.id)).map(student => (
                  <div key={student.id} className="card p-6">
                    <div className="flex items-start gap-6">
                      {student.photoUrl && (
                        <div className="w-24 h-32 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                          <img
                            src={student.photoUrl}
                            alt={getStudentName(student)}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1">
                        <h3 className="text-2xl font-black text-slate-900 dark:text-white">
                          {getStudentName(student)}
                        </h3>
                        <p className="text-sm text-slate-500 mt-1">
                          {getStudentId(student)} • {getClassDisplayName(student.classId, classes)}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                          <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                              Status
                            </p>
                            <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1">
                              {student.status}
                            </p>
                          </div>
                          {student.completedYear && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Completed Year
                              </p>
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1">
                                {student.completedYear}
                              </p>
                            </div>
                          )}
                          {student.completedTerm && (
                            <div>
                              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                                Completed Term
                              </p>
                              <p className="text-sm font-medium text-slate-700 dark:text-slate-200 mt-1">
                                {student.completedTerm}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
