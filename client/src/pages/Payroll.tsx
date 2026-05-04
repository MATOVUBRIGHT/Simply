import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  DollarSign, 
  Trash2, 
  Clock, 
  CheckCircle, 
  Calendar, 
  Settings, 
  ArrowLeft, 
  Plus 
} from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import type { Staff, SalaryPayment } from '@schofy/shared';
import { PaymentMethod } from '@schofy/shared';
import { useCurrency } from '../hooks/useCurrency';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import DropdownModal from '../components/DropdownModal';
import { useTableData } from '../lib/store';

export default function Payroll() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const { formatMoney } = useCurrency();
  const { addToast } = useToast();
  const sid = schoolId || user?.id || '';
  const { data: staff, loading } = useTableData(sid, 'staff');
  const { data: salaryPayments } = useTableData(sid, 'salaryPayments');

  const [showPayrollModal, setShowPayrollModal] = useState(false);
  const [showPayModal, setShowPayModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<SalaryPayment | null>(null);
  const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7));
  const [paymentNotes, setPaymentNotes] = useState('');

  const payrollStats = {
    pending: salaryPayments.filter(p => p.status === 'pending'),
    paid: salaryPayments.filter(p => p.status === 'paid'),
    upcoming: salaryPayments.filter(p => p.status === 'upcoming'),
    pendingTotal: salaryPayments.filter(p => p.status === 'pending').reduce((sum, p) => sum + p.amount, 0),
    paidTotal: salaryPayments.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0),
    upcomingTotal: salaryPayments.filter(p => p.status === 'upcoming').reduce((sum, p) => sum + p.amount, 0),
  };

  async function handleGeneratePayroll() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const [month, year] = payrollMonth.split('-');
      const activeStaff = staff.filter(s => s.status === 'active' && s.salary && s.salary > 0);
      const now = new Date().toISOString();
      let count = 0;

      for (const member of activeStaff) {
        const existing = salaryPayments.find(p => 
          p.staffId === member.id && p.month === month && p.year === parseInt(year)
        );
        if (!existing) {
          const payment: SalaryPayment = {
            id: uuidv4(),
            staffId: member.id,
            staffName: `${member.firstName} ${member.lastName}`,
            amount: member.salary || 0,
            month,
            year: parseInt(year),
            status: 'pending',
            createdAt: now,
          };
          await dataService.create(id, 'salaryPayments', payment as any);
          count++;
        }
      }
      setShowPayrollModal(false);
      addToast(`Generated payroll for ${count} staff members`, 'success');
    } catch (error) {
      console.error('Failed to generate payroll:', error);
      addToast('Failed to generate payroll', 'error');
    }
  }

  async function handleMarkAsPaid(payment: SalaryPayment) {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      await dataService.update(id, 'salaryPayments', payment.id, { 
        status: 'paid', 
        paidAt: new Date().toISOString(), 
        paymentMethod: PaymentMethod.BANK_TRANSFER, 
        notes: paymentNotes || undefined 
      } as any);
      setShowPayModal(false);
      setSelectedPayment(null);
      setPaymentNotes('');
      addToast(`Marked ${payment.staffName}'s salary as paid`, 'success');
    } catch (error) {
      console.error('Failed to mark as paid:', error);
      addToast('Failed to update payment', 'error');
    }
  }

  async function handleDeletePayment(paymentId: string) {
    const id = schoolId || user?.id;
    if (!id) return;
    if (!window.confirm('Delete this payment record?')) return;
    try {
      await dataService.delete(id, 'salaryPayments', paymentId);
      addToast('Payment record deleted', 'success');
    } catch (error) {
      console.error('Failed to delete payment:', error);
      addToast('Failed to delete payment', 'error');
    }
  }

  function openPayModal(payment: SalaryPayment) {
    setSelectedPayment(payment);
    setShowPayModal(true);
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'paid':
        return 'badge-success';
      case 'pending':
        return 'badge-amber';
      case 'upcoming':
        return 'badge-info';
      default:
        return 'badge-gray';
    }
  }

  function getMonthName(month: string) {
    const date = new Date(parseInt(new Date().getFullYear().toString()), parseInt(month) - 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/staff')}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} className="text-slate-600 dark:text-slate-300" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Payroll Management</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Manage staff salaries and payments</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowHistoryModal(true)}
            className="btn btn-secondary"
          >
            <Clock size={16} />
            History
          </button>
          <button 
            onClick={() => setShowPayrollModal(true)}
            className="btn btn-primary"
          >
            <Settings size={16} />
            Generate Payroll
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Pending Payments</p>
                <p className="text-2xl font-bold text-amber-600">{payrollStats.pending.length}</p>
                <p className="text-sm text-amber-600">{formatMoney(payrollStats.pendingTotal)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center">
                <Clock size={24} className="text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Paid This Month</p>
                <p className="text-2xl font-bold text-emerald-600">{payrollStats.paid.length}</p>
                <p className="text-sm text-emerald-600">{formatMoney(payrollStats.paidTotal)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <CheckCircle size={24} className="text-emerald-600 dark:text-emerald-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">Upcoming</p>
                <p className="text-2xl font-bold text-blue-600">{payrollStats.upcoming.length}</p>
                <p className="text-sm text-blue-600">{formatMoney(payrollStats.upcomingTotal)}</p>
              </div>
              <div className="w-12 h-12 rounded-lg bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                <Calendar size={24} className="text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment History */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-bold text-slate-800 dark:text-white">Payment History</h3>
        </div>
        <div className="card-body">
          {salaryPayments.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 font-medium">No payment records</p>
              <p className="text-sm text-slate-400 mt-1">Generate payroll to see payment history</p>
            </div>
          ) : (
            <div className="space-y-2">
              {salaryPayments
                .sort((a, b) => {
                  if (a.year !== b.year) return b.year - a.year;
                  return parseInt(b.month) - parseInt(a.month);
                })
                .slice(0, 20)
                .map((payment) => (
                  <div 
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-white text-sm">{payment.staffName}</p>
                        <span className={`badge ${getStatusBadge(payment.status)} text-xs`}>
                          {payment.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">
                          {getMonthName(payment.month)}
                        </span>
                        {payment.paidAt && (
                          <span className="text-xs text-slate-400">
                            Paid: {new Date(payment.paidAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-slate-400 mt-1 truncate max-w-[200px]">{payment.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {formatMoney(payment.amount)}
                      </span>
                      {payment.status === 'pending' && (
                        <>
                          <button
                            onClick={() => openPayModal(payment)}
                            className="p-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 rounded-lg transition-colors"
                            title="Mark as Paid"
                          >
                            <CheckCircle size={14} />
                          </button>
                          <button
                            onClick={() => handleDeletePayment(payment.id)}
                            className="p-1.5 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-600 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              {salaryPayments.length > 20 && (
                <p className="text-center text-xs text-slate-500 py-2">
                  Showing 20 of {salaryPayments.length} records
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Generate Payroll Modal */}
      {showPayrollModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm animate-backdrop-in">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-modal-in border border-slate-200 dark:border-slate-700">
            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between" style={{ backgroundColor: 'var(--primary-color)' }}>
              <div className="flex items-center gap-2">
                <Settings size={18} className="text-white" />
                <h2 className="font-bold text-white">Generate Payroll</h2>
              </div>
              <button onClick={() => setShowPayrollModal(false)} className="p-1 hover:bg-white/20 rounded-lg transition-colors">
                <Plus size={18} className="text-white rotate-45" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="form-label">Select Month & Year</label>
                <input
                  type="month"
                  value={payrollMonth}
                  onChange={(e) => setPayrollMonth(e.target.value)}
                  className="form-input"
                />
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-lg p-3">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  This will create payroll entries for all active staff members who have a salary set.
                  Staff without a salary will be skipped.
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  <strong>{staff.filter(s => s.status === 'active' && s.salary && s.salary > 0).length}</strong> staff members will be included.
                </p>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setShowPayrollModal(false)} className="btn btn-secondary">
                Cancel
              </button>
              <button onClick={handleGeneratePayroll} className="btn btn-primary">
                Generate Payroll
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mark as Paid Modal */}
      <DropdownModal
        isOpen={showPayModal}
        onClose={() => { setShowPayModal(false); setSelectedPayment(null); setPaymentNotes(''); }}
        title="Record Payment"
        icon={<CheckCircle size={20} className="text-emerald-500" />}
      >
        {selectedPayment && (
          <div className="p-4 space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">Staff Member</span>
                <span className="font-semibold text-slate-800 dark:text-white">{selectedPayment.staffName}</span>
              </div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-slate-500">Amount</span>
                <span className="font-bold text-lg text-emerald-600">{formatMoney(selectedPayment.amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500">Period</span>
                <span className="text-slate-700 dark:text-slate-300">{getMonthName(selectedPayment.month)}</span>
              </div>
            </div>
            <div>
              <label className="form-label text-sm">Notes (optional)</label>
              <textarea
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                className="form-input min-h-[80px]"
                placeholder="Payment notes..."
              />
            </div>
            <button
              onClick={() => handleMarkAsPaid(selectedPayment)}
              className="w-full btn btn-primary flex items-center justify-center gap-2"
            >
              <CheckCircle size={18} />
              Confirm Payment
            </button>
          </div>
        )}
      </DropdownModal>

      {/* History Modal */}
      <DropdownModal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Payment History"
        icon={<Clock size={20} className="text-violet-500" />}
        maxHeight="max-h-[70vh]"
      >
        <div className="p-2 space-y-2">
          {salaryPayments.length === 0 ? (
            <div className="text-center py-8">
              <DollarSign size={48} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-slate-500 font-medium">No payment records</p>
              <p className="text-sm text-slate-400 mt-1">Generate payroll to see payment history</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg mb-3">
                <span className="text-xs text-slate-500">Total: {salaryPayments.length} records</span>
                <div className="flex gap-4 text-xs">
                  <span className="text-amber-600">{payrollStats.pending.length} pending</span>
                  <span className="text-emerald-600">{payrollStats.paid.length} paid</span>
                </div>
              </div>
              {salaryPayments
                .sort((a, b) => {
                  if (a.year !== b.year) return b.year - a.year;
                  return parseInt(b.month) - parseInt(a.month);
                })
                .slice(0, 50)
                .map((payment) => (
                  <div 
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 hover:border-slate-200 dark:hover:border-slate-500 transition-colors"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-slate-800 dark:text-white text-sm">{payment.staffName}</p>
                        <span className={`badge ${getStatusBadge(payment.status)} text-xs`}>
                          {payment.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-xs text-slate-500">
                          {getMonthName(payment.month)}
                        </span>
                        {payment.paidAt && (
                          <span className="text-xs text-slate-400">
                            Paid: {new Date(payment.paidAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-slate-400 mt-1 truncate max-w-[200px]">{payment.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-white">
                        {formatMoney(payment.amount)}
                      </span>
                      {payment.status === 'pending' && (
                        <button
                          onClick={() => openPayModal(payment)}
                          className="p-1.5 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:hover:bg-emerald-900/50 text-emerald-600 rounded-lg transition-colors"
                          title="Mark as Paid"
                        >
                          <CheckCircle size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {salaryPayments.length > 50 && (
                <p className="text-center text-xs text-slate-500 py-2">
                  Showing 50 of {salaryPayments.length} records
                </p>
              )}
            </>
          )}
        </div>
      </DropdownModal>
    </div>
  );
}

