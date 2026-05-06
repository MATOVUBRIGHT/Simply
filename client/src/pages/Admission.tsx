import React, { useState, useEffect } from 'react';
import { Portal } from '../components/Portal';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, User, Users, FileText, ClipboardCheck, Loader2, Save, Plus, Settings, Sparkles, X, AlertTriangle, CreditCard } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Student, Gender } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import ImageUpload from '../components/ImageUpload';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { ClassOption, getClassCapacityState, getStudentClassOptions } from '../utils/classroom';
import { generateStudentId, getSavedIdFormat, saveIdFormat, getPresetFormats, generateExampleId, IdFormat } from '../utils/idFormat';
import { getSubscriptionAccessState } from '../utils/plans';

const steps = [
  { id: 1, label: 'Student Info', icon: User },
  { id: 2, label: 'Guardian', icon: Users },
  { id: 3, label: 'Documents', icon: FileText },
  { id: 4, label: 'Review', icon: ClipboardCheck },
];

const commonRequirements = [
  'Birth Certificate', 'Transfer Letter', 'Report Card',
  'Passport Photos (4)', 'Medical Certificate', 'Immunization Record',
  'Parent ID Copy', 'Previous School Results',
];

export default function Admission() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [newRequirement, setNewRequirement] = useState('');
  const [showIdFormatModal, setShowIdFormatModal] = useState(false);
  const [idFormat, setIdFormat] = useState<IdFormat>(getSavedIdFormat());
  const [customPattern, setCustomPattern] = useState(getSavedIdFormat().pattern);

  const [form, setForm] = useState({
    admissionNo: '', firstName: '', lastName: '', dob: '',
    gender: Gender.MALE, classId: '', address: '',
    guardianName: '', guardianPhone: '', guardianEmail: '',
    guardianRelation: 'Parent', guardianOccupation: '',
    medicalInfo: '', photoUrl: '',
    tuitionFee: '', boardingFee: '',
    requirements: [] as string[],
    previousSchool: '', previousClass: '',
    birthCertificate: false, transferLetter: false, passportPhotos: false,
  });

  useEffect(() => {
    const id = schoolId || user?.id;
    if (id) { loadClasses(); hydrateId(); }
  }, [user?.id, schoolId]);

  useEffect(() => {
    if (form.firstName && form.lastName) {
      const t = setTimeout(regenerateId, 400);
      return () => clearTimeout(t);
    }
  }, [form.firstName, form.lastName]);

  async function loadClasses() {
    const id = schoolId || user?.id;
    if (!id) return;
    try { setClasses(await getStudentClassOptions(id)); } catch {}
  }

  async function hydrateId() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const students = await dataService.getAll(id, 'students');
      const existing = students.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      setForm(p => ({ ...p, admissionNo: generateStudentId('', '', existing) }));
    } catch {}
  }

  async function regenerateId() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const students = await dataService.getAll(id, 'students');
      const existing = students.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      setForm(p => ({ ...p, admissionNo: generateStudentId(form.firstName || 'ST', form.lastName || 'UD', existing) }));
    } catch {}
  }

  function applyPresetFormat(key: string) {
    const preset = getPresetFormats()[key];
    if (preset) { setIdFormat(preset); setCustomPattern(preset.pattern); saveIdFormat(preset); regenerateId(); }
    setShowIdFormatModal(false);
  }

  function applyCustomPattern() {
    const fmt: IdFormat = { ...idFormat, pattern: customPattern };
    setIdFormat(fmt); saveIdFormat(fmt); regenerateId();
    setShowIdFormatModal(false); addToast('ID format saved', 'success');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setForm(p => ({ ...p, [name]: type === 'checkbox' ? checked : value }));
  }

  function toggleReq(req: string) {
    setForm(p => ({ ...p, requirements: p.requirements.includes(req) ? p.requirements.filter(r => r !== req) : [...p.requirements, req] }));
  }

  function isStepValid() {
    if (step === 1) return !!(form.firstName.trim() && form.lastName.trim() && form.classId);
    if (step === 2) return !!(form.guardianName.trim() && form.guardianPhone.trim());
    return true;
  }

  function next() { if (isStepValid()) setStep(s => Math.min(s + 1, 4)); }
  function prev() { setStep(s => Math.max(s - 1, 1)); }

  async function handleSubmit() {
    const id = schoolId || user?.id;
    if (!id) return;
    setLoading(true);
    try {
      // Check plan limit before admitting
      const access = await getSubscriptionAccessState(id, undefined, { authUserId: user?.id });
      if (access.plan && access.plan.studentLimit > 0 && access.remaining <= 0) {
        addToast(`Plan limit reached (${access.used}/${access.plan.studentLimit} students). Upgrade your plan to admit more.`, 'error');
        setLoading(false);
        return;
      }

      const cap = await getClassCapacityState(id, form.classId);
      if (cap?.isFull) { addToast(`${cap.name} is full. Choose another class.`, 'error'); setLoading(false); return; }
      const now = new Date().toISOString();
      const students = await dataService.getAll(id, 'students');
      const existing = students.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      const admissionNo = form.admissionNo.trim() || generateStudentId(form.firstName, form.lastName, existing);
      const newStudent: Student = {
        id: uuidv4(), userId: user!.id, schoolId: id,
        admissionNo, studentId: admissionNo,
        firstName: form.firstName, lastName: form.lastName,
        dob: form.dob, gender: form.gender,
        classId: form.classId, address: form.address,
        guardianName: form.guardianName, guardianPhone: form.guardianPhone,
        guardianEmail: form.guardianEmail || undefined,
        medicalInfo: form.medicalInfo || undefined,
        photoUrl: form.photoUrl || undefined,
        status: 'active',
        tuitionFee: form.tuitionFee ? parseFloat(form.tuitionFee) : undefined,
        boardingFee: form.boardingFee ? parseFloat(form.boardingFee) : undefined,
        requirements: form.requirements,
        createdAt: now, updatedAt: now,
      };
      await dataService.create(id, 'students', newStudent as any);
      window.dispatchEvent(new Event('studentsUpdated'));
      addToast(`${form.firstName} admitted! ID: ${admissionNo}`, 'success');
      navigate('/students');
    } catch { addToast('Failed to complete admission', 'error'); }
    finally { setLoading(false); }
  }

  const selectedClass = classes.find(c => c.id === form.classId);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/students')} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Student Admission</h1>
          <p className="text-sm text-slate-500 mt-0.5">New student registration</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-center justify-between">
          {steps.map((s, idx) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <React.Fragment key={s.id}>
                <div className="flex flex-col items-center gap-1.5">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all ${
                    isDone ? 'bg-emerald-500 text-white' :
                    isActive ? 'text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                  }`} style={isActive ? { backgroundColor: 'var(--primary-color)' } : {}}>
                    {isDone ? <Check size={20} /> : <Icon size={20} />}
                  </div>
                  <span className={`text-xs font-medium hidden sm:block ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                    {s.label}
                  </span>
                </div>
                {idx < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 rounded transition-all ${step > s.id ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

        {/* Step 1: Student Info */}
        {step === 1 && (
          <div className="p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <User size={20} className="text-indigo-500" /> Student Information
            </h2>
            <div className="flex flex-col sm:flex-row gap-5">
              <ImageUpload label="Photo" value={form.photoUrl}
                onChange={(b64) => setForm(p => ({ ...p, photoUrl: b64 as string }))}
                className="w-32 shrink-0" />
              <div className="flex-1 space-y-3">
                <div>
                  <label className="form-label">Student ID / Admission No *</label>
                  <div className="flex gap-2">
                    <input type="text" name="admissionNo" value={form.admissionNo}
                      onChange={e => setForm(p => ({ ...p, admissionNo: e.target.value.toUpperCase() }))}
                      className="form-input font-mono flex-1" placeholder={generateExampleId()} />
                    <button type="button" onClick={regenerateId} className="btn btn-secondary" title="Generate"><Sparkles size={16} /></button>
                    <button type="button" onClick={() => setShowIdFormatModal(true)} className="btn btn-secondary" title="Format"><Settings size={16} /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="form-label">Gender *</label>
                    <select name="gender" value={form.gender} onChange={handleChange} className="form-input">
                      <option value={Gender.MALE}>Male</option>
                      <option value={Gender.FEMALE}>Female</option>
                      <option value={Gender.OTHER}>Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Date of Birth</label>
                    <input type="date" name="dob" value={form.dob} onChange={handleChange} className="form-input" />
                  </div>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">First Name *</label>
                <input type="text" name="firstName" value={form.firstName} onChange={handleChange} className="form-input" placeholder="First name" />
              </div>
              <div>
                <label className="form-label">Last Name *</label>
                <input type="text" name="lastName" value={form.lastName} onChange={handleChange} className="form-input" placeholder="Last name" />
              </div>
              <div>
                <label className="form-label">Class *</label>
                <select name="classId" value={form.classId} onChange={handleChange} className="form-input">
                  <option value="">Select Class</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id} disabled={c.isFull}>
                      {c.name} ({c.enrolled}/{c.capacity}){c.isFull ? ' — Full' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="form-label">Address</label>
                <input type="text" name="address" value={form.address} onChange={handleChange} className="form-input" placeholder="Home address" />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Guardian */}
        {step === 2 && (
          <div className="p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Users size={20} className="text-violet-500" /> Guardian / Parent
            </h2>
            <div className="p-3 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-100 dark:border-violet-800 text-sm text-violet-700 dark:text-violet-300">
              Guardian information is required for emergency contact and communication.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Guardian Name *</label>
                <input type="text" name="guardianName" value={form.guardianName} onChange={handleChange} className="form-input" placeholder="Full name" />
              </div>
              <div>
                <label className="form-label">Relationship</label>
                <select name="guardianRelation" value={form.guardianRelation} onChange={handleChange} className="form-input">
                  <option>Parent</option><option>Guardian</option><option>Sibling</option><option>Relative</option><option>Other</option>
                </select>
              </div>
              <div>
                <label className="form-label">Phone *</label>
                <input type="tel" name="guardianPhone" value={form.guardianPhone} onChange={handleChange} className="form-input" placeholder="Phone number" />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input type="email" name="guardianEmail" value={form.guardianEmail} onChange={handleChange} className="form-input" placeholder="Email (optional)" />
              </div>
              <div>
                <label className="form-label">Occupation</label>
                <input type="text" name="guardianOccupation" value={form.guardianOccupation} onChange={handleChange} className="form-input" placeholder="Occupation" />
              </div>
              <div>
                <label className="form-label">Medical Info</label>
                <input type="text" name="medicalInfo" value={form.medicalInfo} onChange={handleChange} className="form-input" placeholder="Allergies, conditions..." />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Documents & Fees */}
        {step === 3 && (
          <div className="p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FileText size={20} className="text-emerald-500" /> Documents, Fees & Previous School
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Tuition Fee/term</label>
                <input type="number" name="tuitionFee" value={form.tuitionFee} onChange={handleChange} className="form-input" placeholder="0" min="0" />
              </div>
              <div>
                <label className="form-label">Boarding Fee/term</label>
                <input type="number" name="boardingFee" value={form.boardingFee} onChange={handleChange} className="form-input" placeholder="0" min="0" />
              </div>
            </div>
            <div>
              <label className="form-label">Documents Submitted</label>
              <div className="flex flex-wrap gap-3">
                {[{ f: 'birthCertificate', l: 'Birth Certificate' }, { f: 'transferLetter', l: 'Transfer Letter' }, { f: 'passportPhotos', l: 'Passport Photos' }].map(d => (
                  <label key={d.f} className="flex items-center gap-2 cursor-pointer p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                    <input type="checkbox" name={d.f} checked={form[d.f as keyof typeof form] as boolean} onChange={handleChange} className="w-4 h-4 rounded border-slate-300 text-indigo-600" />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{d.l}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <label className="form-label">Additional Requirements</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {commonRequirements.map(req => {
                  const on = form.requirements.includes(req);
                  return (
                    <button key={req} type="button" onClick={() => toggleReq(req)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${on ? 'bg-indigo-500 text-white' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'}`}>
                      {on && 'v '}{req}
                    </button>
                  );
                })}
              </div>
              <div className="flex gap-2">
                <input type="text" value={newRequirement} onChange={e => setNewRequirement(e.target.value)}
                  placeholder="Custom requirement..." className="form-input flex-1"
                  onKeyDown={e => { if (e.key === 'Enter' && newRequirement.trim()) { e.preventDefault(); toggleReq(newRequirement.trim()); setNewRequirement(''); } }} />
                <button type="button" onClick={() => { if (newRequirement.trim()) { toggleReq(newRequirement.trim()); setNewRequirement(''); } }} className="btn btn-secondary"><Plus size={16} /></button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="form-label">Previous School</label>
                <input type="text" name="previousSchool" value={form.previousSchool} onChange={handleChange} className="form-input" placeholder="School name" />
              </div>
              <div>
                <label className="form-label">Previous Class</label>
                <input type="text" name="previousClass" value={form.previousClass} onChange={handleChange} className="form-input" placeholder="e.g. Primary 6" />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {step === 4 && (
          <div className="p-6 space-y-5">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ClipboardCheck size={20} className="text-indigo-500" /> Review & Confirm
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2"><User size={16} className="text-indigo-500" /> Student</h3>
                {[
                  { label: 'ID', value: form.admissionNo || 'Will be generated' },
                  { label: 'Name', value: `${form.firstName} ${form.lastName}` },
                  { label: 'Gender', value: form.gender },
                  { label: 'DOB', value: form.dob || '-' },
                  { label: 'Class', value: selectedClass?.name || '-' },
                  { label: 'Address', value: form.address || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-16 shrink-0">{label}</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-3">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2"><Users size={16} className="text-violet-500" /> Guardian</h3>
                {[
                  { label: 'Name', value: form.guardianName },
                  { label: 'Relation', value: form.guardianRelation },
                  { label: 'Phone', value: form.guardianPhone },
                  { label: 'Email', value: form.guardianEmail || '-' },
                  { label: 'Occupation', value: form.guardianOccupation || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="flex gap-2 text-sm">
                    <span className="text-slate-400 w-20 shrink-0">{label}</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            {(form.requirements.length > 0 || form.birthCertificate || form.transferLetter || form.passportPhotos) && (
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                <h3 className="font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2"><FileText size={16} className="text-emerald-500" /> Documents</h3>
                <div className="flex flex-wrap gap-2">
                  {form.birthCertificate && <span className="badge badge-success">Birth Certificate</span>}
                  {form.transferLetter && <span className="badge badge-success">Transfer Letter</span>}
                  {form.passportPhotos && <span className="badge badge-success">Passport Photos</span>}
                  {form.requirements.map(r => <span key={r} className="badge badge-info">{r}</span>)}
                </div>
              </div>
            )}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-100 dark:border-indigo-800 flex items-center gap-3">
              <Check size={20} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
              <p className="text-sm text-indigo-700 dark:text-indigo-300">Ready to admit. Click <strong>Complete Admission</strong> to register this student.</p>
            </div>
          </div>
        )}

        {/* Navigation footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
          <button onClick={prev} disabled={step === 1}
            className={`btn ${step === 1 ? 'btn-ghost opacity-40 cursor-not-allowed' : 'btn-secondary'} flex items-center gap-2`}>
            <ArrowLeft size={16} /> Previous
          </button>
          {step < 4 ? (
            <button onClick={next} disabled={!isStepValid()}
              className="btn btn-primary flex items-center gap-2 disabled:opacity-50">
              Next <ArrowRight size={16} />
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={loading}
              className="btn btn-primary px-8 flex items-center gap-2 disabled:opacity-60">
              {loading ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><Save size={16} /> Complete Admission</>}
            </button>
          )}
        </div>
      </div>

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
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setShowIdFormatModal(false)} className="btn btn-secondary">Cancel</button>
                  <button type="button" onClick={applyCustomPattern} className="btn btn-primary">Apply</button>
                </div>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
