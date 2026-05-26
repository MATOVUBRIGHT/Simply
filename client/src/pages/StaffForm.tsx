import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, RefreshCcw, Plus, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Staff, StaffRole, Subject } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import ImageUpload from '../components/ImageUpload';
import { generateStaffId } from '../utils/idFormat';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { SuccessPopup } from '../components/SuccessPopup';

interface CustomField { id: string; label: string; value: string; }

const initialFormData: Partial<Staff> & { customFields?: CustomField[] } = {
  firstName: '',
  lastName: '',
  role: StaffRole.TEACHER,
  department: '',
  dob: '',
  address: '',
  phone: '',
  email: '',
  salary: 0,
  status: 'active',
  subjects: [],
  customFields: [],
  photoUrl: undefined,
};

export default function StaffForm() {
  const { user, schoolId } = useAuth();
  const { id } = useParams();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [loading, setLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loadingData, setLoadingData] = useState(!!id);
  const [formData, setFormData] = useState<Partial<Staff> & { customFields?: CustomField[] }>(initialFormData);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [newCustomField, setNewCustomField] = useState({ label: '', value: '' });
  const isEditing = !!id;

  useEffect(() => {
    if (id) loadStaff();
    else hydrateEmployeeId();
    if (user?.id || schoolId) loadSubjects();
  }, [id, user?.id, schoolId]);

  async function loadStaff() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    try {
      const staff = await dataService.get(authId, 'staff', id!);
      if (staff) {
        setFormData({ ...staff, customFields: Array.isArray(staff.customFields) ? staff.customFields : [] });
        setEmployeeId(staff.employeeId);
      }
    } catch (error) {
      addToast('Failed to load staff', 'error');
    } finally {
      setLoadingData(false);
    }
  }

  async function loadSubjects() {
    const authId = schoolId || user?.id;
    if (!authId) return;
    try {
      const data = await dataService.getAll(authId, 'subjects');
      // Deduplicate by name — show each unique subject name once
      const seen = new Set<string>();
      const unique = data.filter((s: any) => {
        const key = s.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      setSubjects(unique);
    } catch (error) {
      console.error('Failed to load subjects:', error);
    }
  }

  async function generateEmployeeId(): Promise<string> {
    const authId = schoolId || user?.id;
    const existing = authId ? (await dataService.getAll(authId, 'staff')).map((s: any) => s.employeeId).filter(Boolean) : [];
    return generateStaffId(formData.firstName || 'ST', formData.lastName || 'AF', existing);
  }

  async function hydrateEmployeeId() {
    try {
      setEmployeeId(await generateEmployeeId());
    } catch (error) {
      console.error('Failed to generate employee ID:', error);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'number' ? parseFloat(value) || 0 : value,
    }));
  }

  function handleSubjectToggle(subjectId: string) {
    const current = formData.subjects || [];
    const updated = current.includes(subjectId)
      ? current.filter(s => s !== subjectId)
      : [...current, subjectId];
    setFormData(prev => ({ ...prev, subjects: updated }));
  }

  function addCustomField() {
    if (!newCustomField.label.trim()) return;
    setFormData(prev => ({
      ...prev,
      customFields: [
        ...(prev.customFields || []),
        { id: uuidv4(), label: newCustomField.label.trim(), value: newCustomField.value.trim() },
      ],
    }));
    setNewCustomField({ label: '', value: '' });
  }

  function removeCustomField(fieldId: string) {
    setFormData(prev => ({
      ...prev,
      customFields: (prev.customFields || []).filter(field => field.id !== fieldId),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const authId = schoolId || user?.id;
    if (!authId || loading) return;
    setLoading(true);
    const now = new Date().toISOString();
    try {
      if (isEditing) {
        const finalEmployeeId = employeeId.trim() || await generateEmployeeId();
        await dataService.update(authId, 'staff', id!, { ...formData, employeeId: finalEmployeeId, updatedAt: now } as any);
      } else {
        const finalEmployeeId = employeeId.trim() || await generateEmployeeId();
        const newStaff: Staff = { id: uuidv4(), schoolId: authId, employeeId: finalEmployeeId, ...formData, createdAt: now, updatedAt: now } as Staff;
        await dataService.create(authId, 'staff', newStaff as any);
      }

      setShowSuccess(true);
      await new Promise(resolve => setTimeout(resolve, 1500));
      navigate('/staff');
    } catch (error) {
      console.error('Save error:', error);
      addToast('Failed to save staff member', 'error');
    } finally {
      setLoading(false);
    }
  }

  if (loadingData) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-primary-500" size={32} /></div>;
  }

  const isTeacher = formData.role === StaffRole.TEACHER;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/staff')} className="btn btn-ghost p-2"><ArrowLeft size={20} /></button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">{isEditing ? 'Edit Staff' : 'Add New Staff'}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{isEditing ? 'Update staff information' : 'Fill in the staff details'}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="card">
        <div className="card-body space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            <ImageUpload
              label="Staff Photo"
              value={formData.photoUrl}
              onChange={(base64) => setFormData(prev => ({ ...prev, photoUrl: base64 as any }))}
              className="md:col-span-1"
            />
            <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="form-label">Employee ID *</label>
              <div className="flex gap-2">
                <input type="text" value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="form-input" required />
                <button type="button" onClick={async () => setEmployeeId(await generateEmployeeId())} className="btn btn-secondary whitespace-nowrap">
                  <RefreshCcw size={16} /> Regenerate
                </button>
              </div>
            </div>
            <div>
              <label className="form-label">First Name *</label>
              <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} className="form-input" required />
            </div>
            <div>
              <label className="form-label">Last Name *</label>
              <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} className="form-input" required />
            </div>
            <div>
              <label className="form-label">Role *</label>
              <select name="role" value={formData.role} onChange={handleChange} className="form-input">
                <option value={StaffRole.TEACHER}>Teacher</option>
                <option value={StaffRole.DIRECTOR}>Director</option>
                <option value={StaffRole.BURSAR}>Bursar</option>
                <option value={StaffRole.ADMIN}>Admin</option>
                <option value={StaffRole.SUPPORT}>Support Staff</option>
              </select>
            </div>
            <div>
              <label className="form-label">Department</label>
              <input type="text" name="department" value={formData.department} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Phone *</label>
              <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="form-input" required />
            </div>
            <div>
              <label className="form-label">Email</label>
              <input type="email" name="email" value={formData.email} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Date of Birth</label>
              <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="form-input" />
            </div>
            <div>
              <label className="form-label">Monthly Salary</label>
              <input type="number" name="salary" value={formData.salary} onChange={handleChange} className="form-input" />
            </div>
          </div>
          </div>
          {isTeacher && (
            <div>
              <label className="form-label">Subjects</label>
              {subjects.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                  No subjects available. <button type="button" onClick={() => navigate('/subjects')} className="text-indigo-600 hover:underline">Add subjects first</button>
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {subjects.map(subject => {
                    const isSelected = formData.subjects?.includes(subject.id);
                    return (
                      <button
                        key={subject.id}
                        type="button"
                        onClick={() => handleSubjectToggle(subject.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {subject.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          <div>
            <label className="form-label">Address</label>
            <textarea name="address" value={formData.address} onChange={handleChange} className="form-input" rows={2} />
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="font-semibold text-slate-800 dark:text-white">Custom Fields</h3>
                <p className="text-xs text-slate-500">Add extra teacher or staff details shown with this profile.</p>
              </div>
            </div>
            <div className="space-y-2 mb-3">
              {(formData.customFields || []).map(field => (
                <div key={field.id} className="grid grid-cols-1 sm:grid-cols-[minmax(9rem,14rem)_1fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    value={field.label}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      customFields: (prev.customFields || []).map(item => item.id === field.id ? { ...item, label: e.target.value } : item),
                    }))}
                    className="form-input text-sm"
                    placeholder="Field name"
                  />
                  <input
                    type="text"
                    value={field.value}
                    onChange={e => setFormData(prev => ({
                      ...prev,
                      customFields: (prev.customFields || []).map(item => item.id === field.id ? { ...item, value: e.target.value } : item),
                    }))}
                    className="form-input text-sm"
                    placeholder="Value"
                  />
                  <button type="button" onClick={() => removeCustomField(field.id)} className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                    <X size={16} />
                  </button>
                </div>
              ))}
              {(formData.customFields || []).length === 0 && (
                <p className="text-sm text-slate-400">No custom fields yet.</p>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-[minmax(9rem,14rem)_1fr_auto] gap-2">
              <input
                type="text"
                value={newCustomField.label}
                onChange={e => setNewCustomField(prev => ({ ...prev, label: e.target.value }))}
                className="form-input text-sm"
                placeholder="Field name"
              />
              <input
                type="text"
                value={newCustomField.value}
                onChange={e => setNewCustomField(prev => ({ ...prev, value: e.target.value }))}
                className="form-input text-sm"
                placeholder="Value"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomField(); } }}
              />
              <button type="button" onClick={addCustomField} className="btn btn-secondary">
                <Plus size={16} /> Add
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
          <button type="button" onClick={() => navigate('/staff')} className="btn btn-secondary">Cancel</button>
          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? <><Loader2 size={18} className="animate-spin" /> Saving...</> : <><Save size={18} /> {isEditing ? 'Update' : 'Add Staff'}</>}
          </button>
        </div>
      </form>

      {showSuccess && (
        <SuccessPopup 
          message={isEditing ? "Staff Updated!" : "Staff Registered!"} 
          subMessage="Returning to staff list..."
        />
      )}
    </div>
  );
}
