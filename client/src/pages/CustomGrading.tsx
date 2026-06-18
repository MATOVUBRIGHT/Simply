import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Plus, RotateCcw, Save, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';
import { DEFAULT_GRADING_SCALE, GradingScaleRow, getGradeFromScale, getSavedGradingScale, normalizeGradingScale } from '../utils/grading';
import { shouldSaveOnEnter } from '../utils/keyboard';

export default function CustomGrading() {
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const sid = schoolId || user?.id || '';
  const { data: settingsData } = useTableData(sid, 'settings');
  const savedScale = useMemo(() => getSavedGradingScale(settingsData as any[]), [settingsData]);
  const [rows, setRows] = useState<GradingScaleRow[]>(savedScale);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRows(savedScale);
  }, [savedScale]);

  function updateRow(index: number, updates: Partial<GradingScaleRow>) {
    setRows(prev => prev.map((row, i) => i === index ? { ...row, ...updates } : row));
  }

  function addRow() {
    setRows(prev => [...prev, { grade: '', min: 0, max: 0, points: prev.length + 1, remark: '' }]);
  }

  function deleteRow(index: number) {
    setRows(prev => prev.filter((_, i) => i !== index));
  }

  function resetScale() {
    setRows(DEFAULT_GRADING_SCALE.map(row => ({ ...row })));
  }

  async function saveScale() {
    if (!sid || saving) return;
    const cleaned = normalizeGradingScale(rows);
    setSaving(true);
    try {
      await dataService.saveSettings(sid, { customGradingScale: JSON.stringify(cleaned) });
      setRows(cleaned);
      window.dispatchEvent(new CustomEvent('dataRefresh', { detail: { table: 'settings' } }));
      window.dispatchEvent(new CustomEvent('schofyDataRefresh', { detail: { table: 'settings' } }));
      addToast('Custom grading scale saved', 'success');
    } catch {
      addToast('Failed to save custom grading scale', 'error');
    } finally {
      setSaving(false);
    }
  }

  const previewScores = [95, 88, 76, 66, 58, 42];
  const normalizedRows = normalizeGradingScale(rows);

  return (
    <div
      className="space-y-6 animate-fade-in"
      onKeyDown={event => {
        if (!shouldSaveOnEnter(event)) return;
        event.preventDefault();
        void saveScale();
      }}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/grades" className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:underline">
            <ArrowLeft size={16} /> Exams & Grades
          </Link>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Custom Grading</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Set the grade boundaries used when saving grades and viewing results.
          </p>
        </div>
        <div className="action-row">
          <button onClick={resetScale} className="btn btn-secondary">
            <RotateCcw size={18} /> Reset
          </button>
          <button onClick={addRow} className="btn btn-secondary">
            <Plus size={18} /> Add Grade
          </button>
          <button onClick={saveScale} disabled={saving} className="btn btn-primary shadow-lg shadow-primary-500/25 disabled:opacity-70">
            <Save size={18} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      <section className="card overflow-hidden">
        <div className="card-header flex items-center gap-2">
          <SlidersHorizontal size={18} className="text-primary-500" />
          <h2 className="font-bold text-slate-800 dark:text-white">Grade Scale</h2>
        </div>
        <div className="card-body space-y-3">
          <div className="hidden grid-cols-[minmax(90px,1fr)_90px_90px_90px_minmax(150px,2fr)_44px] gap-3 px-1 text-xs font-bold uppercase text-slate-400 md:grid">
            <span>Grade</span>
            <span>Min %</span>
            <span>Max %</span>
            <span>Points</span>
            <span>Remark</span>
            <span />
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-1 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60 md:grid-cols-[minmax(90px,1fr)_90px_90px_90px_minmax(150px,2fr)_44px] md:items-center md:border-0 md:bg-transparent md:p-0 md:dark:bg-transparent">
              <div>
                <label className="form-label md:hidden">Grade</label>
                <input value={row.grade} onChange={e => updateRow(index, { grade: e.target.value })} className="form-input font-mono font-bold" placeholder="D1" />
              </div>
              <div>
                <label className="form-label md:hidden">Min %</label>
                <input type="number" min={0} max={100} value={row.min} onChange={e => updateRow(index, { min: Number(e.target.value) })} className="form-input" />
              </div>
              <div>
                <label className="form-label md:hidden">Max %</label>
                <input type="number" min={0} max={100} value={row.max} onChange={e => updateRow(index, { max: Number(e.target.value) })} className="form-input" />
              </div>
              <div>
                <label className="form-label md:hidden">Points</label>
                <input type="number" min={0} value={row.points} onChange={e => updateRow(index, { points: Number(e.target.value) })} className="form-input" />
              </div>
              <div>
                <label className="form-label md:hidden">Remark</label>
                <input value={row.remark} onChange={e => updateRow(index, { remark: e.target.value })} className="form-input" placeholder="Distinction" />
              </div>
              <button
                type="button"
                onClick={() => deleteRow(index)}
                className="flex h-10 w-10 items-center justify-center rounded-lg text-red-500 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20"
                title="Delete grade"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="font-bold text-slate-800 dark:text-white">Preview</h2>
        </div>
        <div className="card-body grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {previewScores.map(score => {
            const grade = getGradeFromScale(score, normalizedRows);
            return (
              <div key={score} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                <p className="text-xs font-bold uppercase text-slate-400">{score}%</p>
                <p className="mt-1 text-xl font-black text-slate-900 dark:text-white">{grade.grade}</p>
                <p className="text-xs text-slate-500">{grade.remark || 'No remark'}</p>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
