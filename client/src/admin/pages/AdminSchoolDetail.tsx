import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Users, GraduationCap,
  ShieldCheck, ShieldOff, Calendar, RefreshCw, AlertTriangle, Save,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS } from '../../utils/plans';
import { useAdminTheme } from '../AdminThemeContext';

interface SchoolDetail {
  schoolId: string;
  schoolName: string;
  email: string;
  plan: string | null;
  subId: string | null;
  status: 'active' | 'expired' | 'no_plan';
  endsAt: string | null;
  startsAt: string | null;
  studentCount: number;
  userCount: number;
  createdAt: string;
  isActive: boolean;
}

export default function AdminSchoolDetail() {
  const { schoolId } = useParams<{ schoolId: string }>();
  const navigate = useNavigate();
  const { isDark, t } = useAdminTheme();
  const [detail, setDetail] = useState<SchoolDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showGrantModal, setShowGrantModal] = useState(false);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);

  // Grant/extend form state
  const [grantPlan, setGrantPlan] = useState('nursery_primary');
  const [grantMonths, setGrantMonths] = useState(3);
  const [extendMonths, setExtendMonths] = useState(3);

  useEffect(() => { if (schoolId) loadDetail(); }, [schoolId]);

  async function loadDetail() {
    if (!supabase || !schoolId) return;
    setLoading(true);
    try {
      const [usersRes, subsRes, studentsRes, settingsRes] = await Promise.all([
        supabase.from('users').select('id, email, is_active, created_at').eq('school_id', schoolId),
        supabase.from('subscriptions').select('*').eq('school_id', schoolId).order('updated_at', { ascending: false }).limit(1),
        supabase.from('students').select('id, status').eq('school_id', schoolId),
        supabase.from('settings').select('key, value').eq('school_id', schoolId).eq('key', 'schoolName'),
      ]);

      const users = usersRes.data || [];
      const sub = (subsRes.data || [])[0] || null;
      const students = studentsRes.data || [];
      const settings = settingsRes.data || [];

      const schoolName = settings.find((s: any) => s.key === 'schoolName')?.value || 'Unnamed School';
      const email = users[0]?.email || '—';
      const now = Date.now();

      let status: SchoolDetail['status'] = 'no_plan';
      if (sub) {
        const ends = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;
        status = ends > now ? 'active' : 'expired';
      }

      setDetail({
        schoolId,
        schoolName: String(schoolName),
        email,
        plan: sub?.plan || null,
        subId: sub?.id || null,
        status,
        endsAt: sub?.ends_at || null,
        startsAt: sub?.starts_at || null,
        studentCount: students.filter((s: any) => s.status !== 'completed').length,
        userCount: users.length,
        createdAt: users[0]?.created_at || '',
        isActive: users[0]?.is_active ?? true,
      });

      if (sub?.plan) setGrantPlan(sub.plan);
    } catch (err: any) {
      setError(err.message || 'Failed to load school');
    } finally {
      setLoading(false);
    }
  }

  async function grantAccess() {
    if (!supabase || !schoolId || !detail) return;
    setSaving(true);
    setError('');
    try {
      const now = new Date();
      const endsAt = new Date(now);
      endsAt.setMonth(endsAt.getMonth() + grantMonths);

      const subData = {
        school_id: schoolId,
        user_id: schoolId,
        plan: grantPlan,
        status: 'active',
        starts_at: now.toISOString(),
        ends_at: endsAt.toISOString(),
        updated_at: now.toISOString(),
        metadata: { grantedByAdmin: true, grantedAt: now.toISOString() },
      };

      if (detail.subId) {
        await supabase.from('subscriptions').update({ ...subData }).eq('id', detail.subId);
      } else {
        await supabase.from('subscriptions').insert({ ...subData, id: crypto.randomUUID(), created_at: now.toISOString() });
      }

      // Also save to settings for offline access
      await supabase.from('settings').upsert([
        { school_id: schoolId, key: 'subscriptionPlanId', value: grantPlan, updated_at: now.toISOString() },
        { school_id: schoolId, key: 'subscriptionExpiryDate', value: endsAt.toISOString(), updated_at: now.toISOString() },
        { school_id: schoolId, key: 'subscriptionPlanEligible', value: true, updated_at: now.toISOString() },
      ], { onConflict: 'school_id,key' });

      setSuccess(`Access granted: ${PLAN_DEFINITIONS.find(p => p.id === grantPlan)?.name} for ${grantMonths} months`);
      setShowGrantModal(false);
      await loadDetail();
    } catch (err: any) {
      setError(err.message || 'Failed to grant access');
    } finally {
      setSaving(false);
    }
  }

  async function pauseAccess() {
    if (!supabase || !schoolId || !detail?.subId) return;
    setSaving(true);
    setError('');
    try {
      const now = new Date();
      // Set expiry to past to effectively expire the subscription
      const pastDate = new Date(now.getTime() - 1000);
      await supabase.from('subscriptions').update({
        ends_at: pastDate.toISOString(),
        status: 'paused',
        updated_at: now.toISOString(),
        metadata: { pausedByAdmin: true, pausedAt: now.toISOString() },
      }).eq('id', detail.subId);

      await supabase.from('settings').upsert([
        { school_id: schoolId, key: 'subscriptionExpiryDate', value: pastDate.toISOString(), updated_at: now.toISOString() },
        { school_id: schoolId, key: 'subscriptionPlanEligible', value: false, updated_at: now.toISOString() },
      ], { onConflict: 'school_id,key' });

      setSuccess('Access paused successfully');
      setShowPauseModal(false);
      await loadDetail();
    } catch (err: any) {
      setError(err.message || 'Failed to pause access');
    } finally {
      setSaving(false);
    }
  }

  async function extendAccess() {
    if (!supabase || !schoolId || !detail) return;
    setSaving(true);
    setError('');
    try {
      const now = new Date();
      const base = detail.endsAt && new Date(detail.endsAt) > now ? new Date(detail.endsAt) : now;
      const newEndsAt = new Date(base);
      newEndsAt.setMonth(newEndsAt.getMonth() + extendMonths);

      if (detail.subId) {
        await supabase.from('subscriptions').update({
          ends_at: newEndsAt.toISOString(),
          status: 'active',
          updated_at: now.toISOString(),
          metadata: { extendedByAdmin: true, extendedAt: now.toISOString() },
        }).eq('id', detail.subId);
      }

      await supabase.from('settings').upsert([
        { school_id: schoolId, key: 'subscriptionExpiryDate', value: newEndsAt.toISOString(), updated_at: now.toISOString() },
        { school_id: schoolId, key: 'subscriptionPlanEligible', value: true, updated_at: now.toISOString() },
      ], { onConflict: 'school_id,key' });

      setSuccess(`Subscription extended by ${extendMonths} months`);
      setShowExtendModal(false);
      await loadDetail();
    } catch (err: any) {
      setError(err.message || 'Failed to extend access');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className={`w-8 h-8 border-4 ${isDark ? 'border-slate-700' : 'border-slate-200'} border-t-indigo-500 rounded-full animate-spin`} />
    </div>
  );

  if (!detail) return (
    <div className={`text-center py-12 ${t.muted}`}>School not found</div>
  );

  const statusBadge = () => {
    if (detail.status === 'active') return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${t.badge('green')}`}><CheckCircle size={14} />Active</span>;
    if (detail.status === 'expired') return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${t.badge('red')}`}><XCircle size={14} />Expired</span>;
    return <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${t.badge('amber')}`}><Clock size={14} />No Plan</span>;
  };

  const cardBg = `${t.surface} border rounded-2xl`;
  const statBg = isDark ? 'bg-slate-800/50' : 'bg-slate-50';

  return (
    <div className="space-y-6 max-w-3xl">
      <button onClick={() => navigate('/admin/schools')}
        className={`flex items-center gap-2 text-sm transition-colors ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-900'}`}
      >
        <ArrowLeft size={16} /> Back to Schools
      </button>

      {error && <div className={`rounded-xl p-4 text-sm ${isDark ? 'bg-red-900/20 border border-red-800 text-red-300' : 'bg-red-50 border border-red-200 text-red-700'}`}>{error}</div>}
      {success && <div className={`rounded-xl p-4 text-sm flex items-center gap-2 ${isDark ? 'bg-green-900/20 border border-green-800 text-green-300' : 'bg-green-50 border border-green-200 text-green-700'}`}><CheckCircle size={16} />{success}</div>}

      {/* Header card */}
      <div className={`${cardBg} p-6`}>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className={`text-xl font-bold ${t.text}`}>{detail.schoolName}</h1>
            <p className={`text-sm mt-1 ${t.muted}`}>{detail.email}</p>
            <p className={`text-xs mt-1 font-mono ${t.subtle}`}>{detail.schoolId}</p>
          </div>
          {statusBadge()}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Students', value: detail.studentCount, icon: GraduationCap },
            { label: 'Users', value: detail.userCount, icon: Users },
            { label: 'Plan', value: PLAN_DEFINITIONS.find(p => p.id === detail.plan)?.name || 'None', icon: ShieldCheck },
            { label: 'Expires', value: detail.endsAt ? new Date(detail.endsAt).toLocaleDateString() : '—', icon: Calendar },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className={`${statBg} rounded-xl p-3`}>
              <div className="flex items-center gap-2 mb-1">
                <Icon size={13} className={t.muted} />
                <span className={`text-xs ${t.muted}`}>{label}</span>
              </div>
              <p className={`font-semibold text-sm ${t.text}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Access Management */}
      <div className={`${cardBg} p-6`}>
        <h2 className={`text-sm font-semibold ${t.text} mb-4`}>Access Management</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button onClick={() => setShowGrantModal(true)}
            className="flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-emerald-500/20"
          >
            <ShieldCheck size={15} /> Grant
          </button>
          <button onClick={() => setShowExtendModal(true)} disabled={!detail.subId}
            className="flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-indigo-500/20"
          >
            <RefreshCw size={15} /> Extend
          </button>
          <button onClick={() => setShowPauseModal(true)} disabled={detail.status !== 'active'}
            className="flex items-center justify-center gap-2 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-amber-500/20"
          >
            <ShieldOff size={15} /> Pause
          </button>
          <button onClick={async () => {
            if (!supabase || !schoolId) return;
            setSaving(true);
            try {
              const now = new Date();
              const past = new Date(now.getTime() - 1000).toISOString();
              if (detail.subId) {
                await supabase.from('subscriptions').update({
                  ends_at: past, status: 'revoked', updated_at: now.toISOString(),
                  metadata: { revokedByAdmin: true, revokedAt: now.toISOString() },
                }).eq('id', detail.subId);
              }
              await supabase.from('settings').upsert([
                { school_id: schoolId, key: 'subscriptionExpiryDate', value: past, updated_at: now.toISOString() },
                { school_id: schoolId, key: 'subscriptionPlanEligible', value: false, updated_at: now.toISOString() },
              ], { onConflict: 'school_id,key' });
              setSuccess('Access revoked — school must resubscribe');
              await loadDetail();
            } catch (err: any) { setError(err.message); }
            finally { setSaving(false); }
          }} disabled={saving || detail.status !== 'active'}
            className="flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-red-500/20"
          >
            <ShieldOff size={15} /> Revoke
          </button>
        </div>
        <p className={`text-xs ${t.subtle} mt-3`}>
          Changes take effect immediately. School sees updated status on next app load or sync.
        </p>
      </div>

      {/* Grant Modal */}
      {showGrantModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-sm ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl shadow-2xl`}>
            <div className={`p-5 border-b ${t.divider} flex items-center gap-3`}>
              <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center"><ShieldCheck size={18} className="text-emerald-600" /></div>
              <h2 className={`text-base font-bold ${t.text}`}>Grant Access</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className={`block text-xs font-medium ${t.muted} mb-1.5`}>Plan</label>
                <select value={grantPlan} onChange={e => setGrantPlan(e.target.value)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${t.input}`}
                >
                  {PLAN_DEFINITIONS.map(p => <option key={p.id} value={p.id}>{p.name} (up to {p.studentLimit} students)</option>)}
                </select>
              </div>
              <div>
                <label className={`block text-xs font-medium ${t.muted} mb-1.5`}>Duration (months)</label>
                <select value={grantMonths} onChange={e => setGrantMonths(Number(e.target.value))}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 ${t.input}`}
                >
                  {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowGrantModal(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
                <button onClick={grantAccess} disabled={saving} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />} Grant
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Extend Modal */}
      {showExtendModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-sm ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl shadow-2xl`}>
            <div className={`p-5 border-b ${t.divider} flex items-center gap-3`}>
              <div className="w-9 h-9 bg-indigo-100 rounded-xl flex items-center justify-center"><RefreshCw size={18} className="text-indigo-600" /></div>
              <h2 className={`text-base font-bold ${t.text}`}>Extend Access</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className={`text-sm ${t.muted}`}>Current expiry: <span className={`font-medium ${t.text}`}>{detail.endsAt ? new Date(detail.endsAt).toLocaleDateString() : '—'}</span></p>
              <div>
                <label className={`block text-xs font-medium ${t.muted} mb-1.5`}>Extend by (months)</label>
                <select value={extendMonths} onChange={e => setExtendMonths(Number(e.target.value))}
                  className={`w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${t.input}`}
                >
                  {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExtendModal(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
                <button onClick={extendAccess} disabled={saving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />} Extend
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Pause Modal */}
      {showPauseModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-sm ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl shadow-2xl`}>
            <div className={`p-5 border-b ${t.divider} flex items-center gap-3`}>
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center"><AlertTriangle size={18} className="text-red-600" /></div>
              <h2 className={`text-base font-bold ${t.text}`}>Pause Access</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className={`text-sm ${t.muted}`}>
                This will immediately block <strong className={t.text}>{detail.schoolName}</strong> from accessing the app until access is re-granted.
              </p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPauseModal(false)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>Cancel</button>
                <button onClick={pauseAccess} disabled={saving} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldOff size={14} />} Pause
                </button>
              </div>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
