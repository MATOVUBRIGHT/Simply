import { useEffect, useState, useRef, useCallback, type ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { Palette, Building, Calendar, DollarSign, Cloud, CloudOff, RefreshCw, CheckCircle, Database, Upload, Download, AlertTriangle, Trash2, GraduationCap, ArrowRight, Users, Keyboard, Info, Shield, ScrollText, HelpCircle, Save, X } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrency } from '../hooks/useCurrency';
import { useSync, type BackupImportPreview, type BackupImportProgress } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { dataService } from '../lib/database/SupabaseDataService';
import { useConfirm } from '../components/ConfirmModal';
import { PortalSelect } from '../components/PortalSelect';
import { isDesktopApp } from '../utils/desktopSyncPreference';
import { releaseChannelLabel } from '../utils/releaseChannel';
import { deleteInThirtyPercentBatches, processInThirtyPercentBatches, runTasksInThirtyPercentBatches } from '../utils/bulkDelete';
import { compressImageFile } from '../utils/imageCompression';
import { cleanupDeletedClassReferences } from '../utils/classDeletionCleanup';
import { loginLocal } from '../lib/auth/LocalAuth';
import { OperationProgressPopup } from '../components/OperationProgressPopup';
import {
  clearSchoolDatabaseConfig,
  readSchoolDatabaseConfig,
  saveSchoolDatabaseConfig,
  testSchoolDatabaseConnection,
  toSharedSchoolDatabaseConfig,
  type SchoolDatabaseConfig,
} from '../utils/schoolDatabaseConfig';

const APP_VERSION_LABEL = 'Version1.1';

const currencies = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
  { code: 'KES', symbol: 'KSh', name: 'Kenyan Shilling' },
  { code: 'TZS', symbol: 'TSh', name: 'Tanzanian Shilling' },
  { code: 'GHS', symbol: 'GH₵', name: 'Ghanaian Cedi' },
  { code: 'NGN', symbol: '₦', name: 'Nigerian Naira' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'RWF', symbol: 'RF', name: 'Rwandan Franc' },
  { code: 'ETB', symbol: 'Br', name: 'Ethiopian Birr' },
  { code: 'ZMW', symbol: 'ZK', name: 'Zambian Kwacha' },
];

function normalizeSchoolType(value: unknown) {
  const allowed = new Set(['nursery', 'primary', 'secondary', 'nursery_primary', 'primary_secondary', 'all']);
  const text = String(value || '').trim();
  return allowed.has(text) ? text : 'nursery_primary';
}

function normalizeSchoolCategory(value: unknown) {
  const text = String(value || '').trim();
  return text === 'music_school' || text === 'tailoring' ? text : '';
}

export default function Settings() {
  const { primaryColor, setPrimaryColor } = useTheme();
  const { addToast } = useToast();
  const { setCurrency } = useCurrency();
  const { isOnline, isSyncing, pendingChanges, lastSyncTime, exportBackup, previewBackupImport, executeBackupImport, isSyncEnabled, enableSync, disableSync, isSupabaseConfigured } = useSync();
  const { user, schoolId } = useAuth();
  const confirm = useConfirm();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteNewTerm, setPromoteNewTerm] = useState('1');
  const [promoteNewYear, setPromoteNewYear] = useState(new Date().getFullYear().toString());
  const [isPromoting, setIsPromoting] = useState(false);
  const [promoteProgress, setPromoteProgress] = useState(0);
  const [promoteStatus, setPromoteStatus] = useState('');
  const [showCloudBackupModal, setShowCloudBackupModal] = useState(false);
  const [backupAccount, setBackupAccount] = useState(user?.email || '');
  const [isCloudBackingUp, setIsCloudBackingUp] = useState(false);
  const [backupPreview, setBackupPreview] = useState<BackupImportPreview | null>(null);
  const [ignoredBackupTables, setIgnoredBackupTables] = useState<Set<string>>(new Set());
  const [skipBackupDuplicates, setSkipBackupDuplicates] = useState(true);
  const [backupProgress, setBackupProgress] = useState<BackupImportProgress>({
    open: false,
    title: '',
    detail: '',
    progress: 0,
    processed: 0,
    total: 0,
  });
  const [schoolDbConfig, setSchoolDbConfig] = useState<SchoolDatabaseConfig>({
    provider: 'database',
    enabled: false,
    url: '',
    anonKey: '',
    shareToDevices: false,
  });
  const [testingSchoolDb, setTestingSchoolDb] = useState(false);
  const [savingSchoolDb, setSavingSchoolDb] = useState(false);
  const [schoolDbMessage, setSchoolDbMessage] = useState('');
  const [showSchoolDbConfirm, setShowSchoolDbConfirm] = useState(false);
  const [schoolDbAdminPassword, setSchoolDbAdminPassword] = useState('');
  const [schoolDbConfirmAction, setSchoolDbConfirmAction] = useState<'save' | 'clear' | null>(null);
  const [schoolDbPasswordError, setSchoolDbPasswordError] = useState('');
  const [settings, setSettings] = useState({
    schoolName: 'My School',
    schoolAddress: '',
    schoolPhone: '',
    schoolEmail: '',
    schoolLogo: '',
    academicYear: new Date().getFullYear().toString(),
    currentTerm: '1',
    term1Start: '',
    term1End: '',
    term2Start: '',
    term2End: '',
    term3Start: '',
    term3End: '',
    currency: 'USD',
    schoolType: 'nursery_primary',
    schoolCategory: '',
    musicInstruments: 'Piano, Guitar, Drums, Violin, Voice',
    bankAccountName: '',
    bankAccountNumber: '',
    bankName: '',
    paymentMethod: 'BANK TRANSFER',
    bankAccountName2: '',
    bankAccountNumber2: '',
    bankName2: '',
    paymentMethod2: '',
    bankAccountName3: '',
    bankAccountNumber3: '',
    bankName3: '',
    paymentMethod3: '',
  });

  const desktopApp = isDesktopApp();
  const releaseTypeLabel = desktopApp ? 'Desktop App' : 'Web App';
  const releaseDownloadLabel = `${APP_VERSION_LABEL} · ${releaseTypeLabel} · ${releaseChannelLabel}`;
  const releaseUpdateNote = desktopApp
    ? 'Use this release type when downloading updates so you choose the correct package, not Lite or Windows 7 by mistake.'
    : 'Web app updates are automatic. Refresh the page when Schofy announces a new update.';

  useEffect(() => {
    if (user?.id || schoolId) {
      loadSettings();
    }
  }, [user?.id, schoolId]);

  useEffect(() => {
    const sid = schoolId || user?.schoolId || user?.id;
    const saved = readSchoolDatabaseConfig(sid);
    setSchoolDbConfig(saved || { provider: 'database', enabled: false, url: '', anonKey: '', shareToDevices: false });
    setSchoolDbMessage('');
  }, [schoolId, user?.schoolId, user?.id]);

  async function loadSettings() {
    const id = schoolId || user?.id;
    if (!id) return;
    const localKey = `schofy_settings_${id}`;

    try {
      // 1. Load from localStorage immediately — this is the source of truth
      const localRaw = localStorage.getItem(localKey);
      let localObj: Record<string, any> = {};
      if (localRaw) {
        try { localObj = JSON.parse(localRaw); } catch { /* ignore */ }
      }

      if (Object.keys(localObj).length > 0) {
        // We have local settings — apply them immediately
        setSettings(prev => ({ ...prev, ...localObj, schoolType: normalizeSchoolType(localObj.schoolType), schoolCategory: normalizeSchoolCategory(localObj.schoolCategory) }));
        if (localObj.currency) {
          localStorage.setItem('schofy_currency', localObj.currency);
          window.dispatchEvent(new Event('currencyChanged'));
        }
      }

      // 2. Fetch from Supabase — only fill in keys that are missing locally (new device / first login)
      const stored = await dataService.getAll(id, 'settings');
      if (stored.length > 0) {
        const remoteObj: Record<string, any> = {};
        stored.forEach((s: any) => { remoteObj[s.key] = s.value; });
        const sharedDbConfig = remoteObj.schoolDatabaseConnection as SchoolDatabaseConfig | undefined;
        const existingDbConfig = readSchoolDatabaseConfig(id);
        if (!existingDbConfig?.enabled && sharedDbConfig?.enabled && sharedDbConfig.url && sharedDbConfig.anonKey) {
          const shared = toSharedSchoolDatabaseConfig(sharedDbConfig);
          saveSchoolDatabaseConfig(id, shared);
          setSchoolDbConfig(shared);
          setSchoolDbMessage('Shared school database connection loaded for this device.');
        }

        const merged = {
          ...localObj,
          ...remoteObj,
          schoolType: normalizeSchoolType(remoteObj.schoolType || localObj.schoolType),
          schoolCategory: normalizeSchoolCategory(remoteObj.schoolCategory || localObj.schoolCategory),
        };
        setSettings(prev => ({ ...prev, ...remoteObj, schoolType: merged.schoolType, schoolCategory: merged.schoolCategory }));
        localStorage.setItem(localKey, JSON.stringify(merged));
        if (remoteObj.currency) {
          localStorage.setItem('schofy_currency', remoteObj.currency);
          window.dispatchEvent(new Event('currencyChanged'));
        }
      }
  } catch (error) {
      console.error(error);
    }
  }

  const [isSaving, setIsSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const schoolLogoInputRef = useRef<HTMLInputElement>(null);

  const applySettingsLocally = useCallback((newSettings: typeof settings) => {
    const sid = schoolId || user?.id;
    if (!sid) return;
    const normalized = {
      ...newSettings,
      schoolType: normalizeSchoolType(newSettings.schoolType),
      schoolCategory: normalizeSchoolCategory(newSettings.schoolCategory),
    };
    localStorage.setItem(`schofy_settings_${sid}`, JSON.stringify(normalized));
    localStorage.setItem('schofy_currency', normalized.currency || 'USD');
    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: normalized }));
    window.dispatchEvent(new Event('currencyChanged'));
  }, [schoolId, user?.id]);

  // Auto-save to Supabase 1s after last change
  const autoSave = useCallback(async (newSettings: typeof settings) => {
    const sid = schoolId || user?.id;
    if (!sid || !newSettings.schoolName?.trim()) return;
    setIsSaving(true);
    try {
      await dataService.saveSettings(sid, newSettings);
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    } catch { /* silent */ } finally {
      setIsSaving(false);
    }
  }, [schoolId, user?.id]);

  async function handleSave(e?: React.FormEvent | React.MouseEvent) {
    if (e) e.preventDefault();
    const sid = schoolId || user?.id;
    if (!sid || isSaving) return;

    if (!settings.schoolName || settings.schoolName.trim() === '') {
      addToast('Please enter your school name', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const settingsToSave = { ...settings, schoolType: normalizeSchoolType(settings.schoolType), schoolCategory: normalizeSchoolCategory(settings.schoolCategory) };
      applySettingsLocally(settingsToSave);
      const classesOk = await autoCreateClasses(sid, settingsToSave.schoolType, { confirmStudentClear: true, forceReplace: false });
      if (!classesOk) return;

      const result = await dataService.saveSettings(sid, settingsToSave);
      if (!result.success) {
        addToast(result.error || 'Failed to save settings', 'error');
        return;
      }

      window.dispatchEvent(new CustomEvent('classesUpdated'));
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
      addToast('Settings saved', 'success');
    } catch (error: any) {
      console.error('Save settings error:', error);
      addToast(error?.message || 'Failed to save settings', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function autoCreateClasses(
    sid: string,
    schoolTypeOverride?: string,
    options: { confirmStudentClear?: boolean; forceReplace?: boolean } = {},
  ): Promise<boolean> {
    const schoolType = normalizeSchoolType(schoolTypeOverride || settings.schoolType);

    const CLASS_MAP: Record<string, { name: string; level: number }[]> = {
      nursery: [
        { name: 'Baby Class', level: 1 },
        { name: 'Middle Class', level: 2 },
        { name: 'Top Class', level: 3 },
      ],
      primary: [
        { name: 'P.1', level: 5 },
        { name: 'P.2', level: 6 },
        { name: 'P.3', level: 7 },
        { name: 'P.4', level: 8 },
        { name: 'P.5', level: 9 },
        { name: 'P.6', level: 10 },
        { name: 'P.7', level: 11 },
      ],
      secondary: [
        { name: 'S.1', level: 12 },
        { name: 'S.2', level: 13 },
        { name: 'S.3', level: 14 },
        { name: 'S.4', level: 15 },
        { name: 'S.5', level: 16 },
        { name: 'S.6', level: 17 },
      ],
    };

    let classesToCreate: { name: string; level: number }[] = [];
    if (schoolType === 'nursery') classesToCreate = CLASS_MAP.nursery;
    if (schoolType === 'primary') classesToCreate = CLASS_MAP.primary;
    if (schoolType === 'secondary') classesToCreate = CLASS_MAP.secondary;
    if (schoolType === 'nursery_primary') classesToCreate = [...CLASS_MAP.nursery, ...CLASS_MAP.primary];
    if (schoolType === 'primary_secondary') classesToCreate = [...CLASS_MAP.primary, ...CLASS_MAP.secondary];
    if (schoolType === 'all') classesToCreate = [...CLASS_MAP.nursery, ...CLASS_MAP.primary, ...CLASS_MAP.secondary];

    const existingClasses = await dataService.getAll(sid, 'classes');
    const existingStudents = await dataService.getAll(sid, 'students');
    const allowedNames = new Set(classesToCreate.map(cls => cls.name.toLowerCase().trim()));

    // Delete classes that don't belong to this school type
    // Normalize names and dedupe existing classes first (keep first, delete duplicates)
    const byName = new Map<string, any[]>();
    for (const c of existingClasses) {
      const n = (c.name || '').toLowerCase().trim();
      if (!byName.has(n)) byName.set(n, []);
      byName.get(n)!.push(c);
    }
    const duplicatesToDelete: any[] = [];
    for (const [_, group] of byName.entries()) {
      if (group.length > 1) {
        // keep the first, delete the rest
        duplicatesToDelete.push(...group.slice(1));
      }
    }

    // Classes that don't belong to this school category.
    const toDelete = existingClasses.filter((c: any) => {
      const name = String(c.name || '').toLowerCase().trim();
      return !allowedNames.has(name);
    });
    const toDeleteIds = new Set(toDelete.map((c: any) => c.id));
    const affectedStudents = existingStudents.filter((student: any) => student.classId && toDeleteIds.has(student.classId));

    if (affectedStudents.length > 0) {
      if (!options.forceReplace) {
        if (!options.confirmStudentClear) {
          addToast(`${affectedStudents.length} student class assignment${affectedStudents.length !== 1 ? 's' : ''} must be cleared before changing school type`, 'warning');
          return false;
        }

        const ok = await confirm({
          title: 'Clear Student Classes?',
          description: `Changing to ${schoolType.replace(/_/g, ' ')} will remove ${toDelete.length} class${toDelete.length !== 1 ? 'es' : ''}. ${affectedStudents.length} student${affectedStudents.length !== 1 ? 's' : ''} assigned to those classes will be set to "Not assigned", and linked class summaries, invoices, subjects, exams, assignments, and timetables will be cleaned. Continue?`,
          confirmLabel: 'Clear and Continue',
          variant: 'warning',
        });
        if (!ok) return false;
      }
    }

    // Delete duplicates first, then classes not in the selected category.
    const classIdsToDelete = Array.from(new Set([...duplicatesToDelete, ...toDelete].map((cls: any) => cls.id).filter(Boolean)));
    if (classIdsToDelete.length > 0) {
      const cleanup = await cleanupDeletedClassReferences(sid, classIdsToDelete);
      await deleteInThirtyPercentBatches(sid, 'classes', classIdsToDelete);
      addToast(`${classIdsToDelete.length} class${classIdsToDelete.length > 1 ? 'es' : ''} removed. ${cleanup.recordsDeleted} linked records cleaned and ${cleanup.studentsUnassigned} students set to No class.`, 'info');
    }

    const deletedIdSet = new Set(classIdsToDelete);
    const remainingClasses = existingClasses.filter((classItem: any) => !deletedIdSet.has(classItem.id));
    const existingNames = new Set(remainingClasses.map((c: any) => String(c.name || '').toLowerCase().trim()));
    const classesToAdd = classesToCreate.filter(cls => !existingNames.has(cls.name.toLowerCase().trim()));
    await runTasksInThirtyPercentBatches(
      classesToAdd.map(cls => () => dataService.create(sid, 'classes', { name: cls.name, level: cls.level, capacity: 40 } as any))
    );
    const createdCount = classesToAdd.length;

    if (createdCount > 0) addToast(`${createdCount} classes auto-created`, 'info');
    else if (toDelete.length === 0 && schoolTypeOverride) addToast('All classes for this school category already exist', 'info');
    if (affectedStudents.length > 0) window.dispatchEvent(new CustomEvent('studentsUpdated'));
    return true;
  }

  async function handleSchoolTypeChange(value: string) {
    const sid = schoolId || user?.id;
    if (value === settings.schoolType) return;
    const okToChange = await confirm({
      title: 'Change School Type?',
      description: `Changing to ${value.replace(/_/g, ' ')} will generate that section's class list and remove classes outside that type. Continue?`,
      confirmLabel: 'Change Type',
      variant: 'warning',
    });
    if (!okToChange) return;
    const newSettings = { ...settings, schoolType: normalizeSchoolType(value) };
    if (sid) {
      const ok = await autoCreateClasses(sid, value, { confirmStudentClear: true, forceReplace: false });
      if (!ok) return;
    }
    setSettings(newSettings);
    applySettingsLocally(newSettings);
    window.dispatchEvent(new CustomEvent('classesUpdated'));
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => void autoSave(newSettings), 1000);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    if (name === 'schoolType') {
      void handleSchoolTypeChange(value);
      return;
    }

    const newSettings = { ...settings, [name]: value };
    setSettings(newSettings);
    applySettingsLocally(newSettings);

    if (name === 'currency') {
      setCurrency(value as any);
    }

    // Debounced auto-save — fires 1s after last keystroke
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => void autoSave(newSettings), 1000);
  }

  async function handlePromoteStudents() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (isPromoting) return;
    setIsPromoting(true);
    setPromoteProgress(0);
    setPromoteStatus('Preparing students...');
    try {
      // Promotion keeps each student's existing record ID intact. It only moves
      // active students to their next class or marks final-class students done.
      // Fees, invoices, bursaries, and discounts are term records and are not
      // copied into the new term; admins assign those again after promotion.
      const allClasses = await dataService.getAll(id, 'classes');
      const sorted = [...allClasses].sort((a: any, b: any) => (a.level ?? 0) - (b.level ?? 0));

      // Build next-class map: classId → nextClassId
      const nextClassMap: Record<string, string> = {};
      for (let i = 0; i < sorted.length - 1; i++) {
        nextClassMap[(sorted[i] as any).id] = (sorted[i + 1] as any).id;
      }
      // Students in the last class get marked completed
      const lastClassId = sorted.length > 0 ? (sorted[sorted.length - 1] as any).id : null;

      // Load all active students
      const allStudents = await dataService.getAll(id, 'students');
      const active = allStudents.filter((s: any) => s.status === 'active');

      let promoted = 0;
      let graduated = 0;
      const now = new Date().toISOString();

      const updates = active
        .map((student: any) => {
          const currentClassId = student.classId;
          if (currentClassId === lastClassId) {
            graduated++;
            return {
              id: student.id,
              updates: {
                status: 'completed',
                completedYear: parseInt(promoteNewYear),
                completedTerm: settings.currentTerm,
                updatedAt: now,
              },
            };
          }
          if (nextClassMap[currentClassId]) {
            promoted++;
            return {
              id: student.id,
              updates: {
                classId: nextClassMap[currentClassId],
                updatedAt: now,
              },
            };
          }
          return null;
        })
        .filter(Boolean) as Array<{ id: string; updates: Record<string, any> }>;

      await processInThirtyPercentBatches(updates, async (batch, startIndex) => {
        const done = Math.min(startIndex + batch.length, updates.length);
        setPromoteStatus(`Updating ${done} of ${updates.length} students...`);
        const results = await Promise.allSettled(
          batch.map(item => dataService.update(id, 'students', item.id, item.updates as any))
        );
        const failed = results.filter(result => result.status === 'rejected');
        if (failed.length > 0) throw new Error(`${failed.length} student updates failed`);
      }, progress => setPromoteProgress(Math.round(progress * 0.9)));

      setPromoteStatus('Saving term settings...');
      await dataService.saveSettings(id, {
        ...settings,
        currentTerm: promoteNewTerm,
        academicYear: promoteNewYear,
      });
      setPromoteProgress(100);
      setSettings(prev => ({ ...prev, currentTerm: promoteNewTerm, academicYear: promoteNewYear }));

      window.dispatchEvent(new CustomEvent('studentsUpdated'));
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'students' } }));
      setShowPromoteModal(false);
      addToast(`Term started: ${promoted} students promoted, ${graduated} graduated. New term fees and bursaries are unassigned.`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Promotion failed', 'error');
    } finally {
      setIsPromoting(false);
      setPromoteStatus('');
    }
  }

  // --- Admin utilities: sign out all users ---
  const showAdminUtilities = !!user?.id;


  async function handleDeleteAllData() {
    const id = schoolId || user?.id;
    if (!id) return;
    if (!deletePassword) {
      setDeleteError('Please enter your password');
      return;
    }

    setIsDeleting(true);
    setDeleteError('');

    try {
      let passwordValid = false;

      if (isSupabaseConfigured && supabase && user?.email) {
        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password: deletePassword
        });
        passwordValid = !error;
      } else {
        passwordValid = deletePassword.length >= 1;
      }

      if (!passwordValid) {
        setDeleteError('Incorrect password');
        setIsDeleting(false);
        return;
      }

      const tables = [
        'students', 'staff', 'classes', 'subjects', 'fees', 'payments',
        'announcements', 'attendance', 'feeStructures',
        'exams', 'examResults', 'transportRoutes', 'transportAssignments', 'salaryPayments',
        'pointTransactions', 'bursaries', 'discounts', 'notifications', 'invoices', 'settings', 'timetable',
        'inventory', 'expenses', 'auditLogs', 'libraryBooks', 'libraryIssues', 'homework', 'behaviorLogs', 'parentMessages', 'studentAttendance',
        'staffAttendance', 'examTimetable', 'lessonPlans', 'studentResources', 'hostelRooms', 'hostelAssignments', 'events', 'visitorLogs', 'certificates',
        'schools', 'subscriptions', 'users', 'plans', 'syncQueue', 'syncMeta'
      ];
      let failedTables = 0;

      for (const table of tables) {
        try {
          const result = await dataService.clear(id, table);
          if (result && !result.success) failedTables += 1;
        } catch (error) {
          console.warn(`Failed to clear ${table}:`, error);
          // Table might not exist
          failedTables += 1;
        }
      }

      if (failedTables > 0) {
        throw new Error(`${failedTables} table${failedTables === 1 ? '' : 's'} could not be cleared`);
      }
      
      setShowDeleteConfirm(false);
      setDeletePassword('');
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { localOnly: true } }));
      addToast('All data deleted successfully', 'success');
      
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error('Failed to delete all data:', error);
      addToast('Failed to delete data', 'error');
      setIsDeleting(false);
    }
  }

  async function handleSignOutAll() {
    try {
      window.dispatchEvent(new CustomEvent('forceSignOutAllUsers'));
      addToast('All users signed out', 'info');
    } catch {}
  }

  async function cleanAllDuplicates() {
    const sid = schoolId || user?.id;
    if (!sid) return;
    
    const tables = ['students', 'staff', 'classes', 'subjects', 'announcements', 'transportRoutes'];
    let totalRemoved = 0;
    let tablesProcessed = 0;
    
    for (const table of tables) {
      try {
        const records = await dataService.getAll(sid, table);
        const seen = new Map<string, any>();
        const toRemove: string[] = [];
        
        for (const record of records) {
          let key = '';
          if (table === 'students' || table === 'staff') {
            key = `${record.firstName?.toLowerCase()}-${record.lastName?.toLowerCase()}-${record.classId || ''}`;
          } else {
            key = `${record.name?.toLowerCase()}-${record.classId || ''}`;
          }
          
          if (seen.has(key)) {
            toRemove.push(record.id);
          } else {
            seen.set(key, record);
          }
        }
        
        if (toRemove.length > 0) {
          await deleteInThirtyPercentBatches(sid, table, toRemove);
        }
        
        if (toRemove.length > 0) {
          totalRemoved += toRemove.length;
          tablesProcessed++;
        }
      } catch (err) {
        console.error(`Error cleaning duplicates in ${table}:`, err);
      }
    }
    
    if (totalRemoved > 0) {
      addToast(`Removed ${totalRemoved} duplicate(s) from ${tablesProcessed} table(s)`, 'success');
      window.dispatchEvent(new CustomEvent('dataRefresh'));
    } else {
      addToast('No duplicates found', 'info');
    }
  }

  async function handleSchoolLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const sid = schoolId || user?.id;
    if (!sid) return;
    try {
      const logo = await compressImageFile(file, 512, 0.82);
      const newSettings = { ...settings, schoolLogo: logo };
      setSettings(newSettings);
      localStorage.setItem(`schofy_settings_${sid}`, JSON.stringify(newSettings));
      await dataService.saveSettings(sid, { schoolLogo: logo });
      window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: newSettings }));
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
      addToast('School logo updated', 'success');
    } catch (error: any) {
      addToast(error?.message || 'Failed to upload logo', 'error');
    } finally {
      if (event.target) event.target.value = '';
    }
  }

  async function removeSchoolLogo() {
    const sid = schoolId || user?.id;
    if (!sid) return;
    const newSettings = { ...settings, schoolLogo: '' };
    setSettings(newSettings);
    localStorage.setItem(`schofy_settings_${sid}`, JSON.stringify(newSettings));
    await dataService.saveSettings(sid, { schoolLogo: '' });
    window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: newSettings }));
    window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
    addToast('School logo removed', 'success');
  }

  async function startCloudBackup() {
    const account = backupAccount.trim();
    if (!account) {
      addToast('Enter the Gmail or cloud account to use for backup', 'warning');
      return;
    }
    setIsCloudBackingUp(true);
    try {
      localStorage.setItem('schofy_last_cloud_backup_account', account);
      await exportBackup();
      window.open(`https://drive.google.com/drive/my-drive?schofyBackupAccount=${encodeURIComponent(account)}`, '_blank', 'noopener,noreferrer');
      addToast('Backup exported. Google Drive opened. Upload the downloaded backup file there.', 'success');
      setShowCloudBackupModal(false);
    } catch (error: any) {
      addToast(error?.message || 'Cloud backup could not start', 'error');
    } finally {
      setIsCloudBackingUp(false);
    }
  }

  async function handleBackupFileSelected(file: File | undefined) {
    if (!file) return;
    setBackupProgress({
      open: true,
      title: 'Reading backup',
      detail: 'Preparing preview and checking duplicates.',
      progress: 12,
      processed: 0,
      total: 0,
    });
    try {
      const preview = await previewBackupImport(file);
      if (!preview) return;
      setBackupProgress({
        open: true,
        title: 'Reading backup',
        detail: 'Preview ready.',
        progress: 100,
        processed: preview.totalRecords,
        total: preview.totalRecords,
      });
      setBackupPreview(preview);
      setIgnoredBackupTables(new Set(preview.ignoredTables));
      setSkipBackupDuplicates(true);
      window.setTimeout(() => setBackupProgress(prev => prev.title === 'Reading backup' ? { ...prev, open: false } : prev), 500);
    } finally {
      window.setTimeout(() => setBackupProgress(prev => prev.title === 'Reading backup' ? { ...prev, open: false } : prev), 900);
    }
  }

  function toggleIgnoredBackupTable(table: string) {
    setIgnoredBackupTables(prev => {
      const next = new Set(prev);
      next.has(table) ? next.delete(table) : next.add(table);
      return next;
    });
  }

  async function executePreviewedBackupImport() {
    if (!backupPreview) return;
    const selected = backupPreview.tables.filter(table => !ignoredBackupTables.has(table.table));
    if (selected.length === 0) {
      addToast('Select at least one backup page to import', 'warning');
      return;
    }
    if (backupPreview.planCheck && !backupPreview.planCheck.ok && selected.some(table => table.table === 'students' || table.table === 'staff')) {
      addToast(backupPreview.planCheck.message, 'error');
      return;
    }
    const ok = await executeBackupImport(backupPreview, {
      ignoredTables: Array.from(ignoredBackupTables),
      skipDuplicates: skipBackupDuplicates,
      onProgress: setBackupProgress,
    });
    if (ok) {
      setBackupPreview(null);
      setIgnoredBackupTables(new Set());
      window.setTimeout(() => setBackupProgress(prev => ({ ...prev, open: false })), 700);
    }
  }

  async function handleTestSchoolDatabase() {
    setTestingSchoolDb(true);
    setSchoolDbMessage('');
    try {
      const result = await testSchoolDatabaseConnection(schoolDbConfig);
      setSchoolDbMessage(result.message);
      addToast(result.message, result.success ? 'success' : 'warning');
    } catch (error: any) {
      const message = error?.message || 'Database connection test failed';
      setSchoolDbMessage(message);
      addToast(message, 'error');
    } finally {
      setTestingSchoolDb(false);
    }
  }

  async function handleSaveSchoolDatabase() {
    setSchoolDbConfirmAction('save');
    setSchoolDbAdminPassword('');
    setSchoolDbPasswordError('');
    setShowSchoolDbConfirm(true);
  }

  async function verifyAdminPassword(password: string) {
    if (!password || !user?.email) return false;
    if (isSupabaseConfigured && supabase && isOnline) {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      });
      return !error;
    }
    const local = await loginLocal(user.email.toLowerCase().trim(), password, { syncToCloud: false });
    return !!local.success;
  }

  async function completeSchoolDatabaseAction() {
    const sid = schoolId || user?.schoolId || user?.id;
    if (!sid) {
      addToast('Login before saving database settings', 'error');
      return;
    }
    if (!schoolDbAdminPassword) {
      setSchoolDbPasswordError('Enter the admin password.');
      return;
    }
    setSavingSchoolDb(true);
    setSchoolDbPasswordError('');
    setSchoolDbMessage('');
    try {
      const passwordOk = await verifyAdminPassword(schoolDbAdminPassword);
      if (!passwordOk) {
        setSchoolDbPasswordError('Incorrect admin password.');
        return;
      }
      if (schoolDbConfirmAction === 'clear') {
        clearSchoolDatabaseConfig(sid);
        setSchoolDbConfig({ provider: 'database', enabled: false, url: '', anonKey: '', shareToDevices: false });
        setSchoolDbMessage('Removed. Cloud database writes are paused until a school database is connected.');
        setShowSchoolDbConfirm(false);
        addToast('School database removed', 'info');
        return;
      }
      const result = await testSchoolDatabaseConnection(schoolDbConfig);
      if (!result.success) {
        setSchoolDbMessage(result.message);
        addToast(result.message, 'warning');
        return;
      }
      const nextConfig: SchoolDatabaseConfig = {
        ...schoolDbConfig,
        enabled: true,
        lastCheckedAt: new Date().toISOString(),
      };
      if (nextConfig.shareToDevices) {
        if (!supabase || !isOnline) {
          setSchoolDbMessage('Connection is valid, but sharing to other devices needs internet.');
          addToast('Connect to internet to share this database to other devices', 'warning');
          return;
        }
        const shared = toSharedSchoolDatabaseConfig(nextConfig);
        const { error } = await supabase.from('settings').upsert(
          { school_id: sid, key: 'schoolDatabaseConnection', value: shared, updated_at: new Date().toISOString() },
          { onConflict: 'school_id,key' }
        );
        if (error) {
          setSchoolDbMessage(error.message || 'Could not share this connection to other devices.');
          addToast('Could not share database connection', 'error');
          return;
        }
      }
      saveSchoolDatabaseConfig(sid, nextConfig);
      setSchoolDbConfig(prev => ({ ...prev, enabled: true, lastCheckedAt: nextConfig.lastCheckedAt }));
      setSchoolDbMessage(nextConfig.shareToDevices ? 'Saved and shared. Other signed-in devices can load this database connection.' : 'Saved. School data sync will use this database.');
      setShowSchoolDbConfirm(false);
      addToast('School database saved', 'success');
    } catch (error: any) {
      const message = error?.message || 'Could not save database settings';
      setSchoolDbMessage(message);
      addToast(message, 'error');
    } finally {
      setSavingSchoolDb(false);
    }
  }

  async function handleClearSchoolDatabase() {
    const ok = await confirm({
      title: 'Remove school database?',
      description: 'This removes the school-owned database connection from this device. Local data remains saved and cloud writes pause until another database is connected.',
      confirmLabel: 'Continue',
      cancelLabel: 'Cancel',
      variant: 'warning',
    });
    if (!ok) return;
    setSchoolDbConfirmAction('clear');
    setSchoolDbAdminPassword('');
    setSchoolDbPasswordError('');
    setShowSchoolDbConfirm(true);
  }

  const colorOptions = [
    { color: '#0082FC', name: 'Blue' },
    { color: '#4F46E5', name: 'Indigo' },
    { color: '#2da32d', name: 'Green' },
    { color: '#ed1e1e', name: 'Red' },
    { color: '#f68818', name: 'Orange' },
    { color: '#06b6d4', name: 'Cyan' },
    { color: '#6F2DA8', name: 'Purple' },
    { color: '#8b5cf6', name: 'Violet' },
    { color: '#14b8a6', name: 'Teal' },
    { color: '#db2777', name: 'Rose' },
    { color: '#64748b', name: 'Slate' },
    { color: '#0f766e', name: 'Deep Teal' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-slate-500">Configure your school system</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300 sm:inline-flex">
            {releaseDownloadLabel}
          </span>
          {autoSaved && <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle size={14} /> Auto-saved</span>}
          {isSaving && <span className="text-sm text-slate-400 flex items-center gap-1"><div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Saving...</span>}
          <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:inline-flex">Changes apply automatically</span>
          <button type="button" onClick={handleSave} disabled={isSaving} className="btn btn-primary shadow-lg shadow-primary-500/20 disabled:opacity-70">
            <Save size={16} />
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <form onSubmit={(event) => event.preventDefault()} className="space-y-6">
        <div className="card border-primary-100 bg-gradient-to-br from-white to-primary-50/40 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900">
          <div className="card-body flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <Info size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">App Release</h2>
                <p className="mt-1 text-sm font-semibold text-slate-700 dark:text-slate-200">{releaseDownloadLabel}</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {releaseUpdateNote}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white px-3 py-1 text-primary-700 ring-1 ring-primary-100 dark:bg-slate-800 dark:text-primary-200 dark:ring-slate-700">{APP_VERSION_LABEL}</span>
              <span className="rounded-full bg-white px-3 py-1 text-emerald-700 ring-1 ring-emerald-100 dark:bg-slate-800 dark:text-emerald-200 dark:ring-slate-700">{releaseTypeLabel}</span>
              <span className="rounded-full bg-white px-3 py-1 text-violet-700 ring-1 ring-violet-100 dark:bg-slate-800 dark:text-violet-200 dark:ring-slate-700">{releaseChannelLabel}</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Building size={20} />
            <h2 className="font-semibold">School Profile</h2>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">School Name <span className="text-red-500">*</span></label>
              <input name="schoolName" value={settings.schoolName} onChange={handleChange} className="form-input" required placeholder="Enter school name" />
            </div>
            <div>
              <label className="form-label">Phone Number</label>
              <input name="schoolPhone" value={settings.schoolPhone} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">School Type</label>
              <PortalSelect
                value={settings.schoolType}
                onChange={value => void handleSchoolTypeChange(value)}
                options={[
                  { value: 'nursery', label: 'Nursery' },
                  { value: 'primary', label: 'Primary' },
                  { value: 'secondary', label: 'Secondary' },
                  { value: 'nursery_primary', label: 'Nursery & Primary' },
                  { value: 'primary_secondary', label: 'Primary & Secondary' },
                  { value: 'all', label: 'All Sections' },
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">Changing type generates the matching academic class list.</p>
            </div>
            <div>
              <label className="form-label">School Category <span className="text-slate-400 font-normal">(optional)</span></label>
              <PortalSelect
                value={settings.schoolCategory}
                onChange={value => handleChange({ target: { name: 'schoolCategory', value } } as ChangeEvent<HTMLSelectElement>)}
                options={[
                  { value: '', label: 'None' },
                  { value: 'music_school', label: 'Music School' },
                  { value: 'tailoring', label: 'Tailoring' },
                ]}
              />
              <p className="mt-1 text-xs text-slate-500">Optional category does not replace the academic school type.</p>
            </div>
            <div className="md:col-span-2">
              <label className="form-label">School Logo</label>
              <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60 sm:flex-row sm:items-center">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                  {settings.schoolLogo ? (
                    <img src={settings.schoolLogo} alt="School logo" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <Building size={30} className="text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-white">Logo used across the app</p>
                  <p className="mt-1 text-xs text-slate-500">Appears in the sidebar, invoices, reports, ledgers, report cards, and print previews.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => schoolLogoInputRef.current?.click()} className="btn btn-secondary">
                      <Upload size={15} /> Upload Logo
                    </button>
                    {settings.schoolLogo && (
                      <button type="button" onClick={() => void removeSchoolLogo()} className="btn btn-secondary text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 size={15} /> Remove
                      </button>
                    )}
                  </div>
                </div>
                <input ref={schoolLogoInputRef} type="file" accept="image/*" onChange={handleSchoolLogoUpload} className="hidden" />
              </div>
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Address</label>
              <textarea name="schoolAddress" value={settings.schoolAddress} onChange={handleChange} className="form-input" rows={2} />
            </div>
            {settings.schoolCategory === 'music_school' && (
              <div className="md:col-span-2">
                <label className="form-label">Instruments to Teach</label>
                <input
                  name="musicInstruments"
                  value={settings.musicInstruments}
                  onChange={handleChange}
                  className="form-input"
                  placeholder="Piano, Guitar, Drums, Violin, Voice"
                />
                <p className="mt-1 text-xs text-slate-500">Separate instruments with commas.</p>
              </div>
            )}
            <div>
              <label className="form-label">Email</label>
              <input type="email" name="schoolEmail" value={settings.schoolEmail} onChange={handleChange} className="form-input" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Calendar size={20} />
            <h2 className="font-semibold">Academic Settings</h2>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">Current Academic Year</label>
              <input name="academicYear" value={settings.academicYear} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Current Term</label>
              <PortalSelect
                value={settings.currentTerm}
                onChange={value => handleChange({ target: { name: 'currentTerm', value } } as ChangeEvent<HTMLSelectElement>)}
                options={[
                  { value: '1', label: 'Term 1' },
                  { value: '2', label: 'Term 2' },
                  { value: '3', label: 'Term 3' },
                ]}
              />
            </div>
            <div>
              <label className="form-label">Term 1 Start</label>
              <input type="date" name="term1Start" value={settings.term1Start} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Term 1 End</label>
              <input type="date" name="term1End" value={settings.term1End} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Term 2 Start</label>
              <input type="date" name="term2Start" value={settings.term2Start} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Term 2 End</label>
              <input type="date" name="term2End" value={settings.term2End} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Term 3 Start</label>
              <input type="date" name="term3Start" value={settings.term3Start} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Term 3 End</label>
              <input type="date" name="term3End" value={settings.term3End} onChange={handleChange} className="form-input" />
            </div>
          </div>
        </div>

        {/* Start New Term */}
        <div className="card border-amber-200 dark:border-amber-700">
          <div className="card-header flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20">
            <GraduationCap size={20} className="text-amber-600" />
            <h2 className="font-semibold text-amber-800 dark:text-amber-300">Start New Term</h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              When a term ends, promote all active students to their next class. Students in the final class will be graduated (marked completed).
            </p>
            <button
              type="button"
              onClick={() => {
                const next = String((parseInt(settings.currentTerm) % 3) + 1);
                const nextYear = next === '1' ? String(parseInt(settings.academicYear) + 1) : settings.academicYear;
                setPromoteNewTerm(next);
                setPromoteNewYear(nextYear);
                setShowPromoteModal(true);
              }}
              className="btn btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500"
            >
              <ArrowRight size={16} />
              Start New Term &amp; Promote Students
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <DollarSign size={20} />
            <h2 className="font-semibold">Fee Settings</h2>
          </div>
          <div className="card-body grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <label className="form-label">Currency</label>
              <PortalSelect
                value={settings.currency}
                onChange={value => handleChange({ target: { name: 'currency', value } } as ChangeEvent<HTMLSelectElement>)}
                options={currencies.map(c => ({ value: c.code, label: `${c.symbol} ${c.code} - ${c.name}` }))}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Palette size={20} />
            <h2 className="font-semibold">Theme & Appearance</h2>
          </div>
          <div className="card-body">
            <label className="form-label">Primary Color</label>
            <div className="flex flex-wrap gap-3 mt-2">
              {colorOptions.map(({ color, name }) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setPrimaryColor(color)}
                  className={`w-12 h-12 rounded-xl transition-all flex items-center justify-center shadow-md ${
                    primaryColor === color 
                      ? 'ring-4 ring-offset-2 ring-slate-400 scale-110' 
                      : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: color }}
                  title={name}
                >
                  {primaryColor === color && (
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
            <p className="text-sm text-slate-500 mt-4">Current: {colorOptions.find(c => c.color === primaryColor)?.name || 'Custom'}</p>
            
            <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color-soft)' }}>
              <p className="text-sm font-medium mb-3" style={{ color: primaryColor }}>Preview</p>
              <div className="flex gap-3">
                <button className="px-4 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: primaryColor }}>
                  Primary Button
                </button>
                <button className="px-4 py-2 rounded-lg border-2 font-medium" style={{ borderColor: primaryColor, color: primaryColor }}>
                  Secondary
                </button>
                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: 'var(--primary-color-muted)', color: primaryColor }}>
                  Badge
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Keyboard size={20} />
            <h2 className="font-semibold">Keyboard Shortcuts</h2>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Collapse sidebar</span>
                <kbd className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">Ctrl + Left</kbd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Expand sidebar</span>
                <kbd className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">Ctrl + Right</kbd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Open App Status</span>
                <kbd className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">Ctrl + S</kbd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Save active popup or form</span>
                <kbd className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">Enter</kbd>
              </div>
              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Find page from focused sidebar</span>
                <kbd className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200">Letter, Enter</kbd>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Cloud size={20} />
            <h2 className="font-semibold">Cloud Space Sync</h2>
          </div>
          <div className="card-body space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span className="text-sm font-medium">
                  {isOnline ? 'Online' : 'Offline'}
                </span>
              </div>
              <div className="flex items-center gap-2">
              {isSyncEnabled ? (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Sync Enabled
                  </span>
                ) : (
                  <span className="px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    Sync Disabled
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <RefreshCw size={16} className={isSyncing ? 'animate-spin text-amber-500' : 'text-slate-400'} />
                  <span className="text-sm font-medium">Sync Status</span>
                </div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">
                  {isSyncing ? 'Syncing...' : isSyncEnabled ? 'Automatic' : 'Paused'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-slate-400" />
                  <span className="text-sm font-medium">Last cloud merge</span>
                </div>
                <p className="text-lg font-bold text-slate-800 dark:text-white">
                  {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <Database size={16} className="text-slate-400" />
                  <span className="text-sm font-medium">Pending upload</span>
                </div>
                <p className="text-2xl font-bold text-slate-800 dark:text-white">{pendingChanges}</p>
              </div>
            </div>

            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Schofy saves every change to this device first. When cloud sync is enabled, desktop changes upload during your signed-in
              session and realtime updates are pulled only while the app is open.
            </p>

            {desktopApp && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Desktop storage mode</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                      {isSyncEnabled
                        ? 'Local plus cloud sync. Data stays on this computer and uploads while this session is online.'
                        : 'Local-only. Data stays on this computer and cloud calls are paused.'}
                    </p>
                  </div>
                  {isSyncEnabled ? (
                    <button type="button" onClick={disableSync} className="btn btn-secondary flex items-center gap-2 text-sm">
                      <CloudOff size={16} />
                      Use local only
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await enableSync();
                        } catch (err) {
                          console.error('Enable sync error:', err);
                          addToast('Failed to enable sync. Check console for details.', 'error');
                        }
                      }}
                      className="btn btn-primary flex items-center gap-2"
                    >
                      <Cloud size={16} />
                      Sync with Cloud
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="rounded-xl p-4 theme-note">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Database size={18} className="text-primary-600" />
                    School-owned database
                  </h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">
                    Connect this school to its own database for school records and sync. Main login and plan checks stay on Schofy.
                  </p>
                </div>
                <span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${
                  schoolDbConfig.enabled
                    ? 'text-white'
                    : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                }`}
                  style={schoolDbConfig.enabled ? { backgroundColor: 'var(--primary-color)' } : undefined}
                >
                  {schoolDbConfig.enabled ? 'Using own database' : 'No school database connected'}
                </span>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr]">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Database URL</label>
                  <input
                    type="url"
                    className="form-input"
                    placeholder="https://database.yourschool.com"
                    value={schoolDbConfig.url}
                    onChange={(event) => setSchoolDbConfig(prev => ({ ...prev, url: event.target.value, enabled: false }))}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Public access key</label>
                  <input
                    type="password"
                    className="form-input"
                    placeholder="Paste limited public access key only"
                    value={schoolDbConfig.anonKey}
                    onChange={(event) => setSchoolDbConfig(prev => ({ ...prev, anonKey: event.target.value, enabled: false }))}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </div>

              <label
                className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-white/80 p-3 text-sm text-slate-700 shadow-sm transition dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-200"
                style={{ borderColor: schoolDbConfig.shareToDevices ? 'var(--primary-color)' : undefined }}
              >
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  checked={!!schoolDbConfig.shareToDevices}
                  onChange={(event) => setSchoolDbConfig(prev => ({ ...prev, shareToDevices: event.target.checked, enabled: false }))}
                />
                <span>
                  <span className="block font-semibold">Share this database connection to all devices</span>
                  <span className="mt-0.5 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                    Other devices signed into this school can load the same connection automatically from Settings.
                  </span>
                </span>
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary flex items-center gap-2"
                  onClick={handleTestSchoolDatabase}
                  disabled={testingSchoolDb || savingSchoolDb}
                >
                  <RefreshCw size={16} className={testingSchoolDb ? 'animate-spin' : ''} />
                  {testingSchoolDb ? 'Testing...' : 'Test connection'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary flex items-center gap-2"
                  onClick={handleSaveSchoolDatabase}
                  disabled={testingSchoolDb || savingSchoolDb}
                >
                  <Save size={16} />
                  {savingSchoolDb ? 'Saving...' : 'Save and use'}
                </button>
                {schoolDbConfig.enabled && (
                  <button
                    type="button"
                    className="btn btn-secondary flex items-center gap-2"
                    onClick={handleClearSchoolDatabase}
                  >
                    <CloudOff size={16} />
                    Remove connection
                  </button>
                )}
              </div>

              <div className="mt-3 rounded-lg bg-white/80 px-3 py-2 text-xs leading-5 text-slate-600 shadow-sm dark:bg-slate-900/40 dark:text-slate-300">
                <strong>Security:</strong> use a limited public key only. Never paste an admin or service key. Sharing to all devices stores this connection for the school so other signed-in devices can use it.
                {schoolDbMessage && <p className="mt-1 font-medium text-slate-800 dark:text-slate-100">{schoolDbMessage}</p>}
              </div>
            </div>

            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="button"
                onClick={async () => {
                  if (!isSyncEnabled) { addToast('Enable cloud sync first', 'warning'); return; }
                  const sid = schoolId || user?.id;
                  if (!sid) { addToast('Not logged in', 'error'); return; }
                  addToast('Pulling all data from cloud...', 'info');
                  try {
                    const result = await dataService.forcePull(sid);
                    if (result.success) {
                      addToast(`Pulled ${result.pulled} records from cloud`, 'success');
                      window.dispatchEvent(new CustomEvent('dataRefresh'));
                    } else {
                      addToast(result.error || 'Pull failed - check your connection', 'error');
                    }
                  } catch (err: any) {
                    addToast(err?.message || 'Pull failed', 'error');
                  }
                }}
                disabled={!isSyncEnabled}
                className="btn btn-secondary flex items-center gap-2 text-sm disabled:opacity-60"
              >
                <Download size={16} />
                Pull from Cloud
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!isSyncEnabled) { addToast('Enable cloud sync first', 'warning'); return; }
                  const sid = schoolId || user?.id;
                  if (!sid) { addToast('Not logged in', 'error'); return; }
                  addToast('Pushing local data to cloud...', 'info');
                  try {
                    const result = await dataService.forcePush(sid);
                    if (result.success) {
                      addToast(`Pushed ${result.pushed} records to cloud`, 'success');
                    } else {
                      addToast(result.error || 'Push failed - check your connection', 'error');
                    }
                  } catch (err: any) {
                    addToast(err?.message || 'Push failed', 'error');
                  }
                }}
                disabled={!isSyncEnabled}
                className="btn btn-secondary flex items-center gap-2 text-sm disabled:opacity-60"
              >
                <Upload size={16} />
                Push to Cloud
              </button>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
              <h3 className="font-semibold mb-4 flex items-center gap-2">
                <Database size={18} />
                Backup & Restore
              </h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={exportBackup}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Download size={16} />
                  Export Data & Images
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBackupAccount(localStorage.getItem('schofy_last_cloud_backup_account') || user?.email || '');
                    setShowCloudBackupModal(true);
                  }}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Cloud size={16} />
                  Cloud Backup
                </button>
                <label className="btn btn-secondary flex items-center gap-2 cursor-pointer">
                  <Upload size={16} />
                  Import Backup
                  <input
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      await handleBackupFileSelected(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                <button
                  onClick={cleanAllDuplicates}
                  className="btn btn-secondary flex items-center gap-2"
                >
                  <Users size={16} />
                  Clean Duplicates
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Export your data and embedded images as JSON for backup. Cloud Backup exports the same file, asks for the Gmail account, then opens Google Drive so you can upload the backup directly.
              </p>
            </div>

            {isSupabaseConfigured ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Cloud Sync Status</h4>
                <div className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
                  <p><strong>Connection:</strong> {isOnline ? 'Online' : 'Offline'}</p>
                  <p><strong>Background sync:</strong> {isSyncEnabled ? 'On during this session' : desktopApp ? 'Local-only mode' : 'Paused'}</p>
                  <p className="text-xs mt-2 opacity-90">
                    Data is saved locally first, then merged with cloud space when sync is enabled.
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  Cloud sync is not configured. Contact your administrator.
                </p>
              </div>
            )}
          </div>
        </div>

        {showAdminUtilities && (
          <div className="card border-slate-200 dark:border-slate-700">
            <div className="card-header flex items-center gap-2">
              <Users size={20} />
              <h2 className="font-semibold">Admin Utilities</h2>
            </div>
            <div className="card-body space-y-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">Administrative tools for account sessions.</p>
              <button onClick={handleSignOutAll} className="btn btn-secondary">Sign out all users</button>
            </div>
          </div>
        )}

        <div className="card border-slate-200 dark:border-slate-700">
          <div className="card-header flex items-center gap-2">
            <Info size={20} />
            <h2 className="font-semibold">App Information</h2>
          </div>
          <div className="card-body">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Review Schofy information, privacy, terms, and support guidance.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'About App', path: '/about', icon: Info },
                { label: 'Privacy Policy', path: '/about#privacy', icon: Shield },
                { label: 'Terms of Use', path: '/about#terms', icon: ScrollText },
                { label: 'Help & Support', path: '/about#support', icon: HelpCircle },
              ].map(({ label, path, icon: Icon }) => (
                <Link
                  key={path}
                  to={path}
                  className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-200 dark:hover:border-emerald-800 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-300"
                >
                  <Icon size={18} className="shrink-0" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="card border-red-200 dark:border-red-800">
          <div className="card-header flex items-center gap-2 text-red-600 dark:text-red-400">
            <Trash2 size={20} />
            <h2 className="font-semibold">Danger Zone</h2>
          </div>
          <div className="card-body">
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
              This will permanently delete all your local data. This action cannot be undone.
            </p>
            
            {showDeleteConfirm ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={20} className="text-red-500" />
                  <p className="font-medium text-red-700 dark:text-red-300">This will delete ALL your data!</p>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                  Enter your <strong>password</strong> to confirm:
                </p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => {
                    setDeletePassword(e.target.value);
                    setDeleteError('');
                  }}
                  className="form-input mb-3"
                  placeholder="Enter your password"
                  autoFocus
                />
                {deleteError && (
                  <p className="text-red-500 text-sm mb-3">{deleteError}</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleDeleteAllData}
                    disabled={!deletePassword || isDeleting}
                    className="btn bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDeleting ? 'Deleting...' : 'Delete All Data'}
                  </button>
                  <button
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeletePassword('');
                      setDeleteError('');
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="btn bg-red-600 hover:bg-red-700 text-white"
              >
                <Trash2 size={16} />
                Delete All Data
              </button>
            )}
          </div>
        </div>
      </form>

      {backupPreview && createPortal((
        <div className="fixed inset-0 z-[9999] bg-white dark:bg-slate-950 animate-fade-in">
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="min-w-0">
                <h2 className="text-lg font-black text-slate-900 dark:text-white">Backup Import Preview</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {backupPreview.fileName} {backupPreview.exportedAt ? `- exported ${new Date(backupPreview.exportedAt).toLocaleString()}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setBackupPreview(null)}
                className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-200 hover:text-slate-800 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid flex-1 overflow-hidden lg:grid-cols-[320px,1fr]">
              <aside className="border-b border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:border-b-0 lg:border-r">
                <div className="grid grid-cols-2 gap-3">
                  <div className="highlight-label-indigo rounded-lg p-3">
                    <p className="text-xs font-bold opacity-80">Records</p>
                    <p className="text-2xl font-black">{backupPreview.totalRecords.toLocaleString()}</p>
                  </div>
                  <div className="highlight-label-emerald rounded-lg p-3">
                    <p className="text-xs font-bold opacity-80">New</p>
                    <p className="text-2xl font-black">{backupPreview.totalNewRecords.toLocaleString()}</p>
                  </div>
                  <div className="highlight-label-amber rounded-lg p-3">
                    <p className="text-xs font-bold opacity-80">Duplicates</p>
                    <p className="text-2xl font-black">{backupPreview.totalDuplicates.toLocaleString()}</p>
                  </div>
                  <div className="highlight-label-slate rounded-lg p-3">
                    <p className="text-xs font-bold opacity-80">Pages</p>
                    <p className="text-2xl font-black">{backupPreview.tables.length.toLocaleString()}</p>
                  </div>
                  <div className="highlight-label-indigo rounded-lg p-3">
                    <p className="text-xs font-bold opacity-80">Images</p>
                    <p className="text-2xl font-black">{backupPreview.imageCount.toLocaleString()}</p>
                    <p className="text-[10px] font-semibold opacity-70">{(backupPreview.imageBytes / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                </div>

                <label className="mt-5 flex items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={skipBackupDuplicates}
                    onChange={event => setSkipBackupDuplicates(event.target.checked)}
                  />
                  Skip duplicates while importing
                </label>

                {backupPreview.planCheck && (
                  <div className={`mt-4 rounded-lg border p-3 text-sm font-semibold ${
                    backupPreview.planCheck.ok
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                      : 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200'
                  }`}>
                    {backupPreview.planCheck.message}
                  </div>
                )}

                {backupPreview.unsupportedTables.length > 0 && (
                  <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-700 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                    Ignored unsupported pages/files: {backupPreview.unsupportedTables.join(', ')}
                  </div>
                )}
              </aside>

              <main className="overflow-y-auto p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-bold text-slate-800 dark:text-white">Choose Pages To Import</h3>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIgnoredBackupTables(new Set())} className="btn btn-secondary px-3 py-1.5 text-xs">Select all</button>
                    <button type="button" onClick={() => setIgnoredBackupTables(new Set(backupPreview.tables.map(table => table.table)))} className="btn btn-secondary px-3 py-1.5 text-xs">Ignore all</button>
                  </div>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {backupPreview.tables.map(table => {
                    const ignored = ignoredBackupTables.has(table.table);
                    return (
                      <button
                        key={table.table}
                        type="button"
                        onClick={() => toggleIgnoredBackupTable(table.table)}
                        className={`rounded-lg border p-4 text-left transition ${
                          ignored
                            ? 'border-slate-200 bg-slate-50 opacity-70 dark:border-slate-700 dark:bg-slate-900'
                            : 'border-indigo-200 bg-white shadow-sm ring-2 ring-indigo-500/10 dark:border-indigo-800 dark:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-black capitalize text-slate-900 dark:text-white">{table.table.replace(/([A-Z])/g, ' $1')}</p>
                            <p className="text-xs text-slate-500">{ignored ? 'Ignored' : 'Will import'}</p>
                          </div>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-black ${ignored ? 'badge badge-gray' : 'badge badge-info'}`}>
                            {ignored ? 'Skip' : 'Import'}
                          </span>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded bg-slate-100 p-2 dark:bg-slate-700"><strong>{table.valid}</strong><br />valid</div>
                          <div className="rounded bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-200"><strong>{table.newRecords}</strong><br />new</div>
                          <div className="rounded bg-amber-100 p-2 text-amber-700 dark:bg-amber-900/30 dark:text-amber-200"><strong>{table.duplicates}</strong><br />dupes</div>
                        </div>
                        {table.skippedInvalid > 0 && <p className="mt-2 text-xs text-rose-500">{table.skippedInvalid} invalid record{table.skippedInvalid === 1 ? '' : 's'} ignored</p>}
                        {table.duplicateExamples.length > 0 && <p className="mt-2 truncate text-xs text-slate-400">Examples: {table.duplicateExamples.join(', ')}</p>}
                      </button>
                    );
                  })}
                </div>
              </main>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-500">
                Import keeps existing data and skips duplicates by default. Ignored pages are not imported.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setBackupPreview(null)} className="btn btn-secondary">Cancel</button>
                <button
                  type="button"
                  onClick={executePreviewedBackupImport}
                  disabled={Boolean(backupPreview.planCheck && !backupPreview.planCheck.ok && backupPreview.tables.some(table => !ignoredBackupTables.has(table.table) && (table.table === 'students' || table.table === 'staff')))}
                  className="btn btn-primary flex items-center gap-2 disabled:opacity-60"
                >
                  <Upload size={16} />
                  Import Selected Pages
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      <OperationProgressPopup
        open={backupProgress.open}
        title={backupProgress.title}
        detail={backupProgress.detail}
        progress={backupProgress.progress}
        processed={backupProgress.processed}
        total={backupProgress.total}
      />

      {showCloudBackupModal && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isCloudBackingUp) setShowCloudBackupModal(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3 border-b border-slate-200 p-5 theme-note dark:border-slate-700">
              <Cloud size={22} className="text-primary-600" />
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Cloud Backup</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Export data and images, then open Google Drive.</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div>
                <label className="form-label">Gmail account</label>
                <input
                  type="email"
                  value={backupAccount}
                  onChange={(event) => setBackupAccount(event.target.value)}
                  className="form-input"
                  placeholder="name@gmail.com"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                Schofy will export your backup file first, including student/staff photos, attachments, and school logos stored in the app. Then Google Drive opens in a new tab so you can upload it.
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button type="button" onClick={() => setShowCloudBackupModal(false)} className="btn btn-secondary" disabled={isCloudBackingUp}>Cancel</button>
              <button type="button" onClick={startCloudBackup} className="btn btn-primary flex items-center gap-2" disabled={isCloudBackingUp}>
                {isCloudBackingUp ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Upload size={16} />}
                {isCloudBackingUp ? 'Preparing...' : 'Export & Open'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {showSchoolDbConfirm && createPortal((
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget && !savingSchoolDb) setShowSchoolDbConfirm(false);
          }}
        >
          <div className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-3 border-b border-slate-200 p-5 theme-note dark:border-slate-700">
              <Shield size={22} className="text-primary-600" />
              <div>
                <h2 className="font-bold text-slate-900 dark:text-white">Confirm Database Change</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Admin password is required before changing where school data syncs.</p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                {schoolDbConfirmAction === 'clear'
                  ? 'Removing this connection pauses external database writes until another school database is connected.'
                  : schoolDbConfig.shareToDevices
                    ? 'After saving, school records write to the connected school database. The connection will also be shared to other signed-in devices for this school.'
                    : 'After saving, school records write to the connected school database. The app will not write school data to the default cloud while this connection is active.'}
              </div>
              <div>
                <label className="form-label">Admin password</label>
                <input
                  type="password"
                  value={schoolDbAdminPassword}
                  onChange={(event) => {
                    setSchoolDbAdminPassword(event.target.value);
                    setSchoolDbPasswordError('');
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !savingSchoolDb) void completeSchoolDatabaseAction();
                  }}
                  className="form-input"
                  placeholder="Enter admin password"
                  autoComplete="current-password"
                  autoFocus
                />
                {schoolDbPasswordError && <p className="mt-2 text-sm font-medium text-red-600">{schoolDbPasswordError}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button
                type="button"
                onClick={() => setShowSchoolDbConfirm(false)}
                className="btn btn-secondary"
                disabled={savingSchoolDb}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={completeSchoolDatabaseAction}
                className="btn btn-primary flex items-center gap-2"
                disabled={savingSchoolDb || !schoolDbAdminPassword}
              >
                {savingSchoolDb ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : <Shield size={16} />}
                {savingSchoolDb ? 'Confirming...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* Promote Students Modal */}
      {showPromoteModal && createPortal((
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget && !isPromoting) setShowPromoteModal(false);
          }}
        >
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden">
            <div className="flex items-center gap-3 p-5 border-b border-slate-200 dark:border-slate-700 bg-amber-50 dark:bg-amber-900/20">
              <GraduationCap size={22} className="text-amber-600" />
              <div>
                <h2 className="font-bold text-slate-800 dark:text-white">Start New Term</h2>
                <p className="text-xs text-slate-500 mt-0.5">Promote all active students to their next class</p>
              </div>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="form-label">New Term</label>
                  <PortalSelect
                    value={promoteNewTerm}
                    onChange={setPromoteNewTerm}
                    options={[
                      { value: '1', label: 'Term 1' },
                      { value: '2', label: 'Term 2' },
                      { value: '3', label: 'Term 3' },
                    ]}
                  />
                </div>
                <div>
                  <label className="form-label">Academic Year</label>
                  <input type="text" value={promoteNewYear} onChange={e => setPromoteNewYear(e.target.value)} className="form-input" placeholder="e.g. 2026" />
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-3 space-y-1.5 text-sm text-amber-800 dark:text-amber-300">
                <div className="flex items-center gap-2 font-semibold"><Users size={14} /> What will happen:</div>
                <p>• Each active student moves to the next class (by level)</p>
                <p>• Students in the final class are graduated (marked completed)</p>
                <p>• Current term is updated to Term {promoteNewTerm} / {promoteNewYear}</p>
              </div>
            </div>
            {isPromoting && (
              <div className="px-5 pb-4 space-y-2">
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                  <div className="h-full bg-amber-500 transition-all" style={{ width: `${promoteProgress}%` }} />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">{promoteStatus || 'Working...'} {promoteProgress}%</p>
              </div>
            )}
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button type="button" onClick={() => setShowPromoteModal(false)} className="btn btn-secondary" disabled={isPromoting}>Cancel</button>
              <button type="button" onClick={handlePromoteStudents} className="btn btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500 flex items-center gap-2" disabled={isPromoting}>
                {isPromoting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight size={16} />}
                {isPromoting ? 'Promoting...' : 'Confirm & Promote'}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
}
