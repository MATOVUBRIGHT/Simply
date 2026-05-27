import { useMemo, useState } from 'react';
import { Check, Edit, Plus, Receipt, Search, Trash2, WalletCards, X } from 'lucide-react';
import { PaymentMethod } from '@schofy/shared';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useCurrency } from '../hooks/useCurrency';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { generateUUID } from '../utils/uuid';
import { matchesTextSearch } from '../utils/searchMatch';

type ExpenseDraft = {
  title: string;
  category: string;
  amount: string;
  date: string;
  paymentMethod: PaymentMethod;
  recordedBy: string;
  notes: string;
};

const blankDraft: ExpenseDraft = {
  title: '',
  category: 'Operations',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  paymentMethod: PaymentMethod.CASH,
  recordedBy: '',
  notes: '',
};

const categories = ['Operations', 'Utilities', 'Maintenance', 'Supplies', 'Transport', 'Food', 'Payroll', 'Other'];

function methodLabel(method?: string) {
  switch (method) {
    case PaymentMethod.BANK_TRANSFER: return 'Bank Transfer';
    case PaymentMethod.CARD: return 'Card';
    case PaymentMethod.OTHER: return 'Other';
    case PaymentMethod.CASH:
    default: return 'Cash';
  }
}

export default function Expenses() {
  const { user, schoolId } = useAuth();
  const sid = schoolId || user?.id || '';
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const { data: expensesData } = useTableData(sid, 'expenses');
  const expenses = expensesData as any[];
  const [draft, setDraft] = useState<ExpenseDraft>(blankDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterMethod, setFilterMethod] = useState('all');

  const filteredExpenses = useMemo(() =>
    expenses
      .filter(expense => filterCategory === 'all' || expense.category === filterCategory)
      .filter(expense => filterMethod === 'all' || expense.paymentMethod === filterMethod)
      .filter(expense => matchesTextSearch([expense.title, expense.category, expense.paymentMethod, expense.recordedBy, expense.notes], search))
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime()),
    [expenses, filterCategory, filterMethod, search]
  );

  const totalExpenses = filteredExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
  const monthKey = new Date().toISOString().slice(0, 7);
  const monthTotal = expenses
    .filter(expense => String(expense.date || expense.createdAt || '').startsWith(monthKey))
    .reduce((sum, expense) => sum + Number(expense.amount || 0), 0);

  function resetForm() {
    setDraft(blankDraft);
    setEditingId(null);
  }

  function editExpense(expense: any) {
    setEditingId(expense.id);
    setDraft({
      title: expense.title || '',
      category: expense.category || 'Operations',
      amount: String(expense.amount || ''),
      date: expense.date || new Date().toISOString().split('T')[0],
      paymentMethod: expense.paymentMethod || PaymentMethod.CASH,
      recordedBy: expense.recordedBy || '',
      notes: expense.notes || '',
    });
  }

  async function saveExpense(event: React.FormEvent) {
    event.preventDefault();
    if (!sid || saving) return;
    const amount = Number(draft.amount);
    if (!draft.title.trim() || !Number.isFinite(amount) || amount <= 0) {
      addToast('Enter an expense title and valid amount', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: draft.title.trim(),
        category: draft.category,
        amount,
        date: draft.date,
        paymentMethod: draft.paymentMethod,
        recordedBy: draft.recordedBy.trim() || user?.email || 'School office',
        notes: draft.notes.trim(),
      };
      if (editingId) {
        const existing = expenses.find(expense => expense.id === editingId) || {};
        await dataService.update(sid, 'expenses', editingId, { ...existing, ...payload });
        addToast('Expense updated', 'success');
      } else {
        await dataService.create(sid, 'expenses', { id: generateUUID(), ...payload, createdAt: new Date().toISOString() });
        addToast('Expense recorded', 'success');
      }
      resetForm();
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'expenses' } }));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'expenses' } }));
    } catch {
      addToast('Failed to save expense', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function deleteExpense(expenseId: string) {
    if (!sid) return;
    try {
      await dataService.delete(sid, 'expenses', expenseId);
      addToast('Expense deleted', 'success');
    } catch {
      addToast('Failed to delete expense', 'error');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Expenses</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Record school spending, payment method, and notes for profit reports.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div className="card-solid-rose p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-red text-white"><Receipt size={22} /></div>
            <div className="min-w-0">
              <p className="text-sm text-white/80">Filtered Expenses</p>
              <p className="text-2xl font-bold text-white">{formatMoney(totalExpenses)}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-amber p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon text-white" style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}><WalletCards size={22} /></div>
            <div className="min-w-0">
              <p className="text-sm text-white/80">This Month</p>
              <p className="text-2xl font-bold text-white">{formatMoney(monthTotal)}</p>
            </div>
          </div>
        </div>
        <div className="card-solid-indigo p-5">
          <div className="flex items-center gap-4">
            <div className="stat-icon stat-icon-blue text-white"><Check size={22} /></div>
            <div className="min-w-0">
              <p className="text-sm text-white/80">Records</p>
              <p className="text-2xl font-bold text-white">{filteredExpenses.length}</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={saveExpense} className="card">
        <div className="card-header flex items-center justify-between gap-3">
          <h2 className="font-bold text-slate-800 dark:text-white">{editingId ? 'Edit Expense' : 'Record Expense'}</h2>
          {editingId && <button type="button" onClick={resetForm} className="btn btn-secondary"><X size={16} /> Cancel</button>}
        </div>
        <div className="card-body grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="xl:col-span-2">
            <label className="form-label">Expense Name</label>
            <input value={draft.title} onChange={event => setDraft(prev => ({ ...prev, title: event.target.value }))} className="form-input" placeholder="Books, repair, utility bill..." />
          </div>
          <div>
            <label className="form-label">Category</label>
            <select value={draft.category} onChange={event => setDraft(prev => ({ ...prev, category: event.target.value }))} className="form-input form-select">
              {categories.map(category => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div>
            <label className="form-label">Amount</label>
            <input type="number" min="0" step="0.01" value={draft.amount} onChange={event => setDraft(prev => ({ ...prev, amount: event.target.value }))} className="form-input" placeholder="0.00" />
          </div>
          <div>
            <label className="form-label">Date</label>
            <input type="date" value={draft.date} onChange={event => setDraft(prev => ({ ...prev, date: event.target.value }))} className="form-input" />
          </div>
          <div>
            <label className="form-label">Payment Method</label>
            <select value={draft.paymentMethod} onChange={event => setDraft(prev => ({ ...prev, paymentMethod: event.target.value as PaymentMethod }))} className="form-input form-select">
              <option value={PaymentMethod.CASH}>Cash</option>
              <option value={PaymentMethod.BANK_TRANSFER}>Bank Transfer</option>
              <option value={PaymentMethod.CARD}>Card</option>
              <option value={PaymentMethod.OTHER}>Other</option>
            </select>
          </div>
          <div>
            <label className="form-label">Recorded By</label>
            <input value={draft.recordedBy} onChange={event => setDraft(prev => ({ ...prev, recordedBy: event.target.value }))} className="form-input" placeholder="Bursar, cashier..." />
          </div>
          <div className="xl:col-span-2">
            <label className="form-label">Notes</label>
            <input value={draft.notes} onChange={event => setDraft(prev => ({ ...prev, notes: event.target.value }))} className="form-input" placeholder="Optional details" />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={saving} className="btn btn-primary w-full disabled:opacity-70">
              <Plus size={16} /> {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
            </button>
          </div>
        </div>
      </form>

      <section className="card overflow-hidden">
        <div className="card-header grid grid-cols-1 gap-3 lg:grid-cols-[1fr_160px_150px]">
          <div className="relative">
            <Search size={16} className="search-input-icon" />
            <input value={search} onChange={event => setSearch(event.target.value)} className="search-input" placeholder="Search expenses..." />
          </div>
          <select value={filterCategory} onChange={event => setFilterCategory(event.target.value)} className="form-input form-select">
            <option value="all">All Categories</option>
            {categories.map(category => <option key={category} value={category}>{category}</option>)}
          </select>
          <select value={filterMethod} onChange={event => setFilterMethod(event.target.value)} className="form-input form-select">
            <option value="all">All Methods</option>
            <option value={PaymentMethod.CASH}>Cash</option>
            <option value={PaymentMethod.BANK_TRANSFER}>Bank</option>
            <option value={PaymentMethod.CARD}>Card</option>
            <option value={PaymentMethod.OTHER}>Other</option>
          </select>
        </div>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Expense</th>
                <th>Category</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Recorded By</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr><td colSpan={7} className="py-12 text-center text-slate-400">No expenses recorded yet.</td></tr>
              ) : filteredExpenses.map(expense => (
                <tr key={expense.id}>
                  <td>{expense.date || '-'}</td>
                  <td>
                    <p className="font-semibold text-slate-800 dark:text-white">{expense.title}</p>
                    {expense.notes && <p className="text-xs text-slate-400">{expense.notes}</p>}
                  </td>
                  <td>{expense.category || '-'}</td>
                  <td>{methodLabel(expense.paymentMethod)}</td>
                  <td className="font-bold text-red-600">{formatMoney(Number(expense.amount || 0))}</td>
                  <td>{expense.recordedBy || '-'}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      <button onClick={() => editExpense(expense)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700" title="Edit expense"><Edit size={15} /></button>
                      <button onClick={() => deleteExpense(expense.id)} className="rounded-lg p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20" title="Delete expense"><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
