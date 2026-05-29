import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ClipboardCheck, CheckCircle, XCircle, Clock, RefreshCw,
  ShieldCheck, ShieldOff, Eye, AlertTriangle, Ban, KeyRound,
  RotateCcw,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { PLAN_DEFINITIONS, UNLIMITED_PLAN_LABEL } from '../../utils/plans';
import {
  VERIFICATION_CONTROL_TENANT,
  VERIFICATION_TERMINATED_SETTING,
  getLocalTerminatedVerificationCodeHashes,
  getVerificationCodeCatalog,
  loadTerminatedVerificationCodeHashes,
  setLocalTerminatedVerificationCodeHashes,
} from '../../utils/paymentVerification';
import { useAdminTheme } from '../AdminThemeContext';

const UNLIMITED_PLAN_ID = 'unlimited';
const UNLIMITED_EXPIRY_YEAR = 2099;

interface PendingVerification {
  id: string;
  schoolId: string;
  schoolName: string;
  email: string;
  plan: string;
  billingCycle: string;
  amount: string | number;
  currency?: string;
  displayAmount?: string;
  transactionId?: string;
  submittedAt: string;
  status: 'pending' | 'approved' | 'rejected';
  endsAt: string | null;
}

interface VerificationCodeRow {
  label: string;
  codeHash: string;
  tokenHash: string;
  planId: string;
  planName: string;
  billingCycle: string;
  amount: number;
  used: boolean;
  terminated: boolean;
  usedBySchoolId?: string;
  usedBySchoolName?: string;
  usedByEmail?: string;
  usedAt?: string;
  subscriptionId?: string;
  subscriptionStatus?: string;
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
  const [codeRows, setCodeRows] = useState<VerificationCodeRow[]>([]);
  const [codeSearch, setCodeSearch] = useState('');
  const [codeFilter, setCodeFilter] = useState<'used' | 'terminated' | 'unused' | 'all'>('used');

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
          schoolId: String(sub.school_id || ''),
          schoolName: schoolNames[sub.school_id] || 'Unnamed School',
          email: schoolEmails[sub.school_id] || '—',
          plan: sub.plan || receipt.planId || 'unknown',
          billingCycle: meta.billingCycle || receipt.billingCycle || '—',
          amount: meta.amount ?? receipt.amount ?? '—',
          currency: meta.displayCurrency || receipt.displayCurrency || receipt.currency || undefined,
          displayAmount: meta.displayAmount || receipt.displayAmount || undefined,
          transactionId: meta.transactionId || receipt.transactionId || undefined,
          submittedAt: sub.created_at || sub.updated_at,
          status,
          endsAt: sub.ends_at,
        };
      });

      setItems(rows);
      const usedCodeDetails = new Map<string, Partial<VerificationCodeRow>>();
      subs.forEach((sub: any) => {
        const hash = sub?.metadata?.verificationCodeHash;
        if (typeof hash !== 'string' || !hash) return;
        if (usedCodeDetails.has(hash)) return;
        usedCodeDetails.set(hash, {
          usedBySchoolId: String(sub.school_id || ''),
          usedBySchoolName: schoolNames[sub.school_id] || 'Unnamed School',
          usedByEmail: schoolEmails[sub.school_id] || 'â€”',
          usedAt: sub.metadata?.activatedAt || sub.starts_at || sub.created_at || sub.updated_at,
          subscriptionId: sub.id,
          subscriptionStatus: sub.status,
        });
      });
      const terminatedHashes = new Set(await loadTerminatedVerificationCodeHashes());
      setCodeRows(getVerificationCodeCatalog().map((code) => ({
        ...code,
        ...usedCodeDetails.get(code.codeHash),
        used: usedCodeDetails.has(code.codeHash),
        terminated: terminatedHashes.has(code.codeHash),
      })));
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
      const selectedPlan = PLAN_DEFINITIONS.find(p => p.id === item.plan) || PLAN_DEFINITIONS[0];
      const isUnlimitedApproval = item.plan === UNLIMITED_PLAN_ID;
      if (isUnlimitedApproval) {
        newEndsAt.setFullYear(UNLIMITED_EXPIRY_YEAR, 11, 31);
        newEndsAt.setHours(23, 59, 59, 999);
      } else {
        newEndsAt.setMonth(newEndsAt.getMonth() + grantMonths);
      }

      await supabase.from('subscriptions').update({
        status: 'active',
        ends_at: newEndsAt.toISOString(),
        updated_at: now.toISOString(),
        metadata: {
          approvedByAdmin: true,
          approvedAt: now.toISOString(),
          billingCycle: item.billingCycle,
          accessType: isUnlimitedApproval ? 'one_time_desktop' : 'paid',
          planName: selectedPlan.name,
          planLimit: selectedPlan.studentLimit,
          unlimited: isUnlimitedApproval,
        },
      }).eq('id', item.id);

      await supabase.from('settings').upsert([
        { school_id: item.schoolId, key: 'subscriptionPlanId', value: item.plan, updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionExpiryDate', value: newEndsAt.toISOString(), updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionPlanEligible', value: true, updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionPlanLimit', value: selectedPlan.studentLimit, updated_at: now.toISOString() },
        { school_id: item.schoolId, key: 'subscriptionPlanName', value: selectedPlan.name, updated_at: now.toISOString() },
      ], { onConflict: 'school_id,key' });

      await supabase.from('schools').update({
        plan: item.plan,
        max_students: selectedPlan.studentLimit,
        updated_at: now.toISOString(),
      }).eq('id', item.schoolId);

      setSuccess(`Approved: ${item.schoolName} - ${isUnlimitedApproval ? `${UNLIMITED_PLAN_LABEL} one-time desktop access` : `access granted for ${grantMonths} months`}`);
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

  async function terminateCode(row: VerificationCodeRow) {
    setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      const terminated = Array.from(new Set([...getLocalTerminatedVerificationCodeHashes(), row.codeHash]));
      setLocalTerminatedVerificationCodeHashes(terminated);
      if (supabase) {
        const client = supabase;
        await client.from('settings').upsert([{
          school_id: VERIFICATION_CONTROL_TENANT,
          key: VERIFICATION_TERMINATED_SETTING,
          value: terminated,
          updated_at: now,
          created_at: now,
        }], { onConflict: 'school_id,key' });

        const { data } = await client
          .from('subscriptions')
          .select('id, metadata')
          .contains('metadata', { verificationCodeHash: row.codeHash });
        await Promise.all((data || []).map((sub: any) => client
          .from('subscriptions')
          .update({
            status: 'rejected',
            updated_at: now,
            metadata: {
              ...(sub.metadata || {}),
              terminatedByAdmin: true,
              terminatedAt: now,
            },
          })
          .eq('id', sub.id)
        ));
      }
      setSuccess(`Terminated ${row.label}.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not terminate code.');
    } finally {
      setSaving(false);
    }
  }

  async function reEnableCode(row: VerificationCodeRow) {
    setSaving(true); setError('');
    try {
      const now = new Date().toISOString();
      const terminated = getLocalTerminatedVerificationCodeHashes().filter(hash => hash !== row.codeHash);
      setLocalTerminatedVerificationCodeHashes(terminated);
      if (supabase) {
        const client = supabase;
        await client.from('settings').upsert([{
          school_id: VERIFICATION_CONTROL_TENANT,
          key: VERIFICATION_TERMINATED_SETTING,
          value: terminated,
          updated_at: now,
          created_at: now,
        }], { onConflict: 'school_id,key' });

        const { data } = await client
          .from('subscriptions')
          .select('id, ends_at, metadata')
          .contains('metadata', { verificationCodeHash: row.codeHash });
        await Promise.all((data || []).map((sub: any) => {
          const endsAt = sub.ends_at ? new Date(sub.ends_at).getTime() : 0;
          const nextMetadata = { ...(sub.metadata || {}) };
          delete nextMetadata.terminatedByAdmin;
          delete nextMetadata.terminatedAt;
          nextMetadata.reEnabledByAdmin = true;
          nextMetadata.reEnabledAt = now;
          return client
            .from('subscriptions')
            .update({
              status: endsAt > Date.now() ? 'active' : 'rejected',
              updated_at: now,
              metadata: nextMetadata,
            })
            .eq('id', sub.id);
        }));
      }
      setSuccess(`Re-enabled ${row.label}.`);
      await load();
    } catch (err: any) {
      setError(err.message || 'Could not re-enable code.');
    } finally {
      setSaving(false);
    }
  }

  const filtered = items.filter(i => filter === 'all' || i.status === filter);
  const pendingCount = items.filter(i => i.status === 'pending').length;
  const filteredCodes = codeRows.filter((row) => {
    if (codeFilter === 'used' && !row.used) return false;
    if (codeFilter === 'terminated' && !row.terminated) return false;
    if (codeFilter === 'unused' && (row.used || row.terminated)) return false;
    const q = codeSearch.trim().toLowerCase();
    if (!q) return true;
    return `${row.label} ${row.planName} ${row.billingCycle} ${row.codeHash} ${row.tokenHash} ${row.usedBySchoolName || ''} ${row.usedByEmail || ''}`.toLowerCase().includes(q);
  });

  function formatSubmittedAmount(item: PendingVerification) {
    if (item.displayAmount) return item.displayAmount;
    if (item.amount === '—' || item.amount === undefined || item.amount === null) return '—';
    const numeric = typeof item.amount === 'number' ? item.amount : Number(String(item.amount).replace(/,/g, ''));
    const currency = (item.currency || '').toUpperCase();
    if (currency === 'UGX') {
      return Number.isFinite(numeric)
        ? `UGX ${Math.round(numeric).toLocaleString()}`
        : `UGX ${item.amount}`;
    }
    if (currency) return Number.isFinite(numeric) ? `${currency} ${numeric.toLocaleString()}` : `${currency} ${item.amount}`;
    return Number.isFinite(numeric) ? `$${numeric.toLocaleString()}` : String(item.amount);
  }

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
                    <td className={`px-5 py-3 text-sm ${textPrimary}`}>{formatSubmittedAmount(item)}</td>
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

      <div className={`${card} border rounded-xl overflow-hidden`}>
        <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
          <div>
            <h2 className={`flex items-center gap-2 text-base font-bold ${textPrimary}`}>
              <KeyRound size={18} className="text-emerald-500" />
              Verification Codes
            </h2>
            <p className={`text-xs ${textMuted}`}>
              Used: {codeRows.filter((row) => row.used).length} · Terminated: {codeRows.filter((row) => row.terminated).length} · Total: {codeRows.length}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <div className={`flex rounded-xl p-1 ${isDark ? 'bg-slate-800' : 'bg-slate-100'}`}>
              {(['used', 'terminated', 'unused', 'all'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setCodeFilter(status)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors ${codeFilter === status ? 'bg-indigo-600 text-white' : isDark ? 'text-slate-400 hover:text-white' : 'text-slate-600 hover:text-slate-900'}`}
                >
                  {status}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={codeSearch}
              onChange={(e) => setCodeSearch(e.target.value)}
              placeholder="Search label, school, plan, hash..."
              className={`w-full rounded-xl border px-3 py-2 text-sm sm:w-72 ${isDark ? 'border-slate-700 bg-slate-800 text-white' : 'border-slate-200 bg-white text-slate-900'}`}
            />
          </div>
        </div>
        <div className="max-h-[520px] overflow-auto">
          <table className="w-full text-sm">
            <thead className={isDark ? 'bg-slate-900' : 'bg-slate-50'}>
              <tr className={`border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
                <th className={thClass}>Label</th>
                <th className={thClass}>Plan</th>
                <th className={thClass}>Used By</th>
                <th className={thClass}>Amount</th>
                <th className={thClass}>Token</th>
                <th className={thClass}>Status</th>
                <th className={thClass}></th>
              </tr>
            </thead>
            <tbody>
              {filteredCodes.slice(0, 250).map((row) => (
                <tr key={row.codeHash} className={`border-b ${isDark ? 'border-slate-800/50' : 'border-slate-100'} ${rowHover}`}>
                  <td className={`px-5 py-3 font-mono text-xs ${textPrimary}`}>{row.label}</td>
                  <td className={`px-5 py-3 text-sm ${textPrimary}`}>{row.planName} <span className={textMuted}>({row.billingCycle})</span></td>
                  <td className="px-5 py-3">
                    {row.used ? (
                      <>
                        <p className={`text-sm font-medium ${textPrimary}`}>{row.usedBySchoolName || 'Unknown school'}</p>
                        <p className={`text-xs ${textMuted}`}>{row.usedByEmail || row.usedBySchoolId || 'No email'}</p>
                        {row.usedAt && <p className={`text-[11px] ${textMuted}`}>{new Date(row.usedAt).toLocaleString()}</p>}
                      </>
                    ) : (
                      <span className={`text-xs ${textMuted}`}>Not used</span>
                    )}
                  </td>
                  <td className={`px-5 py-3 text-sm ${textPrimary}`}>${row.amount}</td>
                  <td className={`max-w-[220px] truncate px-5 py-3 font-mono text-xs ${textMuted}`} title={row.tokenHash}>{row.tokenHash}</td>
                  <td className="px-5 py-3">
                    {row.terminated ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-900/40 px-2 py-0.5 text-xs font-medium text-red-400"><Ban size={10} />Terminated</span>
                    ) : row.used ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-400"><CheckCircle size={10} />Used</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/40 px-2 py-0.5 text-xs font-medium text-slate-300"><Clock size={10} />Unused</span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {row.terminated ? (
                      <button
                        type="button"
                        onClick={() => reEnableCode(row)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <RotateCcw size={12} />
                        Re-enable
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => terminateCode(row)}
                        disabled={saving}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        <Ban size={12} />
                        Terminate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!filteredCodes.length && (
                <tr><td colSpan={7} className={`px-5 py-12 text-center text-sm ${textMuted}`}>No verification codes match your search</td></tr>
              )}
            </tbody>
          </table>
          {filteredCodes.length > 250 && (
            <p className={`px-5 py-3 text-xs ${textMuted}`}>Showing first 250 matching codes. Search to narrow the list.</p>
          )}
        </div>
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
                ['Amount', formatSubmittedAmount(selected)],
                ['Transaction ID', selected.transactionId || 'Not provided'],
                ['Submitted', new Date(selected.submittedAt).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k} className={`flex justify-between text-sm border-b ${isDark ? 'border-slate-800' : 'border-slate-100'} pb-2`}>
                  <span className={textMuted}>{k}</span>
                  <span className={`font-medium ${textPrimary}`}>{v}</span>
                </div>
              ))}

              {selected.status === 'pending' && selected.plan !== UNLIMITED_PLAN_ID && (
                <div className="pt-2">
                  <label className={`block text-xs font-medium ${textMuted} mb-1.5`}>Grant access for (months)</label>
                  <select value={grantMonths} onChange={e => setGrantMonths(Number(e.target.value))}
                    className={`w-full px-3 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
                  >
                    {[1, 3, 6, 12].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
                  </select>
                </div>
              )}
              {selected.status === 'pending' && selected.plan === UNLIMITED_PLAN_ID && (
                <div className={`rounded-xl p-3 text-xs ${isDark ? 'bg-emerald-900/20 border border-emerald-800 text-emerald-300' : 'bg-emerald-50 border border-emerald-200 text-emerald-700'}`}>
                  Approving this request grants {UNLIMITED_PLAN_LABEL} one-time desktop access and stores the unlimited student limit for the school.
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
