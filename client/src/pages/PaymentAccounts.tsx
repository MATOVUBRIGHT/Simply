import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, CreditCard, Eye, EyeOff, FileText, Plus, Save, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { shouldSaveOnEnter } from '../utils/keyboard';
import { PortalSelect } from '../components/PortalSelect';

type AccountDraft = {
  accountName: string;
  accountNumber: string;
  bankName: string;
  bankBranch: string;
  paymentMethod: string;
  hidden?: boolean;
};

const accountSuffixes = ['', '2', '3'];
const blankAccount: AccountDraft = { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: 'BANK TRANSFER', hidden: false };
const defaultAccounts: AccountDraft[] = [
  { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: 'BANK TRANSFER', hidden: false },
  { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: 'MOBILE MONEY', hidden: false },
  { accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: 'CASH', hidden: false },
];

function isMobileMoney(method: string) {
  return method.toLowerCase().includes('mobile');
}

function isCash(method: string) {
  return method.toLowerCase().includes('cash');
}

export default function PaymentAccounts() {
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const sid = schoolId || user?.id || '';
  const { data: settingsData, loading: settingsLoading } = useTableData(sid, 'settings');
  const [accounts, setAccounts] = useState<AccountDraft[]>(defaultAccounts);
  const [saving, setSaving] = useState(false);
  const hydratedSettingsKeyRef = useRef('');
  const editedRef = useRef(false);

  const settingsMap = useMemo(() => {
    const map: Record<string, string> = {};
    (settingsData as any[]).forEach(row => { map[row.key] = row.value; });
    return map;
  }, [settingsData]);

  useEffect(() => {
    if (!sid) return;
    if (settingsLoading && settingsData.length === 0) return;
    if (settingsData.length === 0 && hydratedSettingsKeyRef.current) return;
    const settingsKey = JSON.stringify({
      paymentAccountsJson: settingsMap.paymentAccountsJson || '',
      legacy: accountSuffixes.map(suffix => [
        settingsMap[`bankAccountName${suffix}`] || '',
        settingsMap[`bankAccountNumber${suffix}`] || '',
        settingsMap[`bankName${suffix}`] || '',
        settingsMap[`bankBranch${suffix}`] || '',
        settingsMap[`paymentMethod${suffix}`] || '',
        settingsMap[`paymentAccountHidden${suffix}`] || '',
      ]),
    });
    if (hydratedSettingsKeyRef.current === settingsKey) return;
    if (editedRef.current && !settingsMap.paymentAccountsJson && settingsData.length === 0) return;

    try {
      const saved = settingsMap.paymentAccountsJson ? JSON.parse(settingsMap.paymentAccountsJson) : null;
      if (Array.isArray(saved) && saved.length > 0) {
        setAccounts(saved.map((account: Partial<AccountDraft>) => ({
          ...blankAccount,
          ...account,
          bankName: isMobileMoney(account.paymentMethod || '') ? '' : account.bankName || '',
          bankBranch: isMobileMoney(account.paymentMethod || '') || isCash(account.paymentMethod || '') ? '' : account.bankBranch || '',
          accountNumber: isCash(account.paymentMethod || '') ? '' : account.accountNumber || '',
          hidden: Boolean(account.hidden),
        })));
        hydratedSettingsKeyRef.current = settingsKey;
        editedRef.current = false;
        return;
      }
    } catch {
      // Fall through to legacy account settings.
    }

    setAccounts(accountSuffixes.map((suffix, index) => ({
      ...defaultAccounts[index],
      accountName: settingsMap[`bankAccountName${suffix}`] || '',
      accountNumber: settingsMap[`bankAccountNumber${suffix}`] || '',
      bankName: isMobileMoney(settingsMap[`paymentMethod${suffix}`] || defaultAccounts[index].paymentMethod) ? '' : settingsMap[`bankName${suffix}`] || '',
      bankBranch: isMobileMoney(settingsMap[`paymentMethod${suffix}`] || defaultAccounts[index].paymentMethod) || isCash(settingsMap[`paymentMethod${suffix}`] || defaultAccounts[index].paymentMethod) ? '' : settingsMap[`bankBranch${suffix}`] || '',
      paymentMethod: settingsMap[`paymentMethod${suffix}`] || defaultAccounts[index].paymentMethod,
      hidden: settingsMap[`paymentAccountHidden${suffix}`] === 'true',
    })));
    hydratedSettingsKeyRef.current = settingsKey;
    editedRef.current = false;
  }, [settingsData.length, settingsLoading, settingsMap, sid]);

  function updateAccount(index: number, updates: Partial<AccountDraft>) {
    editedRef.current = true;
    setAccounts(prev => prev.map((account, i) => {
      if (i !== index) return account;
      const next = { ...account, ...updates };
      if (isMobileMoney(next.paymentMethod)) return { ...next, bankName: '', bankBranch: '' };
      if (isCash(next.paymentMethod)) return { ...next, accountNumber: '', bankBranch: '' };
      return next;
    }));
  }

  function addAccount() {
    editedRef.current = true;
    setAccounts(prev => [...prev, { ...blankAccount }]);
  }

  function deleteAccount(index: number) {
    editedRef.current = true;
    setAccounts(prev => prev.filter((_, i) => i !== index));
  }

  async function saveAccounts() {
    if (!sid || saving) return;
    setSaving(true);
    try {
      const payload: Record<string, string> = {};
      const cleanedAccounts = accounts.map(account => ({
        accountName: account.accountName.trim(),
        accountNumber: isCash(account.paymentMethod) ? '' : account.accountNumber.trim(),
        bankName: isMobileMoney(account.paymentMethod) ? '' : account.bankName.trim(),
        bankBranch: isMobileMoney(account.paymentMethod) || isCash(account.paymentMethod) ? '' : account.bankBranch.trim(),
        paymentMethod: account.paymentMethod.trim(),
        hidden: Boolean(account.hidden),
      }));
      payload.paymentAccountsJson = JSON.stringify(cleanedAccounts);
      accountSuffixes.forEach((suffix, index) => {
        const account = cleanedAccounts[index] || { ...blankAccount, accountName: '', accountNumber: '', bankName: '', bankBranch: '', paymentMethod: '', hidden: false };
        payload[`bankAccountName${suffix}`] = account.accountName.trim();
        payload[`bankAccountNumber${suffix}`] = account.accountNumber.trim();
        payload[`bankName${suffix}`] = account.bankName.trim();
        payload[`bankBranch${suffix}`] = account.bankBranch.trim();
        payload[`paymentMethod${suffix}`] = account.paymentMethod.trim();
        payload[`paymentAccountHidden${suffix}`] = account.hidden ? 'true' : 'false';
      });
      await dataService.saveSettings(sid, payload);
      hydratedSettingsKeyRef.current = JSON.stringify({
        paymentAccountsJson: payload.paymentAccountsJson,
        legacy: accountSuffixes.map(suffix => [
          payload[`bankAccountName${suffix}`] || '',
          payload[`bankAccountNumber${suffix}`] || '',
          payload[`bankName${suffix}`] || '',
          payload[`bankBranch${suffix}`] || '',
          payload[`paymentMethod${suffix}`] || '',
          payload[`paymentAccountHidden${suffix}`] || '',
        ]),
      });
      editedRef.current = false;
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
      addToast('Payment accounts saved', 'success');
    } catch {
      addToast('Failed to save payment accounts', 'error');
    } finally {
      setSaving(false);
    }
  }

  const activeAccounts = accounts.filter(account =>
    !account.hidden && (account.accountName.trim() || account.accountNumber.trim() || account.bankName.trim() || account.bankBranch.trim() || account.paymentMethod.trim())
  );

  return (
    <div
      className="space-y-6 animate-fade-in"
      onKeyDown={e => {
        if (!shouldSaveOnEnter(e)) return;
        e.preventDefault();
        void saveAccounts();
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/finance?tab=accounts" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
            <ArrowLeft size={16} /> Finance accounts
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Payment Accounts</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set the account details and payment methods shown on student invoices.
          </p>
        </div>
        <div className="action-row">
          <button onClick={addAccount} className="btn btn-secondary">
            <Plus size={18} /> Add Account
          </button>
          <button onClick={saveAccounts} disabled={saving} className="btn btn-primary shadow-lg shadow-primary-500/25 disabled:opacity-70">
            <Save size={18} /> {saving ? 'Saving...' : 'Save Accounts'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {accounts.map((account, index) => (
          <section key={index} className="card overflow-hidden">
            <div className="card-header flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">
                <CreditCard size={18} />
              </div>
              <div>
                <h2 className="font-bold text-slate-800 dark:text-white">Payment Method {index + 1}</h2>
                <p className="text-xs text-slate-500">{account.hidden ? 'Held from invoice display' : 'Shown on invoice payment details'}</p>
              </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => updateAccount(index, { hidden: !account.hidden })}
                  className={`rounded-lg p-2 transition-colors ${account.hidden ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}
                  title={account.hidden ? 'Show on invoices' : 'Hold from invoices'}
                >
                  {account.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
                <button
                  type="button"
                  onClick={() => deleteAccount(index)}
                  className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                  title="Delete account"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
            <div className="card-body space-y-4">
              <div>
                <label className="form-label">Payment Method</label>
                <PortalSelect
                  value={account.paymentMethod}
                  onChange={value => updateAccount(index, { paymentMethod: value })}
                  options={[
                    { value: 'BANK TRANSFER', label: 'Bank Transfer' },
                    { value: 'MOBILE MONEY', label: 'Mobile Money' },
                    { value: 'CASH', label: 'Cash' },
                    { value: 'CHEQUE', label: 'Cheque' },
                    { value: 'OTHER', label: 'Other' },
                  ]}
                />
              </div>
              {!isMobileMoney(account.paymentMethod) && (
                <div>
                  <label className="form-label">{isCash(account.paymentMethod) ? 'Collection Point' : 'Bank / Provider'}</label>
                  <input
                    value={account.bankName}
                    onChange={e => updateAccount(index, { bankName: e.target.value })}
                    className="form-input"
                    placeholder={isCash(account.paymentMethod) ? 'Accounts office, bursar desk...' : 'Bank or payment provider'}
                  />
                </div>
              )}
              {!isMobileMoney(account.paymentMethod) && !isCash(account.paymentMethod) && (
                <div>
                  <label className="form-label">Branch</label>
                  <input
                    value={account.bankBranch}
                    onChange={e => updateAccount(index, { bankBranch: e.target.value })}
                    className="form-input"
                    placeholder="Bank branch"
                  />
                </div>
              )}
              <div>
                <label className="form-label">{isCash(account.paymentMethod) ? 'Accepted By' : 'Account Name'}</label>
                <input
                  value={account.accountName}
                  onChange={e => updateAccount(index, { accountName: e.target.value })}
                  className="form-input"
                  placeholder={isCash(account.paymentMethod) ? 'Bursar, cashier, accounts office...' : 'School account name'}
                />
              </div>
              {!isCash(account.paymentMethod) && (
                <div>
                  <label className="form-label">{isMobileMoney(account.paymentMethod) ? 'Mobile Money Number' : 'Account Number'}</label>
                  <input
                    value={account.accountNumber}
                    onChange={e => updateAccount(index, { accountNumber: e.target.value })}
                    className="form-input"
                    placeholder={isMobileMoney(account.paymentMethod) ? 'Mobile money number' : 'Account number'}
                  />
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="card-header flex items-center gap-2">
          <FileText size={18} className="text-indigo-500" />
          <h2 className="font-bold text-slate-800 dark:text-white">Invoice Preview</h2>
        </div>
        <div className="card-body">
          {activeAccounts.length === 0 ? (
            <p className="text-sm text-slate-400">No account details entered yet.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {activeAccounts.map((account, index) => (
                <div key={index} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                  <div className="mb-3 flex items-center gap-2">
                    <Building2 size={16} className="text-primary-500" />
                    <p className="font-bold text-slate-800 dark:text-white">{isCash(account.paymentMethod) ? 'Cash Payment' : isMobileMoney(account.paymentMethod) ? 'Mobile Money' : account.bankName || account.paymentMethod || `Account ${index + 1}`}</p>
                  </div>
                  {isCash(account.paymentMethod) ? (
                    <>
                      <p className="text-xs text-slate-400">Accepted By</p>
                      <p className="text-sm font-bold text-indigo-600 dark:text-indigo-300">{account.accountName || 'Accounts office'}</p>
                      <p className="mt-3 text-xs text-slate-400">Collection Point</p>
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{account.bankName || 'School office'}</p>
                    </>
                  ) : (
                    <>
                      {!isMobileMoney(account.paymentMethod) && (
                        <>
                          <p className="text-xs text-slate-400">Branch</p>
                          <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{account.bankBranch || '-'}</p>
                        </>
                      )}
                      <p className="text-xs text-slate-400">{isMobileMoney(account.paymentMethod) ? 'Mobile Money Number' : 'Account Number'}</p>
                      <p className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-300">{account.accountNumber || '-'}</p>
                      <p className="mt-3 text-xs text-slate-400">Account Name</p>
                    </>
                  )}
                  {!isCash(account.paymentMethod) && (
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{account.accountName || '-'}</p>
                  )}
                  <span className="mt-3 inline-flex rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold uppercase text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                    {account.paymentMethod || 'Payment'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
