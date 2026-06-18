import { useMemo, useState } from 'react';
import { Calculator, Check, Download, Edit3, Plus, RefreshCw, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { useTableData } from '../lib/store';
import { useCurrency } from '../hooks/useCurrency';
import { exportToCSV } from '../utils/export';
import { PortalSelect } from '../components/PortalSelect';

type BudgetLineType = 'income' | 'expense';

type BudgetLine = {
  id: string;
  type: BudgetLineType;
  category: string;
  planned: number;
  notes: string;
};

const starterBudget: BudgetLine[] = [
  { id: 'tuition', type: 'income', category: 'Tuition and school fees', planned: 0, notes: 'Auto estimate from fee records' },
  { id: 'transport-income', type: 'income', category: 'Transport collections', planned: 0, notes: 'Optional transport income' },
  { id: 'payroll', type: 'expense', category: 'Staff payroll', planned: 0, notes: 'Auto estimate from salary records' },
  { id: 'operations', type: 'expense', category: 'School operations', planned: 0, notes: 'Auto estimate from expenses' },
  { id: 'library', type: 'expense', category: 'Library and learning materials', planned: 0, notes: 'Books, readers, teaching guides' },
  { id: 'health', type: 'expense', category: 'Health and sick bay', planned: 0, notes: 'First aid, clinic supplies' },
];

function moneyValue(value: unknown) {
  const next = Number(value || 0);
  return Number.isFinite(next) ? next : 0;
}

export default function SchoolBudget() {
  const { user, schoolId } = useAuth();
  const tenantId = schoolId || user?.id || 'local';
  const storageKey = `schofy_school_budget_${tenantId}`;
  const { addToast } = useToast();
  const { formatMoney } = useCurrency();
  const { data: fees } = useTableData(tenantId, 'fees');
  const { data: expenses } = useTableData(tenantId, 'expenses');
  const { data: staff } = useTableData(tenantId, 'staff');

  const [budget, setBudget] = useState<BudgetLine[]>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '[]');
      return Array.isArray(saved) && saved.length > 0 ? saved : starterBudget;
    } catch {
      return starterBudget;
    }
  });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ type: 'expense' as BudgetLineType, category: '', planned: '', notes: '' });

  const totals = useMemo(() => {
    const income = budget.filter(line => line.type === 'income').reduce((sum, line) => sum + moneyValue(line.planned), 0);
    const expense = budget.filter(line => line.type === 'expense').reduce((sum, line) => sum + moneyValue(line.planned), 0);
    return { income, expense, balance: income - expense };
  }, [budget]);

  function persist(next: BudgetLine[]) {
    setBudget(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  }

  function autoGenerateBudget() {
    const feeTotal = fees.reduce((sum: number, fee: any) => sum + moneyValue(fee.amount), 0);
    const expenseTotal = expenses.reduce((sum: number, expense: any) => sum + moneyValue(expense.amount), 0);
    const payrollTotal = staff.reduce((sum: number, member: any) => sum + moneyValue(member.salary), 0) * 3;
    const operationsEstimate = expenseTotal > 0 ? Math.ceil(expenseTotal * 1.12) : 1500000;
    const tuitionEstimate = feeTotal > 0 ? Math.ceil(feeTotal * 1.05) : 0;

    const generated = starterBudget.map(line => {
      if (line.id === 'tuition') return { ...line, planned: tuitionEstimate };
      if (line.id === 'payroll') return { ...line, planned: payrollTotal };
      if (line.id === 'operations') return { ...line, planned: operationsEstimate };
      if (line.id === 'library') return { ...line, planned: Math.max(350000, Math.round(operationsEstimate * 0.08)) };
      if (line.id === 'health') return { ...line, planned: Math.max(250000, Math.round(operationsEstimate * 0.05)) };
      return line;
    });
    persist(generated);
    setEditing(true);
    addToast('Budget generated from current school records', 'success');
  }

  function updateLine(id: string, patch: Partial<BudgetLine>) {
    persist(budget.map(line => line.id === id ? { ...line, ...patch } : line));
  }

  function addLine() {
    const category = draft.category.trim();
    if (!category) {
      addToast('Enter a budget category', 'error');
      return;
    }
    persist([
      ...budget,
      {
        id: crypto.randomUUID(),
        type: draft.type,
        category,
        planned: moneyValue(draft.planned),
        notes: draft.notes.trim(),
      },
    ]);
    setDraft({ type: 'expense', category: '', planned: '', notes: '' });
  }

  function exportBudget() {
    exportToCSV(
      budget.map(line => ({
        Type: line.type,
        Category: line.category,
        Planned: line.planned,
        Notes: line.notes,
      })),
      'school-budget',
      [
        { key: 'Type', label: 'Type' },
        { key: 'Category', label: 'Category' },
        { key: 'Planned', label: 'Planned' },
        { key: 'Notes', label: 'Notes' },
      ]
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div className="page-title">
          <h1 className="text-title">School Budget</h1>
          <p className="text-subtitle">Auto-generate, edit, and export budget lines</p>
        </div>
        <div className="page-actions">
          <button type="button" onClick={autoGenerateBudget} className="btn btn-secondary">
            <RefreshCw size={16} /> Auto Generate
          </button>
          <button type="button" onClick={() => setEditing(value => !value)} className="btn btn-primary">
            {editing ? <><Check size={16} /> Done</> : <><Edit3 size={16} /> Edit</>}
          </button>
          <button type="button" onClick={exportBudget} className="btn btn-secondary">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card-solid-emerald p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <p className="text-sm font-semibold text-white/80">Planned Income</p>
          <p className="mt-3 text-2xl font-black">{formatMoney(totals.income)}</p>
        </div>
        <div className="card-solid-rose p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all">
          <p className="text-sm font-semibold text-white/80">Planned Expenses</p>
          <p className="mt-3 text-2xl font-black">{formatMoney(totals.expense)}</p>
        </div>
        <div className={`${totals.balance >= 0 ? 'card-solid-indigo' : 'card-solid-amber'} p-5 rounded-2xl shadow-lg hover:shadow-xl transition-all`}>
          <p className="text-sm font-semibold text-white/80">Budget Balance</p>
          <p className="mt-3 text-2xl font-black">{formatMoney(totals.balance)}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="card p-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Calculator size={19} />
            </div>
            <h2 className="font-bold text-slate-900 dark:text-white">New Budget Line</h2>
          </div>
          <div className="space-y-3">
            <div>
              <label className="form-label">Type</label>
              <PortalSelect
                value={draft.type}
                onChange={value => setDraft(prev => ({ ...prev, type: value as BudgetLineType }))}
                options={[
                  { value: 'income', label: 'Income' },
                  { value: 'expense', label: 'Expense' },
                ]}
                className="filter-select filter-input-active"
              />
            </div>
            <div>
              <label className="form-label">Category</label>
              <input className="form-input" value={draft.category} onChange={e => setDraft(prev => ({ ...prev, category: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Planned Amount</label>
              <input type="number" min="0" className="form-input" value={draft.planned} onChange={e => setDraft(prev => ({ ...prev, planned: e.target.value }))} />
            </div>
            <div>
              <label className="form-label">Notes</label>
              <textarea className="form-input min-h-[88px]" value={draft.notes} onChange={e => setDraft(prev => ({ ...prev, notes: e.target.value }))} />
            </div>
            <button type="button" onClick={addLine} className="btn btn-primary w-full justify-center">
              <Plus size={16} /> Add Line
            </button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 dark:border-slate-700">
            <h2 className="font-bold text-slate-900 dark:text-white">Budget Worksheet</h2>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-slate-700 dark:text-slate-300">{budget.length} lines</span>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr><th>Type</th><th>Category</th><th>Planned</th><th>Notes</th><th>Action</th></tr>
              </thead>
              <tbody>
                {budget.map(line => (
                  <tr key={line.id} className="animate-slide-down">
                    <td>
                      <span className={`badge ${line.type === 'income' ? 'badge-success' : 'badge-danger'}`}>{line.type}</span>
                    </td>
                    <td>
                      {editing ? (
                        <input className="form-input min-w-48 py-1.5 text-xs" value={line.category} onChange={e => updateLine(line.id, { category: e.target.value })} />
                      ) : (
                        <p className="font-bold text-slate-800 dark:text-white">{line.category}</p>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input type="number" className="form-input min-w-36 py-1.5 text-xs" value={line.planned} onChange={e => updateLine(line.id, { planned: moneyValue(e.target.value) })} />
                      ) : (
                        <span className="font-bold">{formatMoney(line.planned)}</span>
                      )}
                    </td>
                    <td>
                      {editing ? (
                        <input className="form-input min-w-56 py-1.5 text-xs" value={line.notes} onChange={e => updateLine(line.id, { notes: e.target.value })} />
                      ) : (
                        <span className="text-sm text-slate-500">{line.notes || '-'}</span>
                      )}
                    </td>
                    <td>
                      <button type="button" className="btn btn-secondary text-rose-600" onClick={() => persist(budget.filter(item => item.id !== line.id))}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
                {budget.length === 0 && (
                  <tr><td colSpan={5} className="py-12 text-center text-sm font-semibold text-slate-400">No budget lines</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {editing && (
            <div className="flex justify-end border-t border-slate-100 p-4 dark:border-slate-700">
              <button type="button" onClick={() => setEditing(false)} className="btn btn-primary">
                <Save size={16} /> Save Budget
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
