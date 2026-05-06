import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle, XCircle, Clock, Users, GraduationCap,
  ShieldCheck, ShieldOff, Calendar, RefreshCw, AlertTriangle, Save,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS } from '../../utils/plans';

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
      <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
    </div>
  );

  if (!detail) return (
    <div className="text-slate-400 text-center py-12">School not found</div>
  );

  const statusBadge = () => {
    if (detail.status === 'active') return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-green-900/40 text-green-400 border border-green-800"><CheckCircle size={14} />Active</span>;
    if (detail.status === 'expired') return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-red-900/40 text-red-400 border border-red-800"><XCircle size={14} />Expired</span>;
    return <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium bg-amber-900/40 text-amber-400 border border-amber-800"><Clock size={14} />No Plan</span>;
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Back */}
      <button
        onClick={() => navigate('/admin/schools')}
        className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Back to Schools
      </button>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}
      {success && <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-green-300 text-sm flex items-center gap-2"><CheckCircle size={16} />{success}</div>}

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white">{detail.schoolName}</h1>
            <p className="text-slate-400 text-sm mt-1">{detail.email}</p>
            <p className="text-slate-600 text-xs mt-1 font-mono">{detail.schoolId}</p>
          </div>
          {statusBadge()}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          {[
            { label: 'Students', value: detail.studentCount, icon: GraduationCap },
            { label: 'Users', value: detail.userCount, icon: Users },
            { label: 'Plan', value: PLAN_DEFINITIONS.find(p => p.id === detail.plan)?.name || 'None', icon: ShieldCheck },
            { label: 'Expires', value: detail.endsAt ? new Date(detail.endsAt).toLocaleDateString() : '—', icon: Calendar },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="bg-slate-800/50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon size={14} className="text-slate-400" />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              <p className="text-white font-semibold text-sm">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
        <h2 className="text-sm font-semibold text-white mb-4">Access Management</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={() => setShowGrantModal(true)}
            className="flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-medium transition-all"
          >
            <ShieldCheck size={16} /> Grant Access
          </button>
          <button
            onClick={() => setShowExtendModal(true)}
            disabled={!detail.subId}
            className="flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all"
          >
            <RefreshCw size={16} /> Extend Access
          </button>
          <button
            onClick={() => setShowPauseModal(true)}
            disabled={detail.status !== 'active'}
            className="flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-sm font-medium transition-all"
          >
            <ShieldOff size={16} /> Pause Access
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3">
          Changes take effect immediately. The school will see the updated status on next app load.
        </p>
      </div>

      {/* Grant Modal */}
      {showGrantModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center gap-3">
              <ShieldCheck size={20} className="text-green-400" />
              <h2 className="text-base font-bold text-white">Grant Access</h2>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Plan</label>
                <select
                  value={grantPlan}
                  onChange={e => setGrantPlan(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {PLAN_DEFINITIONS.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (up to {p.studentLimit} students)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Duration (months)</label>
                <select
                  value={grantMonths}
                  onChange={e => setGrantMonths(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowGrantModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={grantAccess} disabled={saving} className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                  Grant
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Extend Modal */}
      {showExtendModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center gap-3">
              <RefreshCw size={20} className="text-indigo-400" />
              <h2 className="text-base font-bold text-white">Extend Access</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-400">
                Current expiry: <span className="text-white font-medium">{detail.endsAt ? new Date(detail.endsAt).toLocaleDateString() : '—'}</span>
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">Extend by (months)</label>
                <select
                  value={extendMonths}
                  onChange={e => setExtendMonths(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowExtendModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={extendAccess} disabled={saving} className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
                  Extend
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Pause Modal */}
      {showPauseModal && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex items-center gap-3">
              <AlertTriangle size={20} className="text-red-400" />
              <h2 className="text-base font-bold text-white">Pause Access</h2>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-slate-300">
                This will immediately block <strong className="text-white">{detail.schoolName}</strong> from accessing the app until access is re-granted.
              </p>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPauseModal(false)} className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium">Cancel</button>
                <button onClick={pauseAccess} disabled={saving} className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                  {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldOff size={14} />}
                  Pause
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
