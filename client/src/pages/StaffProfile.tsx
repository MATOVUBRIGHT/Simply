import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Briefcase,
  Check,
  CreditCard,
  Edit,
  GraduationCap,
  Mail,
  Phone,
  Save,
  UserCheck,
  X,
} from 'lucide-react';
import type { Class, SalaryPayment, Staff, Subject } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { store, useTableData } from '../lib/store';
import { dataService } from '../lib/database/SupabaseDataService';
import { useCurrency } from '../hooks/useCurrency';
import { sortClassesBySectionThenLevel } from '../utils/classroom';
import { useBackOrFallback } from '../utils/navigation';
import { shouldSaveOnEnter } from '../utils/keyboard';

const avatarColors = ['bg-indigo-600', 'bg-emerald-600', 'bg-amber-600', 'bg-rose-600', 'bg-sky-600'];

function initials(staff?: Staff) {
  if (!staff) return 'ST';
  return `${staff.firstName?.[0] || ''}${staff.lastName?.[0] || ''}`.toUpperCase() || 'ST';
}

function monthLabel(payment: SalaryPayment) {
  const monthIndex = Math.max(0, Number(payment.month) - 1);
  return new Date(payment.year || new Date().getFullYear(), monthIndex).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

export default function StaffProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const goBack = useBackOrFallback('/staff');
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const sid = schoolId || user?.id || '';

  const { data: staffData, loading } = useTableData(sid, 'staff');
  const { data: classesData } = useTableData(sid, 'classes');
  const { data: subjectsData } = useTableData(sid, 'subjects');
  const { data: paymentsData } = useTableData(sid, 'salaryPayments');

  const staff = staffData.find((item: any) => item.id === id) as Staff | undefined;
  const classes = useMemo(() => sortClassesBySectionThenLevel(classesData as Class[]), [classesData]);
  const subjects = useMemo(() => {
    const classOrder = new Map(classes.map((classItem, index) => [classItem.id, index]));
    return [...(subjectsData as Subject[])].sort((a, b) => {
      const classCompare = (classOrder.get(a.classId || '') ?? 9999) - (classOrder.get(b.classId || '') ?? 9999);
      if (classCompare !== 0) return classCompare;
      return String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true, sensitivity: 'base' });
    });
  }, [subjectsData, classes]);
  const payments = useMemo(() =>
    (paymentsData as SalaryPayment[])
      .filter(payment => payment.staffId === id)
      .sort((a, b) => new Date(b.paidAt || b.createdAt).getTime() - new Date(a.paidAt || a.createdAt).getTime()),
    [paymentsData, id]
  );

  const assignedSubjects = useMemo(() => {
    if (!staff) return [];
    const staffSubjects = new Set(staff.subjects || []);
    return subjects.filter(subject => subject.teacherId === staff.id || staffSubjects.has(subject.id));
  }, [staff, subjects]);

  const taughtClasses = useMemo(() => {
    const storedClassIds = Array.isArray((staff as any)?.assignedClassIds) ? (staff as any).assignedClassIds : [];
    const classIds = new Set([
      ...storedClassIds,
      ...assignedSubjects.map(subject => subject.classId).filter(Boolean),
    ]);
    return sortClassesBySectionThenLevel(classes.filter(classItem => classIds.has(classItem.id)));
  }, [assignedSubjects, classes, staff]);

  const payrollStats = useMemo(() => {
    const paid = payments.filter(payment => payment.status === 'paid');
    const pending = payments.filter(payment => payment.status === 'pending');
    return {
      paidTotal: paid.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      pendingTotal: pending.reduce((sum, payment) => sum + Number(payment.amount || 0), 0),
      paidCount: paid.length,
      pendingCount: pending.length,
    };
  }, [payments]);

  const accountFields = useMemo(() => {
    const fields = staff?.customFields || [];
    const accountWords = ['account', 'bank', 'mobile', 'money', 'pay', 'wallet', 'number'];
    return fields.filter(field => accountWords.some(word => `${field.label} ${field.value}`.toLowerCase().includes(word)));
  }, [staff]);

  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedClassIds, setSelectedClassIds] = useState<Set<string>>(new Set());
  const [selectedSubjectIds, setSelectedSubjectIds] = useState<Set<string>>(new Set());
  const [savingAssign, setSavingAssign] = useState(false);

  function openAssign() {
    setSelectedClassIds(new Set(taughtClasses.map(classItem => classItem.id)));
    setSelectedSubjectIds(new Set(assignedSubjects.map(subject => subject.id)));
    setAssignOpen(true);
  }

  async function saveAssignments() {
    if (!staff || !sid || savingAssign) return;
    setSavingAssign(true);
    try {
      const wantedSubjectIds = new Set(selectedSubjectIds);
      const wantedClassIds = new Set(selectedClassIds);
      const now = new Date().toISOString();
      const nextSubjects = subjects.map(subject => {
        const selected = wantedSubjectIds.has(subject.id) && (!subject.classId || wantedClassIds.has(subject.classId));
        return {
          ...subject,
          teacherId: selected ? staff.id : subject.teacherId === staff.id ? undefined : subject.teacherId,
          updatedAt: selected !== (subject.teacherId === staff.id) ? now : (subject as any).updatedAt,
        } as Subject;
      });

      for (const subject of subjects) {
        const selected = wantedSubjectIds.has(subject.id) && (!subject.classId || wantedClassIds.has(subject.classId));
        const shouldBelongToStaff = selected;
        const currentlyBelongsToStaff = subject.teacherId === staff.id;
        if (shouldBelongToStaff !== currentlyBelongsToStaff) {
          await dataService.update(sid, 'subjects', subject.id, {
            ...subject,
            teacherId: shouldBelongToStaff ? staff.id : undefined,
            updatedAt: now,
          } as any);
        }
      }

      const nextStaff = {
        ...staff,
        assignedClassIds: [...wantedClassIds],
        subjects: [...wantedSubjectIds],
        updatedAt: now,
      } as Staff & { assignedClassIds?: string[] };
      await dataService.update(sid, 'staff', staff.id, nextStaff as any);

      store.push(sid, 'subjects', nextSubjects);
      store.push(sid, 'staff', (staffData as Staff[]).map(item => item.id === staff.id ? nextStaff : item));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'subjects' } }));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'staff' } }));

      addToast('Staff assignments updated', 'success');
      setAssignOpen(false);
    } catch (error) {
      console.error('Failed to update staff assignments:', error);
      addToast('Failed to update assignments', 'error');
    } finally {
      setSavingAssign(false);
    }
  }

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-slate-400">Loading staff profile...</div>;
  }

  if (!staff) {
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <UserCheck className="mx-auto text-slate-300" size={44} />
        <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">Staff profile not found</h1>
        <p className="mt-2 text-sm text-slate-500">This staff record may have been deleted or is not available on this device yet.</p>
        <button onClick={goBack} className="btn btn-primary mt-5">Back to staff</button>
      </div>
    );
  }

  const avatarColor = avatarColors[(staff.firstName || 'S').charCodeAt(0) % avatarColors.length];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <button onClick={goBack} className="btn btn-ghost p-2"><ArrowLeft size={20} /></button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Staff Profile</h1>
            <p className="text-sm text-slate-500">Classes, duty, payroll details, and payment history.</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openAssign} className="btn btn-secondary"><GraduationCap size={18} /> Assign Classes</button>
          <Link to={`/staff/${staff.id}/edit`} className="btn btn-primary"><Edit size={18} /> Edit Profile</Link>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="bg-gradient-to-r from-indigo-600 to-emerald-600 p-6 text-white">
          <div className="flex flex-col gap-5 md:flex-row md:items-center">
            {staff.photoUrl ? (
              <img src={staff.photoUrl} alt="" className="h-24 w-24 rounded-2xl border-4 border-white/30 object-cover" />
            ) : (
              <div className={`flex h-24 w-24 items-center justify-center rounded-2xl border-4 border-white/30 ${avatarColor} text-3xl font-bold`}>
                {initials(staff)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 className="text-3xl font-bold">{staff.firstName} {staff.lastName}</h2>
              <div className="mt-2 flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-white/15 px-3 py-1 font-semibold">{staff.employeeId}</span>
                <span className="rounded-full bg-white/15 px-3 py-1 capitalize">{String(staff.role).replace(/_/g, ' ')}</span>
                <span className={`rounded-full px-3 py-1 font-semibold ${staff.status === 'active' ? 'bg-emerald-400/25' : 'bg-rose-400/25'}`}>{staff.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm md:w-80">
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-white/70">Classes</p>
                <p className="text-xl font-bold">{taughtClasses.length}</p>
              </div>
              <div className="rounded-xl bg-white/15 p-3">
                <p className="text-white/70">Subjects</p>
                <p className="text-xl font-bold">{assignedSubjects.length}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-3">
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><Briefcase size={14} /> Duty</p>
            <p className="mt-2 font-semibold text-slate-800 dark:text-white">{staff.department || 'No department set'}</p>
            <p className="mt-1 text-sm text-slate-500 capitalize">{String(staff.role).replace(/_/g, ' ')}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><Phone size={14} /> Contact</p>
            <p className="mt-2 font-semibold text-slate-800 dark:text-white">{staff.phone || '-'}</p>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500"><Mail size={13} /> {staff.email || 'No email'}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/70">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-400"><CreditCard size={14} /> Payroll</p>
            <p className="mt-2 font-semibold text-slate-800 dark:text-white">{formatMoney(Number(staff.salary || 0))} / month</p>
            <p className="mt-1 text-sm text-slate-500">{payrollStats.pendingCount} pending payroll item{payrollStats.pendingCount === 1 ? '' : 's'}</p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">Classes They Teach</h3>
              <p className="text-sm text-slate-500">Derived from subject teacher assignments.</p>
            </div>
            <button onClick={openAssign} className="btn btn-secondary text-sm">Assign</button>
          </div>
          {taughtClasses.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
              No classes assigned yet.
            </div>
          ) : (
            <div className="space-y-3">
              {taughtClasses.map((classItem, index) => {
                const classSubjects = assignedSubjects.filter(subject => subject.classId === classItem.id);
                return (
                  <Link key={classItem.id} to={`/classes/${classItem.id}`} className="block rounded-xl border border-slate-200 p-4 transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:hover:bg-indigo-950/20">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-sm font-bold text-white">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-900 dark:text-white">{classItem.name}{classItem.stream ? ` - ${classItem.stream}` : ''}</p>
                        <p className="mt-1 text-sm text-slate-500">{classSubjects.map(subject => subject.name).join(', ') || 'No subjects selected'}</p>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payroll Details & Accounts</h3>
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                <span className="text-slate-500">Monthly salary</span>
                <span className="font-bold text-slate-900 dark:text-white">{formatMoney(Number(staff.salary || 0))}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                <span className="text-slate-500">Paid total</span>
                <span className="font-bold text-emerald-600">{formatMoney(payrollStats.paidTotal)}</span>
              </div>
              <div className="flex justify-between rounded-xl bg-slate-50 p-3 dark:bg-slate-800/70">
                <span className="text-slate-500">Pending total</span>
                <span className="font-bold text-amber-600">{formatMoney(payrollStats.pendingTotal)}</span>
              </div>
            </div>
            <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Account fields</p>
              {accountFields.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">No payroll account fields yet. Add bank or mobile money details in custom fields.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {accountFields.map(field => (
                    <div key={field.id} className="rounded-lg bg-indigo-50 p-3 text-sm dark:bg-indigo-950/30">
                      <p className="font-semibold text-slate-800 dark:text-white">{field.label}</p>
                      <p className="mt-1 break-words text-slate-500 dark:text-slate-300">{field.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">More Details</h3>
            <div className="mt-3 space-y-2">
              {(staff.customFields || []).length === 0 ? (
                <p className="text-sm text-slate-400">No custom fields yet.</p>
              ) : (staff.customFields || []).map(field => (
                <div key={field.id} className="rounded-lg border border-slate-100 p-3 text-sm dark:border-slate-800">
                  <p className="font-semibold text-slate-800 dark:text-white">{field.label}</p>
                  <p className="mt-1 text-slate-500">{field.value || '-'}</p>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">Payroll History</h3>
            <p className="text-sm text-slate-500">Salary payments recorded for this staff member.</p>
          </div>
          <Link to="/payroll" className="btn btn-secondary text-sm">Open Payroll</Link>
        </div>
        {payments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-400 dark:border-slate-700">
            No payroll history yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800">
                <tr>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Month</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Method</th>
                  <th className="px-4 py-3">Paid At</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {payments.map((payment, index) => (
                  <tr key={payment.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-4 py-3 text-slate-400">{index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">{monthLabel(payment)}</td>
                    <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">{formatMoney(Number(payment.amount || 0))}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-bold capitalize ${payment.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : payment.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{payment.paymentMethod || '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{payment.paidAt ? new Date(payment.paidAt).toLocaleDateString() : '-'}</td>
                    <td className="px-4 py-3 text-slate-500">{payment.notes || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {assignOpen && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={e => { if (e.target === e.currentTarget) setAssignOpen(false); }}>
          <div
            className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
            onKeyDown={e => {
              if (!shouldSaveOnEnter(e)) return;
              e.preventDefault();
              void saveAssignments();
            }}
          >
            <div className="flex items-center justify-between bg-indigo-600 px-5 py-4 text-white">
              <div>
                <h2 className="text-lg font-bold">Assign Classes & Subjects</h2>
                <p className="text-sm text-indigo-100">{staff.firstName} {staff.lastName}</p>
              </div>
              <button onClick={() => setAssignOpen(false)} className="rounded-lg p-1 hover:bg-white/15"><X size={18} /></button>
            </div>
            <div className="grid max-h-[70vh] gap-5 overflow-y-auto p-5 md:grid-cols-2">
              <div>
                <h3 className="mb-3 font-bold text-slate-900 dark:text-white">Classes</h3>
                <div className="space-y-2">
                  {classes.map((classItem, index) => {
                    const checked = selectedClassIds.has(classItem.id);
                    return (
                      <button
                        key={classItem.id}
                        type="button"
                        onClick={() => setSelectedClassIds(prev => {
                          const next = new Set(prev);
                          checked ? next.delete(classItem.id) : next.add(classItem.id);
                          return next;
                        })}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition ${checked ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                      >
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${checked ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>{checked && <Check size={14} />}</span>
                        <span className="font-semibold text-slate-800 dark:text-white">{index + 1}. {classItem.name}{classItem.stream ? ` - ${classItem.stream}` : ''}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <h3 className="mb-3 font-bold text-slate-900 dark:text-white">Subjects</h3>
                <div className="space-y-2">
                  {subjects.map(subject => {
                    const classItem = classes.find(item => item.id === subject.classId);
                    const disabled = subject.classId ? !selectedClassIds.has(subject.classId) : false;
                    const checked = selectedSubjectIds.has(subject.id);
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => setSelectedSubjectIds(prev => {
                          const next = new Set(prev);
                          checked ? next.delete(subject.id) : next.add(subject.id);
                          return next;
                        })}
                        className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40 ${checked ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30' : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800'}`}
                      >
                        <span className={`flex h-6 w-6 items-center justify-center rounded-md border ${checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300'}`}>{checked && <Check size={14} />}</span>
                        <span>
                          <span className="block font-semibold text-slate-800 dark:text-white">{subject.name}</span>
                          <span className="text-xs text-slate-400">{classItem?.name || 'No class'}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-4 dark:border-slate-700">
              <button onClick={() => setAssignOpen(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={saveAssignments} disabled={savingAssign} className="btn btn-primary"><Save size={18} /> {savingAssign ? 'Saving...' : 'Save Assignments'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
