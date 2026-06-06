import { ChangeEvent, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImagePlus, Loader2, Trash2, Upload, X } from 'lucide-react';
import { compressImageFile, validateSafeImageFile } from '../utils/imageCompression';
import { useConfirm } from './ConfirmModal';

export interface BulkImageRecord {
  id: string;
  firstName?: string;
  lastName?: string;
  primaryId?: string;
  secondaryId?: string;
  label: string;
}

interface MatchedImage {
  file: File;
  record: BulkImageRecord | null;
  key: string;
}

interface BulkImageUpdateModalProps {
  title: string;
  entityLabel: string;
  records: BulkImageRecord[];
  onClose: () => void;
  onApply: (updates: Array<{ id: string; photoUrl: string }>) => Promise<void>;
  onRemove?: (ids: string[]) => Promise<void>;
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/\s+\(\d+\)$/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildRecordKeys(record: BulkImageRecord) {
  const first = record.firstName || '';
  const last = record.lastName || '';
  return [
    record.primaryId || '',
    record.secondaryId || '',
    record.id,
    record.label,
    `${first} ${last}`,
    `${last} ${first}`,
    `${first}${last}`,
    `${last}${first}`,
  ].map(normalize).filter(Boolean);
}

export function BulkImageUpdateModal({ title, entityLabel, records, onClose, onApply, onRemove }: BulkImageUpdateModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const confirm = useConfirm();
  const [matches, setMatches] = useState<MatchedImage[]>([]);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const lookup = useMemo(() => {
    const next = new Map<string, BulkImageRecord>();
    records.forEach(record => {
      buildRecordKeys(record).forEach(key => {
        if (!next.has(key)) next.set(key, record);
      });
    });
    return next;
  }, [records]);

  function receiveFiles(event: ChangeEvent<HTMLInputElement>) {
    const rejected: string[] = [];
    const files = Array.from(event.target.files || []).filter(file => {
      try {
        validateSafeImageFile(file);
        return true;
      } catch (err: any) {
        rejected.push(`${file.name}: ${err?.message || 'not allowed'}`);
        return false;
      }
    });
    const next = files.map(file => {
      const rawName = file.name.split(/[\\/]/).pop() || file.name;
      const key = normalize(rawName);
      return { file, key, record: lookup.get(key) || null };
    });
    setMatches(next);
    setError(rejected.length ? rejected.slice(0, 3).join('. ') : '');
    setProgress(0);
    event.target.value = '';
  }

  const matched = matches.filter(item => item.record);
  const unmatched = matches.filter(item => !item.record);
  const uniqueMatchedCount = new Set(matched.map(item => item.record!.id)).size;

  async function applyUpdates() {
    if (matched.length === 0 || processing) return;
    setProcessing(true);
    setProgress(5);
    setError('');
    try {
      const updates: Array<{ id: string; photoUrl: string }> = [];
      const seen = new Set<string>();
      for (let index = 0; index < matched.length; index += 1) {
        const item = matched[index];
        if (!item.record || seen.has(item.record.id)) continue;
        try {
          const photoUrl = await compressImageFile(item.file, 520, 0.78);
          updates.push({ id: item.record.id, photoUrl });
          seen.add(item.record.id);
        } catch (err: any) {
          setError(err?.message || `Could not process ${item.file.name}`);
        }
        setProgress(Math.max(10, Math.round(((index + 1) / matched.length) * 80)));
      }
      if (updates.length === 0) return;
      await onApply(updates);
      setProgress(100);
      window.setTimeout(onClose, 350);
    } finally {
      setProcessing(false);
    }
  }

  async function removeSelectedImages() {
    if (!records.length || processing || !onRemove) return;
    const ok = await confirm({
      title: `Remove ${entityLabel} images`,
      description: `Remove existing images from ${records.length} selected ${entityLabel}${records.length === 1 ? '' : 's'}? The records will remain.`,
      confirmLabel: 'Remove Images',
      variant: 'danger',
    });
    if (!ok) return;
    setProcessing(true);
    setError('');
    setProgress(15);
    try {
      await onRemove(records.map(record => record.id));
      setProgress(100);
      window.setTimeout(onClose, 350);
    } finally {
      setProcessing(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[800000] flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" onMouseDown={(event) => {
      if (event.target === event.currentTarget && !processing) onClose();
    }}>
      <div className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl dark:bg-slate-900">
        <div className="flex items-center justify-between px-5 py-4 text-white" style={{ background: 'linear-gradient(135deg, var(--primary-color), var(--solid-emerald))' }}>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/18">
              <ImagePlus size={20} />
            </span>
            <div>
              <h2 className="font-bold">{title}</h2>
              <p className="text-xs text-white/75">Match image filenames to {entityLabel} name or ID.</p>
            </div>
          </div>
          <button type="button" onClick={onClose} disabled={processing} className="rounded-lg p-1.5 hover:bg-white/20 disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <button type="button" onClick={() => fileInputRef.current?.click()} disabled={processing} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-primary-300 hover:bg-primary-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/70">
              <Upload size={18} className="mb-2 text-primary-600" />
              <p className="font-bold text-slate-900 dark:text-white">Upload images</p>
              <p className="text-xs text-slate-500">Select many photos at once.</p>
            </button>
            <button type="button" onClick={() => folderInputRef.current?.click()} disabled={processing} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-800/70">
              <ImagePlus size={18} className="mb-2 text-emerald-600" />
              <p className="font-bold text-slate-900 dark:text-white">Upload folder</p>
              <p className="text-xs text-slate-500">Use a folder with image filenames.</p>
            </button>
          </div>

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={receiveFiles} />
          <input ref={folderInputRef} type="file" accept="image/*" multiple className="hidden" onChange={receiveFiles} {...({ webkitdirectory: '', directory: '' } as any)} />

          <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-950">
            <div className="grid gap-3 sm:grid-cols-3">
              <div><p className="text-xs text-slate-500">Selected</p><p className="text-xl font-bold text-slate-900 dark:text-white">{matches.length}</p></div>
              <div><p className="text-xs text-slate-500">Matched</p><p className="text-xl font-bold text-emerald-600">{uniqueMatchedCount}</p></div>
              <div><p className="text-xs text-slate-500">Unmatched</p><p className="text-xl font-bold text-amber-600">{unmatched.length}</p></div>
            </div>
            {error && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 dark:bg-red-900/25 dark:text-red-300">
                {error}
              </p>
            )}
            {processing && (
              <div className="mt-4">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: 'var(--solid-emerald)' }} />
                </div>
                <p className="mt-2 text-xs font-semibold text-slate-500">Updating images... {progress}%</p>
              </div>
            )}
          </div>

          {matches.length > 0 && (
            <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {matches.slice(0, 80).map((item, index) => (
                <div key={`${item.file.name}-${index}`} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0 dark:border-slate-800">
                  <span className="min-w-0 truncate text-slate-700 dark:text-slate-200">{item.file.name}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${item.record ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>
                    {item.record ? item.record.label : 'No match'}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            Name files like <strong>John Smith.jpg</strong>, <strong>smith john.png</strong>, or the exact ID. Unmatched files are skipped.
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-950">
          {onRemove && (
            <button type="button" onClick={removeSelectedImages} disabled={processing || records.length === 0} className="btn bg-red-600 text-white hover:bg-red-700">
              {processing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
              Delete Images
            </button>
          )}
          <button type="button" onClick={onClose} disabled={processing} className="btn btn-secondary">Cancel</button>
          <button type="button" onClick={applyUpdates} disabled={processing || matched.length === 0} className="btn btn-primary">
            {processing ? <Loader2 size={16} className="animate-spin" /> : <ImagePlus size={16} />}
            Update {uniqueMatchedCount}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
