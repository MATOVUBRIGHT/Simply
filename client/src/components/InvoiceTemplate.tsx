import React from 'react';
import { Phone, Mail, MapPin, Printer, Download, X, Palette, Check, RefreshCw } from 'lucide-react';
import { useCurrency } from '../hooks/useCurrency';
import LiveEditable from './LiveEditable';

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
  accountNoLabel: string;
  accountNameLabel: string;
  methodLabel: string;
  subtotalLabel: string;
  taxLabel: string;
  grandTotalLabel: string;
  termsTitle: string;
  termsText: string;
  phoneLabel: string;
  emailLabel: string;
  addressLabel: string;
}

export const DEFAULT_INVOICE_LABELS: InvoiceLabels = {
  invoiceTitle: 'INVOICE',
  billToLabel: 'BILL TO',
  invoiceNoLabel: 'INVOICE#',
  dateLabel: 'Date:',
  dueDateLabel: 'Due Date:',
  termLabel: 'Term:',
  productLabel: 'Product / Description',
  priceLabel: 'Price',
  qtyLabel: 'Qty',
  totalLabel: 'Total',
  paymentDataLabel: 'Payment Data:',
  accountNoLabel: 'Account#:',
  accountNameLabel: 'Name:',
  methodLabel: 'Payment Method:',
  subtotalLabel: 'Subtotal',
  taxLabel: 'Tax',
  grandTotalLabel: 'Total',
  termsTitle: 'Terms and Conditions',
  termsText: 'Please make payments before the due date to avoid service interruption. All payments are non-refundable and subject to school policies. For any queries regarding this invoice, please contact the school administration. Thank you for your continued support in providing quality education.',
  phoneLabel: 'Phone',
  emailLabel: 'Email',
  addressLabel: 'Address',
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
    tax: number;
    total: number;
    paid: number;
    balance: number;
    status: string;
    term: string;
    year: string;
  };
  bankInfo?: {
    accountName: string;
    accountNumber: string;
    bankName: string;
    paymentMethod: string;
  };
  labels?: InvoiceLabels;
  isLiveEditing?: boolean;
  onUpdateLabels?: (labels: Partial<InvoiceLabels>) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
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
  onClose
}) => {
  const { formatMoney } = useCurrency();
  const updateLabel = (key: keyof InvoiceLabels, value: string) => {
    onUpdateLabels?.({ [key]: value });
  };

  return (
    <div className="bg-white dark:bg-slate-900 min-h-screen sm:min-h-0 sm:rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full mx-auto animate-modal-in flex flex-col">
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
              onClick={() => onUpdateLabels?.({})} // Trigger toggle if needed or managed externally
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
          <button 
            onClick={() => window.print()} 
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

      {/* Invoice Content */}
      <div id="invoice-print" className="p-8 sm:p-12 bg-white text-slate-800 print:p-0 print:text-black" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
        {/* Top Section */}
        <div className="flex justify-between items-start mb-12">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-xl shadow-indigo-500/20 shrink-0">
              {school.logo ? (
                <img src={school.logo} alt="School Logo" className="w-full h-full object-contain p-2" />
              ) : (
                <span className="text-3xl font-black">S</span>
              )}
            </div>
            <div>
              <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">{school.name}</h1>
              <p className="text-sm text-slate-500 font-medium">{school.motto || 'Education for the Future'}</p>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-5xl font-black text-indigo-500 uppercase italic tracking-tighter mb-2">
              <LiveEditable value={labels.invoiceTitle} onSave={v => updateLabel('invoiceTitle', v)} isLiveEditing={isLiveEditing} />
            </h2>
          </div>
        </div>

        {/* Bill To & Invoice Info */}
        <div className="flex justify-between mb-12">
          <div className="max-w-[50%]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              <LiveEditable value={labels.billToLabel} onSave={v => updateLabel('billToLabel', v)} isLiveEditing={isLiveEditing} />
            </h4>
            <h3 className="text-2xl font-black text-slate-900 mb-1">{student.name}</h3>
            <p className="text-slate-500 font-bold mb-3">{student.guardian || 'Parent/Guardian'}</p>
            <div className="space-y-1 text-sm text-slate-500 font-medium">
              <p>{student.address || 'Address not provided'}</p>
              <p>{student.email}</p>
              <p>{student.phone}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-slate-400 font-black uppercase text-xs mb-1">
              <LiveEditable value={labels.invoiceNoLabel} onSave={v => updateLabel('invoiceNoLabel', v)} isLiveEditing={isLiveEditing} />
            </p>
            <p className="text-xl font-bold text-slate-800">{invoice.number}</p>
            <div className="mt-4 space-y-1">
              <p className="text-sm">
                <span className="text-slate-400 font-bold uppercase text-[10px] mr-2">
                  <LiveEditable value={labels.dateLabel} onSave={v => updateLabel('dateLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {invoice.date}
              </p>
              <p className="text-sm">
                <span className="text-slate-400 font-bold uppercase text-[10px] mr-2">
                  <LiveEditable value={labels.dueDateLabel} onSave={v => updateLabel('dueDateLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {invoice.dueDate}
              </p>
              <p className="text-sm">
                <span className="text-slate-400 font-bold uppercase text-[10px] mr-2">
                  <LiveEditable value={labels.termLabel} onSave={v => updateLabel('termLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {invoice.term} {invoice.year}
              </p>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="mb-12">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-900 text-white">
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
              {invoice.items.map((item, index) => (
                <tr key={index}>
                  <td className="px-6 py-5 text-sm font-medium text-slate-600">{item.description}</td>
                  <td className="px-6 py-5 text-right text-sm font-bold text-slate-800">{formatMoney(item.amount)}</td>
                  <td className="px-6 py-5 text-center text-sm font-medium text-slate-500">{item.qty}</td>
                  <td className="px-6 py-5 text-right text-sm font-black text-slate-900">{formatMoney(item.amount * item.qty)}</td>
                </tr>
              ))}
              {/* Fill empty rows to match design if needed */}
              {[...Array(Math.max(0, 5 - invoice.items.length))].map((_, i) => (
                <tr key={`empty-${i}`}>
                  <td className="px-6 py-5 text-sm text-slate-300">Item Name / Description</td>
                  <td className="px-6 py-5 text-right text-sm text-slate-300">$0</td>
                  <td className="px-6 py-5 text-center text-sm text-slate-300">0</td>
                  <td className="px-6 py-5 text-right text-sm text-slate-300">$0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Payment Info & Totals */}
        <div className="flex justify-between items-start mb-12">
          <div className="max-w-[50%]">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
              <LiveEditable value={labels.paymentDataLabel} onSave={v => updateLabel('paymentDataLabel', v)} isLiveEditing={isLiveEditing} />
            </h4>
            <div className="space-y-1.5 text-xs font-bold text-slate-600">
              <p>
                <span className="text-slate-400 uppercase tracking-tighter mr-2">
                  <LiveEditable value={labels.accountNoLabel} onSave={v => updateLabel('accountNoLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {bankInfo?.accountNumber || '12356587965497'}
              </p>
              <p>
                <span className="text-slate-400 uppercase tracking-tighter mr-2">
                  <LiveEditable value={labels.accountNameLabel} onSave={v => updateLabel('accountNameLabel', v)} isLiveEditing={isLiveEditing} />
                </span> {bankInfo?.accountName || school.name}
              </p>
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
              <span className="font-bold text-slate-800">{formatMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="font-black uppercase tracking-widest text-slate-400">
                <LiveEditable value={labels.taxLabel} onSave={v => updateLabel('taxLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="font-bold text-slate-800">{formatMoney(invoice.tax)}</span>
            </div>
            <div className="flex justify-between items-center pt-3 border-t-2 border-slate-900">
              <span className="text-lg font-black uppercase tracking-widest text-slate-900">
                <LiveEditable value={labels.grandTotalLabel} onSave={v => updateLabel('grandTotalLabel', v)} isLiveEditing={isLiveEditing} />
              </span>
              <span className="text-2xl font-black text-slate-900">{formatMoney(invoice.total)}</span>
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="mb-12 pt-8 border-t border-slate-100">
          <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-900 mb-3">
            <LiveEditable value={labels.termsTitle} onSave={v => updateLabel('termsTitle', v)} isLiveEditing={isLiveEditing} />
          </h4>
          <p className="text-[10px] leading-relaxed text-slate-500 font-medium">
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
              <p className="text-xs font-bold text-slate-700">{school.phone}</p>
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
              <p className="text-xs font-bold text-slate-700">{school.email}</p>
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
              <p className="text-xs font-bold text-slate-700">{school.address}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Blue Design Element at Bottom */}
      <div className="h-6 bg-slate-900 relative mt-auto">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-indigo-500" style={{ clipPath: 'polygon(20% 0, 100% 0, 100% 100%, 0% 100%)' }}></div>
      </div>
    </div>
  );
};

export default InvoiceTemplate;
