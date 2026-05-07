import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, Plus, Eye, EyeOff, Trash2, Edit2, Shield, History, CheckCircle, XCircle, Copy, RefreshCw, Key, Lock, Mail, Phone, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { hashPassword } from '../lib/security';
import { useStaffAuth, logStaffActivity, buildGeneratedEmail } from '../contexts/StaffAuthContext';

const ALL_PAGES = [
  { path: '/', label: 'Dashboard' },
  { path: '/students', label: 'Students' },
  { path: '/admission', label: 'Admission' },
  { path: '/attendance', label: 'Attendance' },
  { path: '/classes', label: 'Classes' },
  { path: '/subjects', label: 'Subjects' },
  { path: '/grades', label: 'Exams & Grades' },
  { path: '/finance', label: 'Fees & Finance' },
  { path: '/invoices', label: 'Invoices' },
  { path: '/transport', label: 'Transport' },
  { path: '/announcements', label: 'Announcements' },
  { path: '/reports', label: 'Reports' },
  { path: '/payroll', label: 'Payroll' },
];

const ROLE_PRESETS: Record<string, string[]> = {
  teacher: ['/', '/students', '/attendance', '/classes', '/subjects', '/grades', '/announcements'],
  accountant: ['/', '/finance', '/invoices', '/reports'],
  librarian: ['/', '/students', '/announcements'],
  receptionist: ['/', '/students', '/admission', '/announcements'],
  custom: [],
};

const ROLE_COLORS: Record<string, string> = {
  teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  accountant: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  librarian: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  receptionist: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  custom: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
};

interface StaffUser {
  id: string; staffId: string; firstName: string; lastName: string;
  role: string; email: string; generatedEmail: string; phone: string;
  allowedPages: string[]; isActive: boolean; isReadOnly: boolean;
  lastLoginAt: string | null; createdAt: string;
}
interface ActivityLog {
  id: string; staffId: string; action: string; description: string; createdAt: string;
}

export default function Roles() {
  const { user, schoolId } = useAuth();
  const { isStaffMode } = useStaffAuth();
  const tenantId = schoolId || user?.id || '';

  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [activityLog, setActivityLog] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'staff' | 'history'>('staff');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [copiedId, setCopiedId] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);

  // Credential change modal
  const [showCredModal, setShowCredModal] = useState(false);
  const [credTarget, setCredTarget] = useState<StaffUser | null>(null);
  const [newStaffId, setNewStaffId] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [credSaving, setCredSaving] = useState(false);
  const [credError, setCredError] = useState('');

  const [form, setForm] = useState({
    firstName: '', lastName: '', role: 'teacher', email: '', phone: '',
    password: '', allowedPages: ROLE_PRESETS.teacher, isReadOnly: false,
  });

  useEffect(() => { loadData(); }, [tenantId]);

  async function loadData() {
    if (!supabase || !tenantId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [staffRes, logRes] = await Promise.all([
        supabase.from('school_staff_users').select('*').eq('school_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('staff_activity_log').select('*').eq('school_id', tenantId).order('created_at', { ascending: false }).limit(300),
      ]);
      setStaffList((staffRes.data || []).map((s: any) => ({
        id: s.id, staffId: s.staff_id, firstName: s.first_name, lastName: s.last_name,
        role: s.role, email: s.email || '',
        generatedEmail: s.generated_email || buildGeneratedEmail(s.first_name, s.last_name, s.staff_id),
        phone: s.phone || '',
        allowedPages: Array.isArray(s.allowed_pages) ? s.allowed_pages : [],
        isActive: s.is_active, isReadOnly: s.is_read_only || false,
        lastLoginAt: s.last_login_at || null, createdAt: s.created_at,
      })));
      setActivityLog((logRes.data || []).map((l: any) => ({
        id: l.id, staffId: l.staff_id, action: l.action, description: l.description, createdAt: l.created_at,
      })));
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  function generateStaffId(role: string, count: number) {
    const prefix: Record<string, string> = { teacher: 'TCH', accountant: 'ACC', librarian: 'LIB', receptionist: 'RCP', custom: 'STF' };
    return (prefix[role] || 'STF') + '-' + String(count + 1).padStart(3, '0');
  }

  function openAdd() {
    setForm({ firstName: '', lastName: '', role: 'teacher', email: '', phone: '', password: '', allowedPages: ROLE_PRESETS.teacher, isReadOnly: false });
    setEditingStaff(null); setShowAddModal(true); setError(''); setSuccess('');
  }
  function openEdit(s: StaffUser) {
    setForm({ firstName: s.firstName, lastName: s.lastName, role: s.role, email: s.email, phone: s.phone, password: '', allowedPages: s.allowedPages, isReadOnly: s.isReadOnly });
    setEditingStaff(s); setShowAddModal(true); setError('');
  }
  function openCredModal(s: StaffUser) {
    setCredTarget(s); setNewStaffId(s.staffId); setNewPassword(''); setCredError(''); setShowCredModal(true);
  }

  async function saveStaff() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('First and last name required'); return; }
    if (!editingStaff && form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!supabase) return;
    setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      if (editingStaff) {
        const update: any = {
          first_name: form.firstName.trim(), last_name: form.lastName.trim(),
          role: form.role, email: form.email.trim(), phone: form.phone.trim(),
          allowed_pages: form.allowedPages, is_read_only: form.isReadOnly,
          generated_email: buildGeneratedEmail(form.firstName.trim(), form.lastName.trim(), editingStaff.staffId),
          updated_at: now,
        };
        if (form.password.length >= 6) update.password_hash = await hashPassword(form.password);
        await supabase.from('school_staff_users').update(update).eq('id', editingStaff.id);
        await logStaffActivity(tenantId, user?.id || '', 'admin', 'edit_staff', 'Edited: ' + editingStaff.staffId);
        setSuccess('Staff updated successfully');
      } else {
        const roleCount = staffList.filter(s => s.role === form.role).length;
        const staffId = generateStaffId(form.role, roleCount);
        const genEmail = buildGeneratedEmail(form.firstName.trim(), form.lastName.trim(), staffId);
        await supabase.from('school_staff_users').insert({
          id: crypto.randomUUID(), school_id: tenantId, staff_id: staffId,
          first_name: form.firstName.trim(), last_name: form.lastName.trim(),
          role: form.role, email: form.email.trim(), phone: form.phone.trim(),
          password_hash: await hashPassword(form.password), allowed_pages: form.allowedPages,
          is_read_only: form.isReadOnly, generated_email: genEmail,
          is_active: true, created_at: now, updated_at: now,
        });
        await logStaffActivity(tenantId, user?.id || '', 'admin', 'create_staff', 'Created: ' + staffId);
        setSuccess('Account created. ID: ' + staffId + ' | Email: ' + genEmail);
      }
      setShowAddModal(false); await loadData();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function saveCredentials() {
    if (!credTarget || !supabase) return;
    const cleanId = newStaffId.trim().toUpperCase();
    if (!cleanId) { setCredError('Staff ID cannot be empty'); return; }
    if (newPassword && newPassword.length < 6) { setCredError('Password must be at least 6 characters'); return; }
    setCredSaving(true); setCredError('');
    try {
      const now = new Date().toISOString();
      const update: any = { staff_id: cleanId, updated_at: now };
      if (newPassword.length >= 6) update.password_hash = await hashPassword(newPassword);
      // Regenerate email with new staff ID
      update.generated_email = buildGeneratedEmail(credTarget.firstName, credTarget.lastName, cleanId);
      await supabase.from('school_staff_users').update(update).eq('id', credTarget.id);
      await logStaffActivity(tenantId, user?.id || '', 'admin', 'change_credentials', 'Changed credentials for: ' + credTarget.staffId + (cleanId !== credTarget.staffId ? ' -> ' + cleanId : ''));
      setSuccess('Credentials updated for ' + credTarget.firstName + ' ' + credTarget.lastName);
      setShowCredModal(false); await loadData();
    } catch (e: any) { setCredError(e.message || 'Failed to update'); }
    finally { setCredSaving(false); }
  }

  async function toggleActive(s: StaffUser) {
    if (!supabase) return;
    await supabase.from('school_staff_users').update({ is_active: !s.isActive, updated_at: new Date().toISOString() }).eq('id', s.id);
    await logStaffActivity(tenantId, user?.id || '', 'admin', s.isActive ? 'deactivate' : 'activate', (s.isActive ? 'Deactivated' : 'Activated') + ': ' + s.staffId);
    await loadData();
  }

  async function deleteStaff(s: StaffUser) {
    if (!supabase || !confirm('Delete ' + s.firstName + ' ' + s.lastName + '? This cannot be undone.')) return;
    await supabase.from('school_staff_users').delete().eq('id', s.id);
    await logStaffActivity(tenantId, user?.id || '', 'admin', 'delete_staff', 'Deleted: ' + s.staffId);
    await loadData();
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopiedId(text); setTimeout(() => setCopiedId(''), 2000);
  }

  function timeAgo(iso: string | null) {
    if (!iso) return 'Never';
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins < 60) return mins + 'm ago';
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return new Date(iso).toLocaleDateString();
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Roles & Staff Access</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{staffList.length} staff member{staffList.length !== 1 ? 's' : ''} registered</p>
        </div>
        {!isStaffMode && (
          <button onClick={openAdd} className="btn btn-primary flex items-center gap-2">
            <Plus size={16} /> Add Staff
          </button>
        )}
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl p-3 text-sm flex items-center gap-2"><CheckCircle size={16} />{success}</div>}

      {/* Tabs */}
      {!isStaffMode && (
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {(['staff', 'history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={px-4 py-2 text-sm font-medium border-b-2 transition-colors }>
              {tab === 'staff'
                ? <><Users size={14} className="inline mr-1.5" />Staff ({staffList.length})</>
                : <><History size={14} className="inline mr-1.5" />Activity Log ({activityLog.length})</>}
            </button>
          ))}
        </div>
      )}

      {/* ── Staff Table ── */}
      {(activeTab === 'staff' || isStaffMode) && (
        <div className="card overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="w-7 h-7 border-4 border-slate-200 dark:border-slate-700 border-t-primary-500 rounded-full animate-spin" />
            </div>
          ) : staffList.length === 0 ? (
            <div className="p-10 text-center">
              <Users size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">No staff accounts yet</p>
              {!isStaffMode && <button onClick={openAdd} className="btn btn-primary mt-4 text-sm">Add First Staff Member</button>}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Staff</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">ID / Login Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden md:table-cell">Role</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell">Last Login</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide hidden lg:table-cell">Pages</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Status</th>
                    {!isStaffMode && <th className="text-right px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {staffList.map(s => (
                    <>
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                        {/* Name + avatar */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm flex-shrink-0">
                              {s.firstName[0]}{s.lastName[0]}
                            </div>
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">{s.firstName} {s.lastName}</p>
                              {s.phone && <p className="text-xs text-slate-400">{s.phone}</p>}
                            </div>
                          </div>
                        </td>
                        {/* ID + email */}
                        <td className="px-4 py-3">
                          <button onClick={() => copyText(s.staffId)} className="flex items-center gap-1 text-xs font-mono font-semibold text-slate-700 dark:text-slate-200 hover:text-primary-600 dark:hover:text-primary-400 mb-0.5">
                            <Shield size={11} />{s.staffId}
                            {copiedId === s.staffId ? <CheckCircle size={10} className="text-green-500" /> : <Copy size={10} className="opacity-50" />}
                          </button>
                          <button onClick={() => copyText(s.generatedEmail)} className="flex items-center gap-1 text-[11px] font-mono text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300">
                            <Mail size={10} />{s.generatedEmail}
                            {copiedId === s.generatedEmail ? <CheckCircle size={10} className="text-green-500" /> : <Copy size={10} className="opacity-50" />}
                          </button>
                        </td>
                        {/* Role */}
                        <td className="px-4 py-3 hidden md:table-cell">
                          <div className="flex flex-col gap-1">
                            <span className={	ext-xs px-2 py-0.5 rounded-full font-medium w-fit }>{s.role}</span>
                            {s.isReadOnly && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 w-fit flex items-center gap-1"><Eye size={9} />Read Only</span>}
                          </div>
                        </td>
                        {/* Last login */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <p className={	ext-xs font-medium }>
                            {timeAgo(s.lastLoginAt)}
                          </p>
                          {s.lastLoginAt && <p className="text-[10px] text-slate-400">{new Date(s.lastLoginAt).toLocaleString()}</p>}
                        </td>
                        {/* Pages count */}
                        <td className="px-4 py-3 hidden lg:table-cell">
                          <button onClick={() => setExpandedRow(expandedRow === s.id ? null : s.id)} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                            {s.allowedPages.length} page{s.allowedPages.length !== 1 ? 's' : ''}
                            {expandedRow === s.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                          </button>
                        </td>
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium }>
                            {s.isActive ? <CheckCircle size={10} /> : <XCircle size={10} />}
                            {s.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        {/* Actions */}
                        {!isStaffMode && (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              {/* Change credentials */}
                              <button onClick={() => openCredModal(s)} title="Change ID / Password" className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                                <Key size={14} />
                              </button>
                              {/* Edit */}
                              <button onClick={() => openEdit(s)} title="Edit" className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
                                <Edit2 size={14} />
                              </button>
                              {/* Read-only toggle */}
                              <button onClick={async () => {
                                if (!supabase) return;
                                await supabase.from('school_staff_users').update({ is_read_only: !s.isReadOnly, updated_at: new Date().toISOString() }).eq('id', s.id);
                                await logStaffActivity(tenantId, user?.id || '', 'admin', 'toggle_readonly', (s.isReadOnly ? 'Removed read-only' : 'Set read-only') + ': ' + s.staffId);
                                await loadData();
                              }} title={s.isReadOnly ? 'Remove read-only' : 'Set read-only'} className={p-1.5 rounded-lg transition-colors }>
                                <Eye size={14} />
                              </button>
                              {/* Activate/deactivate */}
                              <button onClick={() => toggleActive(s)} title={s.isActive ? 'Deactivate' : 'Activate'} className={p-1.5 rounded-lg transition-colors }>
                                {s.isActive ? <CheckCircle size={14} /> : <XCircle size={14} />}
                              </button>
                              {/* Delete */}
                              <button onClick={() => deleteStaff(s)} title="Delete" className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                      {/* Expanded row — page access */}
                      {expandedRow === s.id && (
                        <tr key={s.id + '-expanded'} className="bg-slate-50 dark:bg-slate-800/30">
                          <td colSpan={!isStaffMode ? 7 : 6} className="px-4 py-3">
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Allowed pages:</span>
                              {s.allowedPages.map(p => (
                                <span key={p} className="text-xs px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 font-medium">
                                  {p === '/' ? 'Dashboard' : p.replace('/', '')}
                                </span>
                              ))}
                              {s.allowedPages.length === 0 && <span className="text-xs text-slate-400">No pages assigned</span>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Activity Log */}
      {activeTab === 'history' && !isStaffMode && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <History size={15} className="text-primary-500" />Activity History
            </h2>
            <button onClick={loadData} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
              <RefreshCw size={14} className="text-slate-400" />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Staff</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Action</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Description</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {activityLog.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-400">No activity recorded yet</td></tr>
                ) : activityLog.map(log => (
                  <tr key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600 dark:text-slate-300">{log.staffId || 'admin'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${log.action === 'login' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : log.action === 'logout' ? 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' : log.action.includes('delete') ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-700 dark:text-slate-300">{log.description}</td>
                    <td className="px-4 py-2.5 text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center">
                <Users size={18} className="text-primary-600 dark:text-primary-400" />
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{editingStaff ? 'Edit Staff' : 'Add Staff Member'}</h2>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-3 text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">First Name *</label><input className="form-input" value={form.firstName} onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))} placeholder="John" /></div>
                <div><label className="form-label">Last Name *</label><input className="form-input" value={form.lastName} onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))} placeholder="Doe" /></div>
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value, allowedPages: ROLE_PRESETS[e.target.value] || [] }))}>
                  <option value="teacher">Teacher</option>
                  <option value="accountant">Accountant</option>
                  <option value="librarian">Librarian</option>
                  <option value="receptionist">Receptionist</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="staff@school.com" /></div>
                <div><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="07XXXXXXXX" /></div>
              </div>
              <div>
                <label className="form-label">{editingStaff ? 'New Password (blank = keep)' : 'Password *'}</label>
                <div className="relative">
                  <input className="form-input pr-10" type={showPassword ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editingStaff ? 'Leave blank to keep' : 'Min 6 characters'} />
                  <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div>
                <label className="form-label">Page Access</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {ALL_PAGES.map(p => (
                    <label key={p.path} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.allowedPages.includes(p.path)} onChange={e => setForm(f => ({ ...f, allowedPages: e.target.checked ? [...f.allowedPages, p.path] : f.allowedPages.filter(x => x !== p.path) }))} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <input type="checkbox" checked={form.isReadOnly} onChange={e => setForm(f => ({ ...f, isReadOnly: e.target.checked }))} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500" />
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-1.5"><Eye size={14} />Read-Only Mode</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Can view pages but cannot create, edit, or delete</p>
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowAddModal(false)} className="flex-1 btn btn-secondary">Cancel</button>
                <button onClick={saveStaff} disabled={saving} className="flex-1 btn btn-primary flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle size={16} />}
                  {editingStaff ? 'Save Changes' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Change Credentials Modal */}
      {showCredModal && credTarget && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in">
            <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Key size={20} /></div>
                <div>
                  <h2 className="text-base font-bold">Change Credentials</h2>
                  <p className="text-indigo-100 text-xs">{credTarget.firstName} {credTarget.lastName}</p>
                </div>
              </div>
            </div>
            <div className="p-5 space-y-4">
              {credError && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-3 text-sm flex items-center gap-2"><AlertTriangle size={14} />{credError}</div>}
              <div>
                <label className="form-label">Staff ID</label>
                <input className="form-input font-mono uppercase" value={newStaffId} onChange={e => setNewStaffId(e.target.value.toUpperCase())} placeholder="e.g. TCH-001" />
                <p className="text-xs text-slate-400 mt-1">Current: <span className="font-mono font-semibold">{credTarget.staffId}</span></p>
              </div>
              <div>
                <label className="form-label">New Password <span className="text-slate-400 font-normal">(blank = keep current)</span></label>
                <div className="relative">
                  <input className="form-input pr-10" type={showNewPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Min 6 characters" />
                  <button type="button" onClick={() => setShowNewPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 text-xs text-indigo-700 dark:text-indigo-300">
                <p className="font-semibold mb-1">New login email will be:</p>
                <p className="font-mono break-all">{buildGeneratedEmail(credTarget.firstName, credTarget.lastName, newStaffId || credTarget.staffId)}</p>
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowCredModal(false)} className="flex-1 btn btn-secondary">Cancel</button>
                <button onClick={saveCredentials} disabled={credSaving} className="flex-1 btn btn-primary flex items-center justify-center gap-2">
                  {credSaving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Lock size={15} />}
                  Save Credentials
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
