import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Users, Plus, Eye, EyeOff, Trash2, Edit2, Shield, History, CheckCircle, XCircle, Copy, RefreshCw } from 'lucide-react';
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
  const [form, setForm] = useState({ firstName: '', lastName: '', role: 'teacher', email: '', phone: '', password: '', allowedPages: ROLE_PRESETS.teacher, isReadOnly: false });

  useEffect(() => { loadData(); }, [tenantId]);

  async function loadData() {
    if (!supabase || !tenantId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [staffRes, logRes] = await Promise.all([
        supabase.from('school_staff_users').select('*').eq('school_id', tenantId).order('created_at', { ascending: false }),
        supabase.from('staff_activity_log').select('*').eq('school_id', tenantId).order('created_at', { ascending: false }).limit(200),
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
    const prefix: Record<string,string> = { teacher:'TCH', accountant:'ACC', librarian:'LIB', receptionist:'RCP', custom:'STF' };
    return (prefix[role] || 'STF') + '-' + String(count + 1).padStart(3, '0');
  }

  function openAdd() {
    setForm({ firstName:'', lastName:'', role:'teacher', email:'', phone:'', password:'', allowedPages: ROLE_PRESETS.teacher, isReadOnly: false });
    setEditingStaff(null); setShowAddModal(true); setError(''); setSuccess('');
  }
  function openEdit(s: StaffUser) {
    setForm({ firstName:s.firstName, lastName:s.lastName, role:s.role, email:s.email, phone:s.phone, password:'', allowedPages:s.allowedPages, isReadOnly: s.isReadOnly });
    setEditingStaff(s); setShowAddModal(true); setError('');
  }

  async function saveStaff() {
    if (!form.firstName.trim() || !form.lastName.trim()) { setError('First and last name required'); return; }
    if (!editingStaff && form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
    if (!supabase) return;
    setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      if (editingStaff) {
        const update: any = { first_name: form.firstName.trim(), last_name: form.lastName.trim(), role: form.role, email: form.email.trim(), phone: form.phone.trim(), allowed_pages: form.allowedPages, is_read_only: form.isReadOnly, updated_at: now };
        if (form.password.length >= 6) update.password_hash = await hashPassword(form.password);
        // Regenerate email if name changed
        const newGenEmail = buildGeneratedEmail(form.firstName.trim(), form.lastName.trim(), editingStaff.staffId);
        update.generated_email = newGenEmail;
        await supabase.from('school_staff_users').update(update).eq('id', editingStaff.id);
        await logStaffActivity(tenantId, user?.id || '', 'admin', 'edit_staff', 'Edited staff: ' + editingStaff.staffId);
        setSuccess('Staff updated');
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
        await logStaffActivity(tenantId, user?.id || '', 'admin', 'create_staff', 'Created staff: ' + staffId);
        setSuccess(`Staff created. ID: ${staffId} · Login email: ${genEmail}`);
      }
      setShowAddModal(false); await loadData();
    } catch (e: any) { setError(e.message || 'Failed to save'); }
    finally { setSaving(false); }
  }

  async function toggleActive(s: StaffUser) {
    if (!supabase) return;
    await supabase.from('school_staff_users').update({ is_active: !s.isActive, updated_at: new Date().toISOString() }).eq('id', s.id);
    await logStaffActivity(tenantId, user?.id || '', 'admin', s.isActive ? 'deactivate' : 'activate', (s.isActive ? 'Deactivated' : 'Activated') + ': ' + s.staffId);
    await loadData();
  }

  async function deleteStaff(s: StaffUser) {
    if (!supabase || !confirm('Delete ' + s.firstName + ' ' + s.lastName + '?')) return;
    await supabase.from('school_staff_users').delete().eq('id', s.id);
    await logStaffActivity(tenantId, user?.id || '', 'admin', 'delete_staff', 'Deleted: ' + s.staffId);
    await loadData();
  }

  function copyId(id: string) {
    navigator.clipboard.writeText(id).catch(() => {});
    setCopiedId(id); setTimeout(() => setCopiedId(''), 2000);
  }

  const roleColor: Record<string,string> = {
    teacher: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    accountant: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    librarian: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
    receptionist: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    custom: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">Roles & Staff Access</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Manage staff accounts, permissions, and activity history</p>
        </div>
        {!isStaffMode && <button onClick={openAdd} className="btn btn-primary flex items-center gap-2"><Plus size={16}/>Add Staff</button>}
      </div>

      {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-3 text-sm">{error}</div>}
      {success && <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-300 rounded-xl p-3 text-sm flex items-center gap-2"><CheckCircle size={16}/>{success}</div>}

      {!isStaffMode && (
        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
          {(['staff','history'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab===tab ? 'border-primary-500 text-primary-600 dark:text-primary-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>
              {tab==='staff' ? <><Users size={14} className="inline mr-1.5"/>Staff ({staffList.length})</> : <><History size={14} className="inline mr-1.5"/>Activity Log</>}
            </button>
          ))}
        </div>
      )}

      {(activeTab==='staff' || isStaffMode) && (
        <div className="space-y-3">
          {loading ? <div className="flex items-center justify-center h-32"><div className="w-7 h-7 border-4 border-slate-200 dark:border-slate-700 border-t-primary-500 rounded-full animate-spin"/></div>
          : staffList.length===0 ? (
            <div className="card p-8 text-center"><Users size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3"/><p className="text-slate-500 dark:text-slate-400 text-sm">No staff accounts yet.</p></div>
          ) : staffList.map(s => (
            <div key={s.id} className="card p-4">
              <div className="flex items-start gap-4 flex-wrap">
                <div className="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-bold text-sm flex-shrink-0">{s.firstName[0]}{s.lastName[0]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900 dark:text-white">{s.firstName} {s.lastName}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColor[s.role]||roleColor.custom}`}>{s.role}</span>
                    {!s.isActive && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300">Inactive</span>}
                    {s.isReadOnly && <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 flex items-center gap-1"><Eye size={10}/>Read Only</span>}
                  </div>
                  <button onClick={() => copyId(s.staffId)} className="flex items-center gap-1 text-xs font-mono text-slate-500 dark:text-slate-400 hover:text-primary-600 dark:hover:text-primary-400 mt-1">
                    <Shield size={11}/>{s.staffId}{copiedId===s.staffId ? <CheckCircle size={11} className="text-green-500"/> : <Copy size={11}/>}
                  </button>
                  {/* Generated email — click to copy */}
                  <button onClick={() => copyId(s.generatedEmail)} className="flex items-center gap-1 text-xs text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 mt-0.5 font-mono">
                    <Shield size={10}/>{s.generatedEmail}{copiedId===s.generatedEmail ? <CheckCircle size={10} className="text-green-500"/> : <Copy size={10}/>}
                  </button>
                  {/* Last login */}
                  {s.lastLoginAt && (
                    <p className="text-xs text-slate-400 mt-0.5">Last login: {new Date(s.lastLoginAt).toLocaleString()}</p>
                  )}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {s.allowedPages.slice(0,5).map(p => <span key={p} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{p==='/'?'Dashboard':p.replace('/','')}</span>)}
                    {s.allowedPages.length>5 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">+{s.allowedPages.length-5} more</span>}
                  </div>
                </div>
                {!isStaffMode && (
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    {/* Read-only toggle */}
                    <button
                      onClick={async () => {
                        if (!supabase) return;
                        await supabase.from('school_staff_users').update({ is_read_only: !s.isReadOnly, updated_at: new Date().toISOString() }).eq('id', s.id);
                        await logStaffActivity(tenantId, user?.id || '', 'admin', 'toggle_readonly', (s.isReadOnly ? 'Removed read-only from' : 'Set read-only on') + ': ' + s.staffId);
                        await loadData();
                      }}
                      title={s.isReadOnly ? 'Remove read-only' : 'Set read-only'}
                      className={`p-2 rounded-lg text-xs flex items-center gap-1 transition-colors ${s.isReadOnly ? 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-900/20 hover:text-amber-600' : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-600'}`}
                    >
                      <Eye size={14}/>
                    </button>
                    <button onClick={() => openEdit(s)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-slate-500"><Edit2 size={15}/></button>
                    <button onClick={() => toggleActive(s)} className={`p-2 rounded-lg ${s.isActive?'text-green-500 hover:text-red-500':'text-red-500 hover:text-green-500'}`}>{s.isActive?<CheckCircle size={15}/>:<XCircle size={15}/>}</button>
                    <button onClick={() => deleteStaff(s)} className="p-2 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg text-slate-400 hover:text-red-500"><Trash2 size={15}/></button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab==='history' && !isStaffMode && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2"><History size={15} className="text-primary-500"/>Activity History</h2>
            <button onClick={loadData} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"><RefreshCw size={14} className="text-slate-400"/></button>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto">
            {activityLog.length===0 ? <p className="px-4 py-8 text-center text-sm text-slate-400">No activity yet</p>
            : activityLog.map(log => (
              <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0"><History size={13} className="text-slate-400"/></div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-900 dark:text-white">{log.description}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-slate-400 font-mono">{log.staffId}</span>
                    <span className="text-xs text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${log.action==='login'?'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300':log.action==='logout'?'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300':'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'}`}>{log.action}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-lg bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-modal-in max-h-[90vh] overflow-y-auto">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
              <div className="w-9 h-9 bg-primary-100 dark:bg-primary-900/30 rounded-xl flex items-center justify-center"><Users size={18} className="text-primary-600 dark:text-primary-400"/></div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white">{editingStaff?'Edit Staff':'Add Staff Member'}</h2>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl p-3 text-sm">{error}</div>}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">First Name *</label><input className="form-input" value={form.firstName} onChange={e=>setForm(f=>({...f,firstName:e.target.value}))} placeholder="John"/></div>
                <div><label className="form-label">Last Name *</label><input className="form-input" value={form.lastName} onChange={e=>setForm(f=>({...f,lastName:e.target.value}))} placeholder="Doe"/></div>
              </div>
              <div>
                <label className="form-label">Role</label>
                <select className="form-input" value={form.role} onChange={e=>setForm(f=>({...f,role:e.target.value,allowedPages:ROLE_PRESETS[e.target.value]||[]}))}>
                  <option value="teacher">Teacher</option><option value="accountant">Accountant</option>
                  <option value="librarian">Librarian</option><option value="receptionist">Receptionist</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="form-label">Email</label><input className="form-input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="staff@school.com"/></div>
                <div><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="07XXXXXXXX"/></div>
              </div>
              <div>
                <label className="form-label">{editingStaff?'New Password (blank = keep)':'Password *'}</label>
                <div className="relative">
                  <input className="form-input pr-10" type={showPassword?'text':'password'} value={form.password} onChange={e=>setForm(f=>({...f,password:e.target.value}))} placeholder={editingStaff?'Leave blank to keep':'Min 6 characters'}/>
                  <button type="button" onClick={()=>setShowPassword(v=>!v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{showPassword?<EyeOff size={16}/>:<Eye size={16}/>}</button>
                </div>
              </div>
              <div>
                <label className="form-label">Page Access</label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  {ALL_PAGES.map(p => (
                    <label key={p.path} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={form.allowedPages.includes(p.path)} onChange={e=>setForm(f=>({...f,allowedPages:e.target.checked?[...f.allowedPages,p.path]:f.allowedPages.filter(x=>x!==p.path)}))} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"/>
                      <span className="text-sm text-slate-700 dark:text-slate-300">{p.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* Read-only toggle */}
              <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                <input type="checkbox" checked={form.isReadOnly} onChange={e=>setForm(f=>({...f,isReadOnly:e.target.checked}))} className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"/>
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-1.5"><Eye size={14}/>Read-Only Mode</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Staff can view pages but cannot create, edit, or delete data</p>
                </div>
              </label>
              <div className="flex gap-3 pt-2">
                <button onClick={()=>setShowAddModal(false)} className="flex-1 btn btn-secondary">Cancel</button>
                <button onClick={saveStaff} disabled={saving} className="flex-1 btn btn-primary flex items-center justify-center gap-2">
                  {saving?<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>:<CheckCircle size={16}/>}
                  {editingStaff?'Save Changes':'Create Account'}
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
