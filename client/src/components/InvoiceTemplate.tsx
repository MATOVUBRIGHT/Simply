import React, { useRef } from 'react';
import { Phone, Mail, MapPin, Printer, Download, X, Palette, Check, RefreshCw, Upload } from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';
import LiveEditable from './LiveEditable';
import { openPrintPreview } from '../utils/printPreview';
import { FullscreenButton } from './FullscreenButton';

export interface InvoiceLabels {
  invoiceTitle: string;
  billToLabel: string;
  invoiceNoLabel: string;
  dateLabel: string;
  dueDateLabel: string;
  termLabel: string;
  productLabel: string;
  priceLabel: string;
  qtyLabel: string;
  totalLabel: string;
  paymentDataLabel: string;
  branchLabel: string;
  accountNoLabel: string;
  accountNameLabel: string;
  methodLabel: string;
  subtotalLabel: string;
  openingBalanceLabel: string;
  termChargesLabel: string;
  paidLabel: string;
  closingBalanceLabel: string;
  taxLabel: string;
  grandTotalLabel: string;
  termsTitle: string;
  termsText: string;
  phoneLabel: string;
  emailLabel: string;
  addressLabel: string;
  textColor: string;
  mutedTextColor: string;
  accentColor: string;
  tableHeaderBg: string;
  tableHeaderTextColor: string;
  logo: string;
}

export const DEFAULT_INVOICE_LABELS: InvoiceLabels = {
  invoiceTitle: 'INVOICE',
  billToLabel: 'BILL TO',
  invoiceNoLabel: 'INVOICE#',
  dateLabel: 'Date:',
  dueDateLabel: 'Due Date:',
  termLabel: 'Term:',
  productLabel: 'Fee Description',
  priceLabel: 'Price',
  qtyLabel: 'Qty',
  totalLabel: 'Total',
  paymentDataLabel: 'Payment Data:',
  branchLabel: 'Branch:',
  accountNoLabel: 'Account#:',
  accountNameLabel: 'Name:',
  methodLabel: 'Payment Method:',
  subtotalLabel: 'Subtotal',
  openingBalanceLabel: 'Opening Balance',
  termChargesLabel: 'This Term',
  paidLabel: 'Paid',
  closingBalanceLabel: 'Closing Balance',
  taxLabel: 'Tax',
  grandTotalLabel: 'Total',
  termsTitle: 'Terms and Conditions',
  termsText: 'Please make school fee payments before the due date. For any questions about this invoice, contact the school accounts office. Thank you for supporting the learner and the school.',
  phoneLabel: 'Phone',
  emailLabel: 'Email',
  addressLabel: 'Address',
  textColor: '#0f172a',
  mutedTextColor: '#64748b',
  accentColor: '#6366f1',
  tableHeaderBg: '#0f172a',
  tableHeaderTextColor: '#ffffff',
  logo: '',
};

interface InvoiceTemplateProps {
  school: {
    name: string;
    address: string;
    phone: string;
    email: string;
    logo: string;
    motto?: string;
  };
  student: {
    name: string;
    id: string;
    class: string;
    guardian: string;
    address: string;
    phone: string;
    email: string;
  };
  invoice: {
    number: string;
    date: string;
    dueDate: string;
    items: { description: string; amount: number; qty: number }[];
    subtotal: number;
    openingBalance?: number;
    termCharges?: number;
    tax: number;
    total: number;
    paid: number;
    balance: number;
    closingBalance?: number;
    status: string;
    term: string;
    year: string;
  };
  bankInfo?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    bankBranch?: string;
    paymentMethod: string;
  };
  labels?: InvoiceLabels;
  isLiveEditing?: boolean;
  onUpdateLabels?: (labels: Partial<InvoiceLabels>) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onToggleLiveEdit?: () => void;
  onClose?: () => void;
}

const InvoiceTemplate: React.FC<InvoiceTemplateProps> = ({
  school,
  student,
  invoice,
  bankInfo,
  labels = DEFAULT_INVOICE_LABELS,
  isLiveEditing = false,
  onUpdateLabels,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
  onToggleLiveEdit,
  onClose
}) => {
  const { formatMoney } = useCurrency();
  const logoInputRef = useRef<HTMLInputElement>(null);
  const updateLabel = (key: keyof InvoiceLabels, value: string) => {
    onUpdateLabels?.({ [key]: value });
  };
  const handleLogoUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') updateLabel('logo', reader.result);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };
  const templateStudent = isLiveEditing
    ? {
        name: 'Student Name',
        id: 'Student ID',
        class: 'Class Name',
        guardian: '',
        address: 'Student Address',
        phone: 'Student Phone',
        email: 'Student Email',
      }
    : student;
  const templateInvoice = isLiveEditing
    ? {
        ...invoice,
        number: 'INV-0000-TERM-YEAR',
        date: 'Invoice Date',
        dueDate: 'Due Date',
        term: 'Term',
        year: 'Year',
        items: [
          { description: 'Tuition Fee', amount: 1000, qty: 1 },
          { description: 'Boarding Fee', amount: 500, qty: 1 },
        ],
        subtotal: 1500,
        openingBalance: 0,
        termCharges: 1500,
        tax: 0,
        total: 1500,
        paid: 0,
        balance: 1500,
        closingBalance: 1500,
      }
    : invoice;
  const validItems = templateInvoice.items.filter(item => {
    const description = String(item.description || '').trim();
    return description && description.toLowerCase() !== 'item name / description';
  });
  const isCashPayment = String(bankInfo?.paymentMethod || '').toLowerCase().includes('cash');
  const textStyle = { color: labels.textColor };
  const mutedStyle = { color: labels.mutedTextColor };
  const displayLogo = labels.logo || school.logo;

  return (
    <div data-preview-fullscreen-root className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-y-auto max-w-4xl w-full mx-auto my-4 animate-modal-in flex flex-col" style={{ maxHeight: 'calc(100vh - 2rem)' }}>
      {/* Header Toolbar */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50 print:hidden">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
              <Printer size={18} />
            </div>
            <h2 className="font-bold text-slate-800 dark:text-white">Invoice Preview</h2>
          </div>
          
          {/* Live Edit Controls */}
          <div className="flex items-center gap-2 border-l pl-4 dark:border-slate-700">
            <button 
              onClick={onToggleLiveEdit || (() => onUpdateLabels?.({}))}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${isLiveEditing ? 'bg-yellow-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'}`}
              id="toggle-live-edit"
            >
              {isLiveEditing ? <Check size={14} /> : <Palette size={14} />}
              {isLiveEditing ? 'Finish Editing' : 'Live Edit'}
            </button>
            
            {isLiveEditing && (
              <div className="flex items-center gap-1">
                <button 
                  onClick={onUndo} 
                  disabled={!canUndo}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                >
                  <RefreshCw size={14} className="rotate-[-90deg]" />
                </button>
                <button 
                  onClick={onRedo} 
                  disabled={!canRedo}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30"
                >
                  <RefreshCw size={14} className="scale-x-[-1] rotate-[-90deg]" />
                </button>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <FullscreenButton />
          <button 
            onClick={() => openPrintPreview('Invoice', '#invoice-print')} 
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-all"
          >
            <Download size={16} />
            Print / Save PDF
          </button>
          {onClose && (
            <button 
              onClick={onClose}
              className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-full text-slate-500 transition-colors"
            >
              <X size={20} />
            </button>
          )}
        </div>
      </div>

      <div className={`grid min-h-0 flex-1 gap-4 overflow-y-auto ${isLiveEditing ? 'lg:grid-cols-[15rem_minmax(0,1fr)]' : ''}`}>
        {isLiveEditing && (
          <aside className="print:hidden h-fit rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800 lg:sticky lg:top-2">
            <div className="mb-3 flex items-center gap-2">
              <Palette size={16} className="text-indigo-600" />
              <h3 className="text-sm font-black text-slate-800 dark:text-white">Template Tools</h3>
            </div>
            <div className="space-y-3">
              {[
                ['textColor', 'Text'],
                ['mutedTextColor', 'Muted'],
                ['accentColor', 'Accent'],
                ['tableHeaderBg', 'Table'],
                ['tableHeaderTextColor', 'Header Text'],
              ].map(([key, label]) => (
                <div key={key}>
                  <label className="mb-1 block text-xs font-bold text-slate-500">{label}</label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={(labels[key as keyof InvoiceLabels] as string) || '#000000'} onChange={event => updateLabel(key as keyof InvoiceLabels, event.target.value)} className="h-9 w-10 rounded border border-slate-200" />
                    <input value={(labels[key as keyof InvoiceLabels] as string) || ''} onChange={event => updateLabel(key as keyof InvoiceLabels, event.target.value)} className="form-input h-9 min-h-0 flex-1 px-2 py-1 font-mono text-xs" />
                  </div>
                </div>
              ))}
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Logo</label>
                <div className="flex gap-2">
                  <input value={labels.logo || school.logo || ''} onChange={event => updateLabel('logo', event.target.value)} className="form-input h-9 min-h-0 flex-1 px-2 py-1 text-xs" placeholder="Image URL" />
                  <button type="button" onClick={() => logoInputRef.current?.click()} className="rounded-lg border border-slate-200 px-2 text-slate-600 hover:bg-slate-50" title="Upload logo">
                    <Upload size={15} />
                  </button>
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </div>
            </div>
          </aside>
        )}

      {/* Invoice Content */}
      <div id="invoice-print" className="p-8 sm:p-12 bg-white print:p-0" style={{ fontFamily: 'Inter, system-ui, sans-serif', color: labels.textColor }}>
        {/* Top Section */}
        <div className="flex justify-between items-start mb-12">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-indigo-500/20 shrink-0" style={{ backgroundColor: labels.accentColor }}>
              {displayLogo ? (
                <img src={displayLogo} alt="School Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <span className="text-3xl font-black">S</span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight" style={textStyle}>{school.name}</h1>
              <p className="text-sm font-medium" style={mutedStyle}>{school.motto || 'Education for the Future'}</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-5xl font-black uppercase italic tracking-tighter mb-2" style={{ color: labels.accentColor }}>
              <LiveEditable value={labels.invoiceTitle} onSave={v => updateLabel('invoiceTitle', v)} isLiveEditing={isLiveEditing} />
            </h2>
          </div>
        </div>

        {/* Bill To & Invoice Info */}
        <div className="flex justify-between mb-12">
          <div className="max-w-[50%]">
            <h4 className="text-[10px] font-black uppercase tracking-widest mb-1" style={mutedStyle}>
              <LiveEditable value={labels.billToLabel} onSave={v => updateLabel('billToLabel', v)} isLiveEditing={isLiveEditing} />
            </h4>
            <h3 className="text-2xl font-black mb-1" style={textStyle}>{templateStudent.name}</h3>
            <p className="font-bold mb-3" style={mutedStyle}>
              {[templateStudent.id ? `ID: ${templateStudent.id}` : '', templateStudent.class ? `Class: ${templateStudent.class}` : ''].filter(Boolean).join(' | ')}
            </p>
            <div className="space-y-1 text-sm font-medium" style={mutedStyle}>
              <p>{templateStudent.address || 'Address not provided'}</p>
              <p>{templateStudent.email}</p>
              <p>{templateStudent.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-slate-400 font-black uppercase text-xs mb-1">
              <LiveEditable value={labels.invoiceNoLabel} onSave={v => updateLabel('invoiceNoLabel', v)} isLiveEditing={isLiveEditing} />
            </p>
            <p className="text-xl font-bold" style={textStyle}>{templateInvoice.number}</p>
            <div className="mt-4 space-y-1">
              <p className="text-sm">
                <span className="text-slate-400 font-bold uppercase text-[10px] mr-2">
                  <LiveEditable value={labels.dateLabel} onSave={v => updateLabel('dateLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {templateInvoice.date}
              </p>
              <p className="text-sm">
                <span className="text-slate-400 font-bold uppercase text-[10px] mr-2">
                  <LiveEditable value={labels.dueDateLabel} onSave={v => updateLabel('dueDateLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {templateInvoice.dueDate}
              </p>
              <p className="text-sm">
                <span className="text-slate-400 font-bold uppercase text-[10px] mr-2">
                  <LiveEditable value={labels.termLabel} onSave={v => updateLabel('termLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {templateInvoice.term} {templateInvoice.year}
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mb-12">
          <table className="w-full">
            <thead>
              <tr style={{ backgroundColor: labels.tableHeaderBg, color: labels.tableHeaderTextColor }}>
                <th className="px-6 py-3 text-left text-xs font-black uppercase tracking-widest rounded-l-lg">
                  <LiveEditable value={labels.productLabel} onSave={v => updateLabel('productLabel', v)} isLiveEditing={isLiveEditing} />
                </th>
                <th className="px-6 py-3 text-right text-xs font-black uppercase tracking-widest">
                  <LiveEditable value={labels.priceLabel} onSave={v => updateLabel('priceLabel', v)} isLiveEditing={isLiveEditing} />
                </th>
                <th className="px-6 py-3 text-center text-xs font-black uppercase tracking-widest">
                  <LiveEditable value={labels.qtyLabel} onSave={v => updateLabel('qtyLabel', v)} isLiveEditing={isLiveEditing} />
                </th>
                <th className="px-6 py-3 text-right text-xs font-black uppercase tracking-widest rounded-r-lg">
                  <LiveEditable value={labels.totalLabel} onSave={v => updateLabel('totalLabel', v)} isLiveEditing={isLiveEditing} />
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {validItems.map((item, index) => (
                <tr key={index}>
                  <td className="px-6 py-5 text-sm font-medium" style={mutedStyle}>{item.description}</td>
                  <td className="px-6 py-5 text-right text-sm font-bold" style={textStyle}>{formatMoney(item.amount)}</td>
                  <td className="px-6 py-5 text-center text-sm font-medium" style={mutedStyle}>{item.qty}</td>
                  <td className="px-6 py-5 text-right text-sm font-black" style={textStyle}>{formatMoney(item.amount * item.qty)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Info & Totals */}
        <div className="flex justify-between items-start mb-12">
          <div className="max-w-[50%]">
            <h4 className="text-[10px] font-black uppercase tracking-widest mb-3" style={mutedStyle}>
              <LiveEditable value={labels.paymentDataLabel} onSave={v => updateLabel('paymentDataLabel', v)} isLiveEditing={isLiveEditing} />
            </h4>
            <div className="space-y-1.5 text-xs font-bold" style={mutedStyle}>
              {isCashPayment ? (
                <>
                  <p>
                    <span className="text-slate-400 uppercase tracking-tighter mr-2">Accepted By:</span>
                    {bankInfo?.accountName || 'Accounts office'}
                  </p>
                  <p>
                    <span className="text-slate-400 uppercase tracking-tighter mr-2">Collection Point:</span>
                    {bankInfo?.bankName || 'School office'}
                  </p>
                </>
              ) : (
                <>
                  {bankInfo?.bankName && (
                    <p>
                      <span className="text-slate-400 uppercase tracking-tighter mr-2">Bank:</span>
                      {bankInfo.bankName}
                    </p>
                  )}
                  {bankInfo?.bankBranch && (
                    <p>
                      <span className="text-slate-400 uppercase tracking-tighter mr-2">
                        <LiveEditable value={labels.branchLabel} onSave={v => updateLabel('branchLabel', v)} isLiveEditing={isLiveEditing} />
                      </span> {bankInfo.bankBranch}
                    </p>
                  )}
                  <p>
                    <span className="text-slate-400 uppercase tracking-tighter mr-2">
                      <LiveEditable value={labels.accountNoLabel} onSave={v => updateLabel('accountNoLabel', v)} isLiveEditing={isLiveEditing} />
                    </span> {bankInfo?.accountNumber || '-'}
                  </p>
                  <p>
                    <span className="text-slate-400 uppercase tracking-tighter mr-2">
                      <LiveEditable value={labels.accountNameLabel} onSave={v => updateLabel('accountNameLabel', v)} isLiveEditing={isLiveEditing} />
                    </span> {bankInfo?.accountName || school.name}
                  </p>
                </>
              )}
              <p>
                <span className="text-slate-400 uppercase tracking-tighter mr-2">
                  <LiveEditable value={labels.methodLabel} onSave={v => updateLabel('methodLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {bankInfo?.paymentMethod || 'BANK TRANSFER / CASH'}
              </p>
            </div>
          </div>
          <div className="w-64 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="font-black uppercase tracking-widest text-slate-400">
                <LiveEditable value={labels.subtotalLabel} onSave={v => updateLabel('subtotalLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="font-bold" style={textStyle}>{formatMoney(templateInvoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-black uppercase tracking-widest text-slate-400">
                <LiveEditable value={labels.openingBalanceLabel} onSave={v => updateLabel('openingBalanceLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="font-bold" style={textStyle}>{formatMoney(templateInvoice.openingBalance || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-black uppercase tracking-widest text-slate-400">
                <LiveEditable value={labels.termChargesLabel} onSave={v => updateLabel('termChargesLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="font-bold" style={textStyle}>{formatMoney(templateInvoice.termCharges ?? templateInvoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-black uppercase tracking-widest text-slate-400">
                <LiveEditable value={labels.paidLabel} onSave={v => updateLabel('paidLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="font-bold text-emerald-600">{formatMoney(templateInvoice.paid || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-black uppercase tracking-widest text-slate-400">
                <LiveEditable value={labels.taxLabel} onSave={v => updateLabel('taxLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="font-bold" style={textStyle}>{formatMoney(templateInvoice.tax)}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t-2 border-slate-900">
              <span className="text-lg font-black uppercase tracking-widest" style={textStyle}>
                <LiveEditable value={labels.closingBalanceLabel || labels.grandTotalLabel} onSave={v => updateLabel('closingBalanceLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="text-2xl font-black" style={{ color: labels.accentColor }}>{formatMoney(templateInvoice.closingBalance ?? templateInvoice.balance ?? templateInvoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="mb-12 pt-8 border-t border-slate-100">
          <h4 className="text-[10px] font-black uppercase tracking-widest mb-3" style={textStyle}>
            <LiveEditable value={labels.termsTitle} onSave={v => updateLabel('termsTitle', v)} isLiveEditing={isLiveEditing} />
          </h4>
          <p className="text-[10px] leading-relaxed font-medium" style={mutedStyle}>
            <LiveEditable value={labels.termsText} onSave={v => updateLabel('termsText', v)} isLiveEditing={isLiveEditing} />
          </p>
        </div>

        {/* Footer Info */}
        <div className="flex justify-between items-center py-6 border-t-2 border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Phone size={14} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">
                <LiveEditable value={labels.phoneLabel} onSave={v => updateLabel('phoneLabel', v)} isLiveEditing={isLiveEditing} />
              </p>
              <p className="text-xs font-bold" style={textStyle}>{school.phone}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
              <Mail size={14} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">
                <LiveEditable value={labels.emailLabel} onSave={v => updateLabel('emailLabel', v)} isLiveEditing={isLiveEditing} />
              </p>
              <p className="text-xs font-bold" style={textStyle}>{school.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-500">
              <MapPin size={14} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">
                <LiveEditable value={labels.addressLabel} onSave={v => updateLabel('addressLabel', v)} isLiveEditing={isLiveEditing} />
              </p>
              <p className="text-xs font-bold" style={textStyle}>{school.address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Blue Design Element at Bottom */}
      <div className="h-6 relative mt-auto" style={{ backgroundColor: labels.tableHeaderBg }}>
        <div className="absolute right-0 top-0 bottom-0 w-1/3" style={{ backgroundColor: labels.accentColor, clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0% 100%)' }}></div>
      </div>
      </div>
    </div>
  );
};

export default InvoiceTemplate;
