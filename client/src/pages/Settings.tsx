import { useEffect, useState } from 'react';
import { Save, Palette, Building, Calendar, DollarSign, Cloud, CloudOff, RefreshCw, CheckCircle, Database, Upload, Download, AlertTriangle, Trash2, UploadCloud } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrency } from '../hooks/useCurrency';
import { useSync } from '../contexts/SyncContext';
import { useAuth } from '../contexts/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { dataService } from '../lib/database/DataService';
import { userDBManager } from '../lib/database/UserDatabaseManager';

const currencies = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'UGX', symbol: 'USh', name: 'Ugandan Shilling' },
];

export default function Settings() {
  const { primaryColor, setPrimaryColor } = useTheme();
  const { addToast } = useToast();
  const { setCurrency } = useCurrency();
  const { isOnline, isSyncing, pendingChanges, lastSyncTime, syncNow, forceFullSync, exportBackup, importBackup, isSyncEnabled, enableSync, disableSync, isSupabaseConfigured } = useSync();
  const { user, schoolId } = useAuth();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
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
    try {
      const stored = await dataService.getAll(id, 'settings');
      const settingsObj: Record<string, any> = {};
      stored.forEach(s => { settingsObj[s.key] = s.value; });
      setSettings(prev => ({ ...prev, ...settingsObj }));
    } catch (error) {
      console.error(error);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const id = schoolId || user?.id;
    if (!id) return;

    // Validate required fields
    if (!settings.schoolName || settings.schoolName.trim() === '' || settings.schoolName === 'My School') {
      addToast('Please enter your school name', 'error');
      return;
    }

    try {
      for (const [key, value] of Object.entries(settings)) {
        const settingRecord = { id: key, key, value, updatedAt: new Date().toISOString() };
        
        // Cloud-first: save to Supabase when online
        if (isSupabaseConfigured && supabase) {
          try {
            await supabase.from('settings').upsert({ ...settingRecord, school_id: id }, { onConflict: 'id' });
          } catch (e) { console.warn('Cloud save failed:', e); }
        }
        // Also save locally
        await userDBManager.put(id, 'settings', settingRecord);
      }
      // Broadcast settings update to all pages
      window.dispatchEvent(new CustomEvent('settingsUpdated', { detail: settings }));
      addToast('Settings saved', 'success');
    } catch (error) {
      console.error('Save settings error:', error);
      addToast('Failed to save settings', 'error');
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setSettings(prev => ({ ...prev, [name]: value }));
    
    if (name === 'currency') {
      setCurrency(value as 'USD' | 'UGX');
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
        <button onClick={handleSave} className="btn btn-primary"><Save size={18} /> Save Changes</button>
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
                  {isSyncing ? 'Syncing...' : isSyncEnabled ? 'Active' : 'Inactive'}
                </p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle size={16} className="text-slate-400" />
                  <span className="text-sm font-medium">Last Sync</span>
                </div>
                <p className="text-lg font-bold text-slate-800 dark:text-white">
                  {lastSyncTime ? new Date(lastSyncTime).toLocaleString() : 'Never'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {isSyncEnabled ? (
                <>
                  <button
                    onClick={async () => {
                      try {
                        await syncNow();
                      } catch (err) {
                        console.error('Sync error:', err);
                        addToast('Sync failed. Check console for details.', 'error');
                      }
                    }}
                    disabled={!isOnline || isSyncing}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <RefreshCw size={16} className={isSyncing ? 'animate-spin' : ''} />
                    Sync Now
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        await forceFullSync();
                      } catch (err) {
                        console.error('Full sync error:', err);
                        addToast('Full sync failed. Check console for details.', 'error');
                      }
                    }}
                    disabled={isSyncing}
                    className="btn btn-secondary flex items-center gap-2"
                    title="Pull all data from cloud to this device"
                  >
                    <Download size={16} />
                    Pull from Cloud
                  </button>
                  <button
                    onClick={async () => {
                      const id = user?.id || schoolId;
                      addToast('Starting push...', 'info');
                      console.log('Push: id=', id);
                      if (!id) {
                        addToast('No user ID', 'error');
                        return;
                      }
                      try {
                        const { userDBManager } = await import('../lib/database/UserDatabaseManager');
                        const tables = ['students', 'staff', 'classes', 'subjects', 'announcements', 'fees', 'payments'];
                        let pushedCount = 0;
                        for (const table of tables) {
                          const records = await userDBManager.getAll(id, table);
                          console.log(`Push: ${table} has ${records.length} locally`);
                          for (const record of records) {
                            if (record.id) {
                              try {
                                const payload: any = { id: record.id };
                                
                                // Map app fields to Supabase fields
                                if (record.firstName) payload.first_name = record.firstName;
                                if (record.lastName) payload.last_name = record.lastName;
                                if (record.name) payload.name = record.name;
                                if (record.level) payload.level = record.level;
                                if (record.admissionNo) payload.admission_no = record.admissionNo;
                                if (record.gender) payload.gender = record.gender;
                                if (record.dob) payload.dob = record.dob;
                                if (record.classId) payload.class_id = record.classId;
                                if (record.studentId) payload.student_id = record.studentId;
                                if (record.description) payload.description = record.description;
                                if (record.amount) payload.amount = record.amount;
                                if (record.term) payload.term = record.term;
                                if (record.year) payload.year = record.year;
                                if (record.method) payload.method = record.method;
                                if (record.date) payload.date = record.date;
                                if (record.studentId) payload.student_id = record.studentId;
                                
                                payload.school_id = id;
                                payload.updated_at = record.updatedAt || new Date().toISOString();
                                if (record.createdAt) payload.created_at = record.createdAt;
                                
                                const { error } = await supabase.from(table).insert(payload);
                                if (error) {
                                  console.error(`${table} insert error:`, error.message);
                                } else {
                                  pushedCount++;
                                }
                              } catch (e: any) {
                                console.warn(`${table} fail:`, e.message || e);
                              }
                            }
                          }
                        }
                        console.log('Total pushed:', pushedCount);
                        addToast(`Pushed ${pushedCount} records to cloud`, 'success');
                      } catch (err: any) {
                        console.error('Push error:', err);
                        addToast('Failed: ' + (err.message || err), 'error');
                      }
                    }}
                    disabled={!isOnline || !isSupabaseConfigured}
                    className="btn btn-primary flex items-center gap-2"
                    title="Push all local data to cloud"
                  >
                    <UploadCloud size={16} />
                    Push to Cloud
                  </button>
                  <button
                    onClick={disableSync}
                    className="btn btn-secondary flex items-center gap-2"
                  >
                    <CloudOff size={16} />
                    Disable Sync
                  </button>
                </>
              ) : (
                <button
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
                  Enable Cloud Sync
                </button>
              )}
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
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Export your data as JSON for backup. Import to restore data from a backup file.
              </p>
            </div>

            {isSupabaseConfigured ? (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-medium text-blue-800 dark:text-blue-300 mb-2">Cloud Sync Status</h4>
                <div className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
                  <p><strong>Connection:</strong> {isOnline ? 'Online' : 'Offline'}</p>
                  <p><strong>Auto-sync:</strong> {isSyncEnabled ? 'Enabled' : 'Disabled'}</p>
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
    </div>
  );
}
