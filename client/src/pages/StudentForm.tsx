import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, User, Users, Shield, Sparkles, Settings, Plus, X, FileText, Paperclip, Trash2 } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Student, Gender } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import ImageUpload from '../components/ImageUpload';
import { useCurrency } from '../hooks/useCurrency';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { Portal } from '../components/Portal';

    param($m)
    $m.Value
  
interface CustomField { id: string; label: string; value: string; }
interface Attachment { id: string; name: string; file: string; type: string; }

const initialFormData: Partial<Student> & { customFields?: CustomField[]; attachments?: Attachment[] } = {
  firstName: '', lastName: '', dob: '', gender: Gender.MALE,
  classId: '', address: '', guardianName: '', guardianPhone: '',
  guardianEmail: '', medicalInfo: '', status: 'active',
  photoUrl: undefined, tuitionFee: undefined, boardingFee: undefined,
  requirements: [], customFields: [], attachments: [],
};

const commonRequirements = [
  'Birth Certificate', 'Transfer Letter', 'Report Card',
  'Passport Photos (4)', 'Medical Certificate', 'Immunization Record',
  'Parent ID Copy', 'Previous School Results',
];

export default function StudentForm() {
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [loadingData, setLoadingData] = useState(true);
  const [formData, setFormData] = useState<Partial<Student> & { customFields?: CustomField[]; attachments?: Attachment[] }>(initialFormData);
  const [studentId, setStudentId] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const { currency, formatMoney } = useCurrency();
  const [showIdFormatModal, setShowIdFormatModal] = useState(false);
  const [idFormat, setIdFormat] = useState<IdFormat>(getSavedIdFormat());
  const [customPattern, setCustomPattern] = useState(getSavedIdFormat().pattern);
  const [loading, setLoading] = useState(false);
  const [newCustomField, setNewCustomField] = useState({ label: '', value: '' });
  const [newRequirement, setNewRequirement] = useState('');
  const [tempId] = useState(uuidv4());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = !!id;

  useEffect(() => {
    const idAuth = schoolId || user?.id;
    if (id && idAuth) loadStudent();
    else { hydrateStudentId(); setLoadingData(false); }
    if (idAuth) loadClasses();
  }, [id, user, schoolId]);

  useEffect(() => {
    if (!isEditing && formData.firstName && formData.lastName) {
      const t = setTimeout(regenerateStudentId, 400);
      return () => clearTimeout(t);
    }
  }, [formData.firstName, formData.lastName]);

  async function loadStudent() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const student = await dataService.get(idAuth, 'students', id!);
      if (student) {
        setFormData({ ...student, customFields: student.customFields || [], attachments: student.attachments || [] } as any);
        setStudentId(student.studentId || student.admissionNo || '');
      }
    } catch { addToast('Failed to load student data', 'error'); }
    finally { setLoadingData(false); }
  }

  async function loadClasses() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try { setClasses(await getStudentClassOptions(idAuth, id)); } catch {}
  }

  async function hydrateStudentId() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const students = await dataService.getAll(idAuth, 'students');
      const existing = students.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      setStudentId(generateStudentId('', '', existing));
    } catch {}
  }

  async function regenerateStudentId() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const students = await dataService.getAll(idAuth, 'students');
      const existing = students.filter((s: any) => s.id !== id).flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      const newId = generateStudentId(formData.firstName || 'ST', formData.lastName || 'UD', existing);
      setStudentId(newId);
    } catch {}
  }

  function applyPresetFormat(presetKey: string) {
    const preset = getPresetFormats()[presetKey];
    if (preset) { setIdFormat(preset); setCustomPattern(preset.pattern); saveIdFormat(preset); regenerateStudentId(); }
    setShowIdFormatModal(false);
  }

  function applyCustomPattern() {
    const fmt: IdFormat = { ...idFormat, pattern: customPattern };
    setIdFormat(fmt); saveIdFormat(fmt); regenerateStudentId();
    setShowIdFormatModal(false); addToast('ID format saved', 'success');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  }

  function addCustomField() {
    if (!newCustomField.label.trim()) return;
    setFormData(prev => ({ ...prev, customFields: [...(prev.customFields || []), { id: uuidv4(), label: newCustomField.label.trim(), value: newCustomField.value.trim() }] }));
    setNewCustomField({ label: '', value: '' });
  }

  function removeCustomField(fid: string) {
    setFormData(prev => ({ ...prev, customFields: (prev.customFields || []).filter(f => f.id !== fid) }));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setFormData(prev => ({ ...prev, attachments: [...(prev.attachments || []), { id: uuidv4(), name: file.name, file: reader.result as string, type: file.type }] }));
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  function removeAttachment(aid: string) {
    setFormData(prev => ({ ...prev, attachments: (prev.attachments || []).filter(a => a.id !== aid) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.firstName?.trim()) { addToast('First name is required', 'error'); return; }
    if (!formData.lastName?.trim()) { addToast('Last name is required', 'error'); return; }
    if (!formData.classId) { addToast('Class is required', 'error'); return; }
    if (!formData.guardianName?.trim()) { addToast('Guardian name is required', 'error'); return; }
    if (!formData.guardianPhone?.trim()) { addToast('Guardian phone is required', 'error'); return; }
    if (loading) return;
    setLoading(true);
    const idAuth = schoolId || user?.id;
    if (!idAuth) { setLoading(false); return; }
    try {
      const now = new Date().toISOString();
      const finalId = studentId.trim() || generateStudentId(formData.firstName || 'ST', formData.lastName || 'UD', []);
      if (isEditing) {
        const cap = formData.classId ? await getClassCapacityState(idAuth, formData.classId, id) : null;
        if (cap?.isFull) { addToast(`${cap.name} is full. Choose another class.`, 'error'); setLoading(false); return; }
        await dataService.update(idAuth, 'students', id!, { ...formData, admissionNo: finalId, studentId: finalId, updatedAt: now } as any);
        addToast('Student updated', 'success');
      } else {
        const cap = formData.classId ? await getClassCapacityState(idAuth, formData.classId) : null;
        if (cap?.isFull) { addToast(`${cap.name} is full. Choose another class.`, 'error'); setLoading(false); return; }
        const newStudent: Student = {
          id: tempId, userId: user!.id, schoolId: idAuth,
          admissionNo: finalId, studentId: finalId,
          firstName: formData.firstName || '', lastName: formData.lastName || '',
          dob: formData.dob || '', gender: formData.gender || Gender.MALE,
          classId: formData.classId || '', address: formData.address || '',
          guardianName: formData.guardianName || '', guardianPhone: formData.guardianPhone || '',
          guardianEmail: formData.guardianEmail, medicalInfo: formData.medicalInfo,
          photoUrl: formData.photoUrl, status: formData.status || 'active',
          tuitionFee: formData.tuitionFee, boardingFee: formData.boardingFee,
          requirements: formData.requirements || [], customFields: formData.customFields || [],
          attachments: formData.attachments || [], createdAt: now, updatedAt: now,
        };
        await dataService.create(idAuth, 'students', newStudent as any);
        addToast('Student admitted successfully', 'success');
      }
      window.dispatchEvent(new Event('studentsUpdated'));
      navigate('/students');
    } catch { addToast('Failed to save student', 'error'); }
    finally { setLoading(false); }
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
          <p className="text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/students')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            {isEditing ? 'Edit Student' : 'Add Student'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">Fill in all details and save</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="card">
          {/* Personal Info */}
          <div className="card-header flex items-center gap-2">
            <User size={18} className="text-indigo-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white">Personal Information</h2>
          </div>
          <div className="card-body space-y-5">
            {/* Photo + ID row */}
            <div className="flex flex-col sm:flex-row gap-5">
              <ImageUpload
                label="Student Photo"
                value={formData.photoUrl}
                onChange={(base64) => setFormData(prev => ({ ...prev, photoUrl: base64 as any }))}
                className="w-32 shrink-0"
              />
              <div className="flex-1 space-y-3">
                <div>
                  <label className="form-label">Student ID / Admission No *</label>
                  <div className="flex gap-2">
                    <input type="text" value={studentId} onChange={e => setStudentId(e.target.value.toUpperCase())}
                      className="form-input font-mono flex-1" placeholder={generateExampleId()} required />
                    <button type="button" onClick={regenerateStudentId} className="btn btn-secondary" title="Generate new ID">
                      <Sparkles size={16} />
                    </button>
                    <button type="button" onClick={() => setShowIdFormatModal(true)} className="btn btn-secondary" title="ID Format">
                      <Settings size={16} />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} className="form-input">
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Gender *</label>
                    <select name="gender" value={formData.gender} onChange={handleChange} className="form-input">
                      <option value={Gender.MALE}>Male</option>
                      <option value={Gender.FEMALE}>Female</option>
                      <option value={Gender.OTHER}>Other</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">First Name *</label>
                <input type="text" name="firstName" value={formData.firstName} onChange={handleChange}
                  className="form-input" placeholder="First name" required />
              </div>
              <div>
                <label className="form-label">Last Name *</label>
                <input type="text" name="lastName" value={formData.lastName} onChange={handleChange}
                  className="form-input" placeholder="Last name" required />
              </div>
              <div>
                <label className="form-label">Date of Birth</label>
                <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="form-input" />
              </div>
              <div>
                <label className="form-label">Class *</label>
                <select name="classId" value={formData.classId} onChange={handleChange} className="form-input" required>
                  <option value="">Select Class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id} disabled={c.isFull && c.id !== formData.classId}>
                      {c.name} ({c.enrolled}/{c.capacity}){c.isFull && c.id !== formData.classId ? ' — Full' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label">Address</label>
              <textarea name="address" value={formData.address} onChange={handleChange}
                className="form-input" rows={2} placeholder="Home address" />
            </div>
          </div>

          {/* Guardian Info */}
          <div className="border-t border-slate-200 dark:border-slate-700 px-5 pt-5 pb-1 flex items-center gap-2">
            <Users size={18} className="text-violet-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white">Guardian / Parent</h2>
          </div>
          <div className="px-5 pb-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Guardian Name *</label>
                <input type="text" name="guardianName" value={formData.guardianName} onChange={handleChange}
                  className="form-input" placeholder="Full name" required />
              </div>
              <div>
                <label className="form-label">Guardian Phone *</label>
                <input type="tel" name="guardianPhone" value={formData.guardianPhone} onChange={handleChange}
                  className="form-input" placeholder="Phone number" required />
              </div>
              <div className="sm:col-span-2">
                <label className="form-label">Guardian Email</label>
                <input type="email" name="guardianEmail" value={formData.guardianEmail || ''} onChange={handleChange}
                  className="form-input" placeholder="Email (optional)" />
              </div>
            </div>
          </div>

          {/* Additional Info */}
          <div className="border-t border-slate-200 dark:border-slate-700 px-5 pt-5 pb-1 flex items-center gap-2">
            <Shield size={18} className="text-emerald-500" />
            <h2 className="font-semibold text-slate-800 dark:text-white">Additional Details</h2>
          </div>
          <div className="px-5 pb-5 space-y-5">
            <div>
              <label className="form-label">Medical Information</label>
              <textarea name="medicalInfo" value={formData.medicalInfo || ''} onChange={handleChange}
                className="form-input" rows={2} placeholder="Allergies, conditions, special needs..." />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Tuition Fee ({currency.symbol}/term)</label>
                <input type="number" name="tuitionFee" value={formData.tuitionFee || ''} onChange={handleChange}
                  className="form-input" placeholder="0" min="0" />
              </div>
              <div>
                <label className="form-label">Boarding Fee ({currency.symbol}/term)</label>
                <input type="number" name="boardingFee" value={formData.boardingFee || ''} onChange={handleChange}
                  className="form-input" placeholder="0" min="0" />
              </div>
            </div>

            {(formData.tuitionFee || formData.boardingFee) ? (
              <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">Total per term: <strong>{formatMoney((formData.tuitionFee || 0) + (formData.boardingFee || 0))}</strong></p>
              </div>
            ) : null}

            {/* Requirements */}
            <div>
              <label className="form-label">Admission Requirements</label>
              <div className="flex flex-wrap gap-2 mb-3">
                {commonRequirements.map(req => {
                  const checked = formData.requirements?.includes(req);
                  return (
                    <button key={req} type="button"
                      onClick={() => setFormData(prev => ({ ...prev, requirements: checked ? (prev.requirements || []).filter(r => r !== req) : [...(prev.requirements || []), req] }))}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${checked ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}`}>
                      {checked && '✓ '}{req}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newRequirement} onChange={e => setNewRequirement(e.target.value)}
                  placeholder="Custom requirement..." className="form-input flex-1"
                  onKeyDown={e => { if (e.key === 'Enter' && newRequirement.trim()) { e.preventDefault(); setFormData(prev => ({ ...prev, requirements: [...(prev.requirements || []), newRequirement.trim()] })); setNewRequirement(''); } }} />
                <button type="button" onClick={() => { if (newRequirement.trim()) { setFormData(prev => ({ ...prev, requirements: [...(prev.requirements || []), newRequirement.trim()] })); setNewRequirement(''); } }} className="btn btn-secondary"><Plus size={16} /></button>
              </div>
            </div>

            {/* Custom Fields */}
            <div>
              <label className="form-label">Custom Fields</label>
              <div className="space-y-2 mb-3">
                {(formData.customFields || []).map(f => (
                  <div key={f.id} className="flex gap-2 items-center">
                    <span className="text-sm font-medium text-slate-600 dark:text-slate-300 w-32 shrink-0">{f.label}</span>
                    <input type="text" value={f.value} onChange={e => setFormData(prev => ({ ...prev, customFields: (prev.customFields || []).map(cf => cf.id === f.id ? { ...cf, value: e.target.value } : cf) }))}
                      className="form-input flex-1 py-1.5 text-sm" />
                    <button type="button" onClick={() => removeCustomField(f.id)} className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><X size={14} /></button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newCustomField.label} onChange={e => setNewCustomField(p => ({ ...p, label: e.target.value }))}
                  placeholder="Field name" className="form-input flex-1 text-sm" />
                <input type="text" value={newCustomField.value} onChange={e => setNewCustomField(p => ({ ...p, value: e.target.value }))}
                  placeholder="Value" className="form-input flex-1 text-sm" />
                <button type="button" onClick={addCustomField} className="btn btn-secondary"><Plus size={16} /></button>
              </div>
            </div>

            {/* Attachments */}
            <div>
              <label className="form-label">Attachments</label>
              <div className="space-y-2 mb-3">
                {(formData.attachments || []).map(a => (
                  <div key={a.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                    <Paperclip size={14} className="text-slate-400 shrink-0" />
                    <span className="text-sm text-slate-700 dark:text-slate-200 flex-1 truncate">{a.name}</span>
                    <button type="button" onClick={() => removeAttachment(a.id)} className="p-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                className="btn btn-secondary text-sm"><Paperclip size={15} /> Attach File</button>
              <input ref={fileInputRef} type="file" multiple onChange={handleFileUpload} className="hidden" />
            </div>
          </div>

          {/* Submit */}
          <div className="border-t border-slate-200 dark:border-slate-700 px-5 py-4 flex items-center justify-end gap-3 bg-slate-50 dark:bg-slate-800/50 rounded-b-xl">
            <button type="button" onClick={() => navigate('/students')} className="btn btn-secondary">Cancel</button>
            <button type="submit" disabled={loading} className="btn btn-primary px-8 disabled:opacity-60">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Saving...</> : <><Save size={16} /> {isEditing ? 'Save Changes' : 'Add Student'}</>}
            </button>
          </div>
        </div>
      </form>

      {/* ID Format Modal */}
      {showIdFormatModal && (
        <Portal>
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowIdFormatModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl w-full max-w-md border border-slate-200 dark:border-slate-700 overflow-hidden animate-modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700" style={{ backgroundColor: 'var(--primary-color)' }}>
              <h3 className="font-bold text-white">ID Format Settings</h3>
              <button onClick={() => setShowIdFormatModal(false)} className="p-1 hover:bg-white/20 rounded-lg"><X size={18} className="text-white" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="form-label">Preset Formats</label>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(getPresetFormats()).map(([key, fmt]) => (
                    <button key={key} type="button" onClick={() => applyPresetFormat(key)}
                      className="px-3 py-2 text-sm border border-slate-200 dark:border-slate-600 rounded-lg hover:border-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition-colors">
                      <div className="font-medium text-slate-700 dark:text-slate-200 capitalize">{key.replace(/_/g, ' ')}</div>
                      <div className="text-xs text-slate-400 font-mono">{fmt.pattern}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="form-label">Custom Pattern</label>
                <input type="text" value={customPattern} onChange={e => setCustomPattern(e.target.value)}
                  className="form-input font-mono" placeholder="e.g. SCH/{YEAR}/{SEQ:4}" />
                <p className="text-xs text-slate-400 mt-1">Use {'{YEAR}'}, {'{SEQ:4}'}, {'{INIT}'} as placeholders</p>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowIdFormatModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="button" onClick={applyCustomPattern} className="btn btn-primary">Apply</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
