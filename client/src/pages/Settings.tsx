import { useEffect, useState, useRef, useCallback } from 'react';
import { Save, Palette, Building, Calendar, DollarSign, Cloud, CloudOff, RefreshCw, CheckCircle, Database, Upload, Download, AlertTriangle, Trash2, GraduationCap, ArrowRight, Users } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrency } from '../hooks/useCurrency';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { dataService } from '../lib/database/SupabaseDataService';

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

export default function Settings() {
  const { primaryColor, setPrimaryColor } = useTheme();
  const { addToast } = useToast();
  const { setCurrency } = useCurrency();
  const { isOnline, isSyncing, pendingChanges, lastSyncTime, exportBackup, importBackup, isSyncEnabled, enableSync, disableSync, isSupabaseConfigured } = useSync();
  const { user, schoolId } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showPromoteModal, setShowPromoteModal] = useState(false);
  const [promoteNewTerm, setPromoteNewTerm] = useState('1');
  const [promoteNewYear, setPromoteNewYear] = useState(new Date().getFullYear().toString());
  const [isPromoting, setIsPromoting] = useState(false);
  const [settings, setSettings] = useState({
    schoolName: 'My School',
    schoolAddress: '',
    schoolPhone: '',
    schoolEmail: '',
    academicYear: new Date().getFullYear().toString(),
    currentTerm: '1',
    term1Start: '',
    term1End: '',
    term2Start: '',
    term2End: '',
    term3Start: '',
    term3End: '',
    currency: 'USD',
    busFee: '100',
    libraryFee: '50',
    sportsFee: '75',
    schoolType: 'nursery_primary',
  });

  const currentCurrency = currencies.find(c => c.code === settings.currency) || currencies[0];

  useEffect(() => {
    if (user?.id || schoolId) {
      loadSettings();
    }
  }, [user?.id, schoolId]);

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
        setSettings(prev => ({ ...prev, ...localObj }));
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

        // Only apply remote keys that don't exist locally yet
        const missing: Record<string, any> = {};
        for (const [k, v] of Object.entries(remoteObj)) {
          if (!(k in localObj)) missing[k] = v;
        }

        if (Object.keys(missing).length > 0) {
          const merged = { ...localObj, ...missing };
          setSettings(prev => ({ ...prev, ...missing }));
          localStorage.setItem(localKey, JSON.stringify(merged));
          if (missing.currency) {
            localStorage.setItem('schofy_currency', missing.currency);
            window.dispatchEvent(new Event('currencyChanged'));
          }
        }
      }
    } catch (error) {
      console.error(error);
    }
  }

  const [isSaving, setIsSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save to Supabase 1s after last change
  const autoSave = useCallback(async (newSettings: typeof settings) => {
    const sid = schoolId || user?.id;
    if (!sid || !newSettings.schoolName?.trim()) return;
    setIsSaving(true);
    try {
      localStorage.setItem('schofy_currency', newSettings.currency || 'USD');
      // Persist to localStorage immediately for next login
      localStorage.setItem(`schofy_settings_${sid}`, JSON.stringify(newSettings));
      window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: newSettings }));
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
      localStorage.setItem('schofy_currency', settings.currency || 'USD');
      window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));

      const result = await dataService.saveSettings(sid, settings);
      if (!result.success) {
        addToast(result.error || 'Failed to save settings', 'error');
        return;
      }

      await autoCreateClasses(sid, settings.schoolType);
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

  async function autoCreateClasses(sid: string, schoolTypeOverride?: string) {
    const schoolType = schoolTypeOverride || settings.schoolType || 'nursery_primary';

    const CLASS_MAP: Record<string, { name: string; level: number }[]> = {
      nursery: [
        { name: 'Baby', level: 1 },
        { name: 'Nursery', level: 2 },
        { name: 'Middle', level: 3 },
        { name: 'Top', level: 4 },
      ],
      primary: [
        { name: 'P.1', level: 1 }, { name: 'P.2', level: 2 }, { name: 'P.3', level: 3 },
        { name: 'P.4', level: 4 }, { name: 'P.5', level: 5 }, { name: 'P.6', level: 6 },
        { name: 'P.7', level: 7 },
      ],
      secondary: [
        { name: 'S.1', level: 1 }, { name: 'S.2', level: 2 }, { name: 'S.3', level: 3 },
        { name: 'S.4', level: 4 }, { name: 'S.5', level: 5 }, { name: 'S.6', level: 6 },
      ],
    };

    let classesToCreate: { name: string; level: number }[] = [];

    if (schoolType === 'nursery') {
      classesToCreate = CLASS_MAP.nursery;
    } else if (schoolType === 'nursery_primary') {
      classesToCreate = [
        ...CLASS_MAP.nursery,
        ...CLASS_MAP.primary.map(c => ({ ...c, level: c.level + 4 })),
      ];
    } else if (schoolType === 'primary') {
      classesToCreate = CLASS_MAP.primary;
    } else if (schoolType === 'secondary') {
      classesToCreate = CLASS_MAP.secondary;
    } else if (schoolType === 'primary_secondary') {
      classesToCreate = [
        ...CLASS_MAP.primary,
        ...CLASS_MAP.secondary.map(c => ({ ...c, level: c.level + 7 })),
      ];
    } else if (schoolType === 'all') {
      classesToCreate = [
        ...CLASS_MAP.nursery,
        ...CLASS_MAP.primary.map(c => ({ ...c, level: c.level + 4 })),
        ...CLASS_MAP.secondary.map(c => ({ ...c, level: c.level + 11 })),
      ];
    }

    const existingClasses = await dataService.getAll(sid, 'classes');
    // Check by name (case-insensitive) — don't create if already exists
    const existingNames = new Set(existingClasses.map((c: any) => c.name.toLowerCase().trim()));

    let createdCount = 0;
    for (const cls of classesToCreate) {
      if (!existingNames.has(cls.name.toLowerCase().trim())) {
        await dataService.create(sid, 'classes', { name: cls.name, level: cls.level, capacity: 40 } as any);
        createdCount++;
      }
    }

    if (createdCount > 0) addToast(`${createdCount} classes auto-created`, 'info');
    else if (schoolTypeOverride) addToast('All classes for this school type already exist', 'info');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    const newSettings = { ...settings, [name]: value };
    setSettings(newSettings);

    if (name === 'currency') {
      setCurrency(value as any);
    }

    // Auto-generate classes immediately when school type changes
    if (name === 'schoolType') {
      const sid = schoolId || user?.id;
      if (sid) void autoCreateClasses(sid, value);
    }

    // Debounced auto-save — fires 1s after last keystroke
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => void autoSave(newSettings), 1000);
  }

  async function handlePromoteStudents() {
    const id = schoolId || user?.id;
    if (!id) return;
    setIsPromoting(true);
    try {
      // Load all classes sorted by level
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

      for (const student of active) {
        const currentClassId = (student as any).classId;
        if (currentClassId === lastClassId) {
          // Graduate — mark completed
          await dataService.update(id, 'students', (student as any).id, {
            status: 'completed',
            completedYear: parseInt(promoteNewYear),
            completedTerm: settings.currentTerm,
            updatedAt: now,
          } as any);
          graduated++;
        } else if (nextClassMap[currentClassId]) {
          // Promote to next class
          await dataService.update(id, 'students', (student as any).id, {
            classId: nextClassMap[currentClassId],
            updatedAt: now,
          } as any);
          promoted++;
        }
      }

      // Update current term in settings
      await dataService.saveSettings(id, {
        ...settings,
        currentTerm: promoteNewTerm,
        academicYear: promoteNewYear,
      });
      setSettings(prev => ({ ...prev, currentTerm: promoteNewTerm, academicYear: promoteNewYear }));

      window.dispatchEvent(new CustomEvent('studentsUpdated'));
      window.dispatchEvent(new CustomEvent('dataRefresh'));
      setShowPromoteModal(false);
      addToast(`Term started: ${promoted} students promoted, ${graduated} graduated`, 'success');
    } catch (err: any) {
      addToast(err?.message || 'Promotion failed', 'error');
    } finally {
      setIsPromoting(false);
    }
  }

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
        'schools', 'students', 'staff', 'classes', 'subjects',
        'attendance', 'fees', 'feeStructures', 'bursaries', 'discounts',
        'payments', 'announcements', 'notifications', 'exams', 'examResults',
        'timetable', 'transportRoutes', 'transportAssignments', 'salaryPayments',
        'settings', 'syncQueue', 'syncMeta'
      ];

      for (const table of tables) {
        try {
          await dataService.clear(id, table);
        } catch {
          // Table might not exist
        }
      }
      
      setShowDeleteConfirm(false);
      setDeletePassword('');
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
        
        for (const id of toRemove) {
          await dataService.delete(sid, table, id);
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

  const colorOptions = [
    { color: '#4F46E5', name: 'Indigo' },
    { color: '#2da32d', name: 'Green' },
    { color: '#ed1e1e', name: 'Red' },
    { color: '#f68818', name: 'Orange' },
    { color: '#06b6d4', name: 'Cyan' },
    { color: '#6F2DA8', name: 'Purple' },
    { color: '#8b5cf6', name: 'Violet' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settings</h1>
          <p className="text-slate-500">Configure your school system</p>
        </div>
        <div className="flex items-center gap-3">
          {autoSaved && <span className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle size={14} /> Auto-saved</span>}
          {isSaving && <span className="text-sm text-slate-400 flex items-center gap-1"><div className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin" /> Saving...</span>}
          <button onClick={handleSave} disabled={isSaving} className="btn btn-primary flex items-center gap-2 disabled:opacity-70">
            {isSaving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={18} />}
            {isSaving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
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
              <select name="schoolType" value={settings.schoolType} onChange={handleChange} className="form-input">
                <option value="nursery">Nursery Only</option>
                <option value="nursery_primary">Nursery &amp; Primary</option>
                <option value="primary">Primary Only</option>
                <option value="secondary">Secondary Only</option>
                <option value="primary_secondary">Primary &amp; Secondary</option>
                <option value="all">Nursery, Primary &amp; Secondary</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="form-label">Address</label>
              <textarea name="schoolAddress" value={settings.schoolAddress} onChange={handleChange} className="form-input" rows={2} />
            </div>
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
              <select name="currentTerm" value={settings.currentTerm} onChange={handleChange} className="form-input">
                <option value="1">Term 1</option>
                <option value="2">Term 2</option>
                <option value="3">Term 3</option>
              </select>
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
              <select name="currency" value={settings.currency} onChange={handleChange} className="form-input">
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.symbol} {c.code} - {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label">Bus Fee ({currentCurrency.symbol})</label>
              <input type="number" name="busFee" value={settings.busFee} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Library Fee ({currentCurrency.symbol})</label>
              <input type="number" name="libraryFee" value={settings.libraryFee} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Sports Fee ({currentCurrency.symbol})</label>
              <input type="number" name="sportsFee" value={settings.sportsFee} onChange={handleChange} className="form-input" />
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
            
            <div className="mt-6 p-4 rounded-xl border border-slate-200 dark:border-slate-700" style={{ backgroundColor: `${primaryColor}10` }}>
              <p className="text-sm font-medium mb-3" style={{ color: primaryColor }}>Preview</p>
              <div className="flex gap-3">
                <button className="px-4 py-2 rounded-lg text-white font-medium" style={{ backgroundColor: primaryColor }}>
                  Primary Button
                </button>
                <button className="px-4 py-2 rounded-lg border-2 font-medium" style={{ borderColor: primaryColor, color: primaryColor }}>
                  Secondary
                </button>
                <span className="px-3 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}>
                  Badge
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Cloud size={20} />
            <h2 className="font-semibold">Cloud Sync (Supabase)</h2>
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
              Schofy saves every change to this device first, then syncs to the cloud in the background (about every 8 seconds when
              online). No manual sync is required. When you reconnect to the internet, pending changes upload automatically.
            </p>

            <div className="flex flex-wrap gap-3 items-center">
              {isSyncEnabled ? (
                <button type="button" onClick={disableSync} className="btn btn-secondary flex items-center gap-2 text-sm">
                  <CloudOff size={16} />
                  Pause cloud sync
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
                  Enable cloud sync
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const sid = schoolId || user?.id;
                  if (!sid) { addToast('Not logged in', 'error'); return; }
                  addToast('Pulling all data from cloud...', 'info');
                  try {
                    const { dataService } = await import('../lib/database/DataService');
                    const result = await dataService.forcePull(sid);
                    if (result.success) {
                      addToast(`Pulled ${result.pulled} records from cloud`, 'success');
                      window.dispatchEvent(new CustomEvent('dataRefresh'));
                    } else {
                      addToast(result.error || 'Pull failed — check your connection', 'error');
                    }
                  } catch (err: any) {
                    addToast(err?.message || 'Pull failed', 'error');
                  }
                }}
                className="btn btn-secondary flex items-center gap-2 text-sm"
              >
                <Download size={16} />
                Pull from Cloud
              </button>
              <button
                type="button"
                onClick={async () => {
                  const sid = schoolId || user?.id;
                  if (!sid) { addToast('Not logged in', 'error'); return; }
                  addToast('Pushing local data to cloud...', 'info');
                  try {
                    const { dataService } = await import('../lib/database/DataService');
                    const result = await dataService.forcePush(sid);
                    if (result.success) {
                      addToast(`Pushed ${result.pushed} records to cloud`, 'success');
                    } else {
                      addToast(result.error || 'Push failed — check your connection', 'error');
                    }
                  } catch (err: any) {
                    addToast(err?.message || 'Push failed', 'error');
                  }
                }}
                className="btn btn-secondary flex items-center gap-2 text-sm"
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
                  Export Backup
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
                      if (file) {
                        await importBackup(file);
                      }
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
                Export your data as JSON for backup. Import to restore data from a backup file. Clean duplicates removes repeated entries from all tables.
              </p>
            </div>

            {isSupabaseConfigured ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Cloud Sync Status</h4>
                <div className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
                  <p><strong>Connection:</strong> {isOnline ? 'Online' : 'Offline'}</p>
                  <p><strong>Background sync:</strong> {isSyncEnabled ? 'On (automatic)' : 'Paused'}</p>
                  <p className="text-xs mt-2 opacity-90">
                    Developer: run <code className="bg-blue-100/50 dark:bg-blue-950/50 px-1 rounded">await window.debugSync()</code> in
                    the console to compare local vs remote counts and the sync queue.
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
              <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-700 overflow-hidden" onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-3 px-5 py-4 border-b border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
                    <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center shrink-0">
                      <AlertTriangle size={20} className="text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-red-700 dark:text-red-300">Delete All Data</h3>
                      <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">This action cannot be undone</p>
                    </div>
                  </div>
                  <div className="p-5 space-y-4">
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      This will permanently delete <strong>ALL</strong> your school data. Enter your <strong>password</strong> to confirm:
                    </p>
                    <input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => { setDeletePassword(e.target.value); setDeleteError(''); }}
                      className="form-input"
                      placeholder="Enter your password"
                      autoFocus
                    />
                    {deleteError && <p className="text-red-500 text-sm">{deleteError}</p>}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); setDeleteError(''); }}
                        className="btn btn-secondary flex-1"
                        disabled={isDeleting}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleDeleteAllData}
                        disabled={!deletePassword || isDeleting}
                        className="btn bg-red-600 hover:bg-red-700 text-white flex-1 flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        {isDeleting ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Deleting...</> : <><Trash2 size={16} /> Delete All</>}
                      </button>
                    </div>
                  </div>
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

      {/* Promote Students Modal */}
      {showPromoteModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
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
                  <select value={promoteNewTerm} onChange={e => setPromoteNewTerm(e.target.value)} className="form-input">
                    <option value="1">Term 1</option>
                    <option value="2">Term 2</option>
                    <option value="3">Term 3</option>
                  </select>
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
            <div className="flex justify-end gap-3 px-5 pb-5">
              <button type="button" onClick={() => setShowPromoteModal(false)} className="btn btn-secondary" disabled={isPromoting}>Cancel</button>
              <button type="button" onClick={handlePromoteStudents} className="btn btn-primary bg-amber-500 hover:bg-amber-600 border-amber-500 flex items-center gap-2" disabled={isPromoting}>
                {isPromoting ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <ArrowRight size={16} />}
                {isPromoting ? 'Promoting...' : 'Confirm & Promote'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
