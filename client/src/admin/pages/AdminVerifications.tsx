import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardCheck, CheckCircle, XCircle, Clock, RefreshCw,
  ShieldCheck, ShieldOff, Eye, AlertTriangle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS } from '../../utils/plans';
import { useAdminTheme } from '../AdminThemeContext';

interface PendingVerification {
  id: string;
  schoolId: string;
  schoolName: string;
  email: string;
  plan: string;
  billingCycle: string;
  amount: string | number;
  transactionId?: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  endsAt: string | null;
}

export default function AdminVerifications() {
  const { theme } = useAdminTheme();
  const isDark = theme === 'dark';
  const [items, setItems] = useState<PendingVerification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [selected, setSelected] = useState<PendingVerification | null>(null);
  const [saving, setSaving] = useState(false);
  const [grantMonths, setGrantMonths] = useState(3);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { load(); }, []);

  async function load() {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    try {
      // Subscriptions with status 'pending' or metadata.source = 'client' (submitted by school)
      const [subsRes, settingsRes, usersRes] = await Promise.all([
        supabase.from('subscriptions').select('*').order('created_at', { ascending: false }),
        supabase.from('settings').select('school_id, key, value').in('key', ['schoolName', 'subscriptionReceipt']),
        supabase.from('users').select('school_id, email'),
      ]);

      const subs = subsRes.data || [];
      const settings = settingsRes.data || [];
      const users = usersRes.data || [];

      const schoolNames: Record<string, string> = {};
      const schoolReceipts: Record<string, any> = {};
      settings.forEach((s: any) => {
        if (s.key === 'schoolName') schoolNames[s.school_id] = String(s.value);
        if (s.key === 'subscriptionReceipt') {
          try { schoolReceipts[s.school_id] = typeof s.value === 'string' ? JSON.parse(s.value) : s.value; } catch {}
        }
      });

      const schoolEmails: Record<string, string> = {};
      users.forEach((u: any) => { if (!schoolEmails[u.school_id]) schoolEmails[u.school_id] = u.email; });

      const rows: PendingVerification[] = subs.map((sub: any) => {
        const meta = sub.metadata || {};
        const receipt = schoolReceipts[sub.school_id] || {};
        const now = Date.now();
        const ends = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;

        // Determine verification status
        let status: PendingVerification['status'] = 'pending';
        if (meta.approvedByAdmin) status = 'approved';
        else if (meta.rejectedByAdmin) status = 'rejected';
        else if (meta.grantedByAdmin || meta.extendedByAdmin) status = 'approved';
        else if (sub.status === 'active' && ends > now) status = 'approved';

        return {
          id: sub.id,
          schoolId: sub.school_id,
          schoolName: schoolNames[sub.school_id] || 'Unnamed School',
          email: schoolEmails[sub.school_id] || '—',
          plan: sub.plan || receipt.planId || 'unknown',
          billingCycle: meta.billingCycle || receipt.billingCycle || '—',
          amount: receipt.amount || '—',
          transactionId: meta.transactionId || receipt.transactionId || undefined,
          submittedAt: sub.created_at || sub.updated_at,
          status,
          endsAt: sub.ends_at,
        };
      });

      setItems(rows);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function approve(item: PendingVerification) {
    if (!supabase) return;
    setSaving(true); setError('');
    try {
      const now = new Date();
      const base = item.endsAt && new Date(item.endsAt) > now ? new Date(item.endsAt) : now;
      const newEndsAt = new Date(base);
      newEndsAt.setMonth(newEndsAt.getMonth() + grantMonths);

      await supabase.from('subscriptions').update({
        status: 'active',
        ends_at: newEndsAt.toISOString(),
        updated_at: now.toISOString(),
        metadata: { approvedByAdmin: true, approvedAt: now.toISOString(), billingCycle: item.billingCycle },
      }).eq('id', item.id);

      await supabase.from('settings').upsert([
        { school_id: item.schoolId, key: 'subscriptionPlanId', value: item.plan, updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionExpiryDate', value: newEndsAt.toISOString(), updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionPlanEligible', value: true, updated_at: now.toISOString() },
      ], { onConflict: 'school_id,key' });

      setSuccess(`Approved: ${item.schoolName} — access granted for ${grantMonths} months`);
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function reject(item: PendingVerification) {
    if (!supabase) return;
    setSaving(true); setError('');
    try {
      const now = new Date();
      const past = new Date(now.getTime() - 1000);
      await supabase.from('subscriptions').update({
        status: 'rejected',
        ends_at: past.toISOString(),
        updated_at: now.toISOString(),
        metadata: { rejectedByAdmin: true, rejectedAt: now.toISOString() },
      }).eq('id', item.id);

      await supabase.from('settings').upsert([
        { school_id: item.schoolId, key: 'subscriptionPlanEligible', value: false, updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionExpiryDate', value: past.toISOString(), updated_at: now.toISOString() },
      ], { onConflict: 'school_id,key' });

      setSuccess(`Rejected: ${item.schoolName}`);
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const filtered = items.filter(i => filter === 'all' || i.status === filter);
  const pendingCount = items.filter(i => i.status === 'pending').length;

  // Theme
  const card = isDark ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200';
  const textPrimary = isDark ? 'text-white' : 'text-slate-900';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-500';
  const rowHover = isDark ? 'hover:bg-slate-800/40' : 'hover:bg-slate-50';
  const thClass = `text-left px-5 py-3 text-xs font-medium ${textMuted}`;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${textPrimary}`}>Verifications</h1>
          <p className={`text-sm mt-1 ${textMuted}`}>
            Review and approve school subscription payments
            {pendingCount > 0 && <span className="ml-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded-full">{pendingCount} pending</span>}
          </p>
        </div>
        <button onClick={load} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {error && <div className="bg-red-900/20 border border-red-800 rounded-xl p-4 text-red-300 text-sm">{error}</div>}
      {success && <div className="bg-green-900/20 border border-green-800 rounded-xl p-4 text-green-300 text-sm flex items-center gap-2"><CheckCircle size={16} />{success}</div>}

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {(['pending', 'approved', 'rejected', 'all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-xs font-medium transition-all ${filter === f
              ? f === 'pending' ? 'bg-amber-500 text-white'
                : f === 'approved' ? 'bg-green-600 text-white'
                : f === 'rejected' ? 'bg-red-600 text-white'
                : 'bg-indigo-600 text-white'
              : isDark ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            {f.charAt(0).toUpperCase() + f.slice(1)}
            {f === 'pending' && pendingCount > 0 && ` (${pendingCount})`}
          </button>
        ))}
      </div>

      <div className={`${card} border rounded-xl overflow-hidden`}>
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                  <th className={thClass}>School</th>
                  <th className={thClass}>Plan</th>
                  <th className={thClass}>Amount</th>
                  <th className={thClass}>TID</th>
                  <th className={thClass}>Submitted</th>
                  <th className={thClass}>Status</th>
                  <th className={thClass}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(item => (
                  <tr key={item.id} className={`border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'} ${rowHover}`}>
                    <td className="px-5 py-3">
                      <p className={`font-medium text-sm ${textPrimary}`}>{item.schoolName}</p>
                      <p className={`text-xs ${textMuted}`}>{item.email}</p>
                    </td>
                    <td className={`px-5 py-3 text-sm ${textPrimary} capitalize`}>
                      {PLAN_DEFINITIONS.find(p => p.id === item.plan)?.name || item.plan}
                    </td>
                    <td className={`px-5 py-3 text-sm ${textPrimary}`}>${item.amount}</td>
                    <td className={`px-5 py-3 text-xs font-mono ${textMuted}`}>{item.transactionId || '—'}</td>
                    <td className={`px-5 py-3 text-xs ${textMuted}`}>{new Date(item.submittedAt).toLocaleString()}</td>
                    <td className="px-5 py-3">
                      {item.status === 'pending' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-900/40 text-amber-400"><Clock size={10} />Pending</span>}
                      {item.status === 'approved' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-900/40 text-green-400"><CheckCircle size={10} />Approved</span>}
                      {item.status === 'rejected' && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-900/40 text-red-400"><XCircle size={10} />Rejected</span>}
                    </td>
                    <td className="px-5 py-3">
                      <button onClick={() => setSelected(item)} className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-900/20 transition-colors">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!filtered.length && (
                  <tr><td colSpan={7} className={`px-5 py-12 text-center text-sm ${textMuted}`}>No {filter === 'all' ? '' : filter} verifications</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail modal */}
      {selected && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`w-full max-w-md ${isDark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'} border rounded-2xl shadow-2xl`}>
            <div className={`p-5 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'} flex items-center gap-3`}>
              <ClipboardCheck size={20} className="text-indigo-400" />
              <h2 className={`text-base font-bold ${textPrimary}`}>Review Submission</h2>
              <button onClick={() => setSelected(null)} className="ml-auto p-1.5 rounded-lg hover:bg-slate-800/50"><X size={16} /></button>
            </div>
            <div className="p-5 space-y-3">
              {[
                ['School', selected.schoolName],
                ['Email', selected.email],
                ['Plan', PLAN_DEFINITIONS.find(p => p.id === selected.plan)?.name || selected.plan],
                ['Billing', selected.billingCycle],
                ['Amount', `$${selected.amount}`],
                ['Transaction ID', selected.transactionId || 'Not provided'],
                ['Submitted', new Date(selected.submittedAt).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className={`flex justify-between text-sm border-b ${isDark ? 'border-slate-800' : 'border-slate-100'} pb-2`}>
                  <span className={textMuted}>{k}</span>
                  <span className={`font-medium ${textPrimary}`}>{v}</span>
                </div>
              ))}

              {selected.status === 'pending' && (
                <div className="pt-2">
                  <label className={`block text-xs font-medium ${textMuted} mb-1.5`}>Grant access for (months)</label>
                  <select value={grantMonths} onChange={e => setGrantMonths(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  >
                    {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSelected(null)} className={`flex-1 py-2.5 rounded-xl text-sm font-medium ${isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-300' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                  Close
                </button>
                {selected.status === 'pending' && (
                  <>
                    <button onClick={() => reject(selected)} disabled={saving}
                      className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                      {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldOff size={14} />}
                      Reject
                    </button>
                    <button onClick={() => approve(selected)} disabled={saving}
                      className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-xl text-sm font-medium flex items-center justify-center gap-2">
                      {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <ShieldCheck size={14} />}
                      Approve
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// Need X import
function X({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
