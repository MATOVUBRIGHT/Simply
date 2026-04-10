import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Save, Loader2, FileText, Plus, X, User, Users, AlertCircle, Check, Shield, FileCheck, CheckCircle, Upload, Trash2, Paperclip, Settings, Sparkles } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Student, Gender } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import ImageUpload from '../components/ImageUpload';
import { useCurrency } from '../hooks/useCurrency';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/DataService';
import { ClassOption, getClassCapacityState, getClassDisplayName, getStudentClassOptions } from '../utils/classroom';
import { generateStudentId, getSavedIdFormat, saveIdFormat, getPresetFormats, generateExampleId, extractFormatFromId, IdFormat } from '../utils/idFormat';

interface CustomField {
  id: string;
  label: string;
  value: string;
}

interface Attachment {
  id: string;
  name: string;
  file: string;
  type: string;
}

const initialFormData: Partial<Student> & { customFields?: CustomField[]; attachments?: Attachment[] } = {
  firstName: '',
  lastName: '',
  dob: '',
  gender: Gender.MALE,
  classId: '',
  address: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  medicalInfo: '',
  status: 'active',
  photoUrl: undefined,
  tuitionFee: undefined,
  boardingFee: undefined,
  requirements: [],
  customFields: [],
  attachments: [],
};

const commonRequirements = [
  'Birth Certificate',
  'Transfer Letter',
  'Report Card',
  'Passport Photos (4)',
  'Medical Certificate',
  'Immunization Record',
  'Parent ID Copy',
  'Previous School Results',
];

const steps = [
  { id: 1, label: 'Personal Info', icon: User },
  { id: 2, label: 'Guardian', icon: Users },
  { id: 3, label: 'Additional', icon: Shield },
  { id: 4, label: 'Review', icon: FileCheck },
];

interface ValidationError {
  field: string;
  message: string;
}

export default function StudentForm() {
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [loadingData, setLoadingData] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<Partial<Student> & { customFields?: CustomField[]; attachments?: Attachment[] }>(initialFormData);
  const [tempId, setTempId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [showValidationPopup, setShowValidationPopup] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const { currency, formatMoney } = useCurrency();
  const [showIdFormatModal, setShowIdFormatModal] = useState(false);
  const [idFormat, setIdFormat] = useState<IdFormat>(getSavedIdFormat());
  const [customPattern, setCustomPattern] = useState(getSavedIdFormat().pattern);
  const [showSaveFormatPrompt, setShowSaveFormatPrompt] = useState(false);
  const [pendingCustomId, setPendingCustomId] = useState<string>('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [loading, setLoading] = useState(false);
  const [newCustomField, setNewCustomField] = useState({ label: '', value: '' });
  const [newRequirement, setNewRequirement] = useState('');
  const studentIdInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!id;

  useEffect(() => {
    const idAuth = schoolId || user?.id;
    if (id && idAuth) {
      loadStudent();
    } else {
      setTempId(uuidv4());
      hydrateStudentId();
    }
    if (idAuth) {
      loadClasses();
    }
  }, [id, user, schoolId]);

  useEffect(() => {
    if (showValidationPopup) {
      const timer = setTimeout(() => {
        setShowValidationPopup(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showValidationPopup]);

  useEffect(() => {
    if (!isEditing && formData.firstName && formData.lastName && !studentId.includes('INI')) {
      const timer = setTimeout(() => {
        regenerateStudentId();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [formData.firstName, formData.lastName]);

  async function loadStudent() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const student = await dataService.get(idAuth, 'students', id!);
      if (student) {
        setFormData({
          ...student,
          customFields: student.customFields || [],
          attachments: student.attachments || [],
        } as typeof formData);
        setTempId(student.id);
        setStudentId(student.studentId || student.admissionNo);
      }
    } catch (error) {
      console.error('Failed to load student:', error);
      addToast('Failed to load student data', 'error');
    } finally {
      setLoadingData(false);
    }
  }

  async function loadClasses() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const options = await getStudentClassOptions(idAuth, id);
      setClasses(options);
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  }

  async function hydrateStudentId() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const students = await dataService.getAll(idAuth, 'students');
      const existingValues = students
        .filter(s => s.id !== id)
        .flatMap(s => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      
      const newId = generateStudentId(
        formData.firstName || '',
        formData.lastName || '',
        existingValues
      );
      setStudentId(newId);
    } catch (error) {
      console.error('Failed to generate student ID:', error);
    }
  }

  async function regenerateStudentId() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const students = await dataService.getAll(idAuth, 'students');
      const existingValues = students
        .filter(s => s.id !== id)
        .flatMap(s => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      
      let newId = generateStudentId(
        formData.firstName || 'ST',
        formData.lastName || 'UD',
        existingValues
      );
      
      let attempts = 0;
      while (newId === studentId && attempts < 10) {
        newId = generateStudentId(
          formData.firstName || 'ST',
          formData.lastName || 'UD',
          existingValues
        );
        attempts++;
      }
      
      if (newId === studentId) {
        const suffix = Math.random().toString(36).substring(2, 6).toUpperCase();
        const parts = newId.split(/[\/\-_]/);
        parts[parts.length - 1] = parts[parts.length - 1] + suffix;
        newId = parts.join('/');
      }
      
      setStudentId(newId);
      addToast(`Generated: ${newId}`, 'success');
    } catch (error) {
      console.error('Failed to regenerate student ID:', error);
      addToast('Failed to generate ID', 'error');
    }
  }

  async function handleStudentIdChange(value: string) {
    setStudentId(value);
    
    if (value.length >= 5) {
      const detectedFormat = extractFormatFromId(value);
      if (detectedFormat && detectedFormat.pattern !== getSavedIdFormat().pattern) {
        setPendingCustomId(value);
        setCustomPattern(detectedFormat.pattern);
        setShowSaveFormatPrompt(true);
      }
    }
  }

  function applyPresetFormat(presetKey: string) {
    const presets = getPresetFormats();
    const preset = presets[presetKey];
    if (preset) {
      setIdFormat(preset);
      setCustomPattern(preset.pattern);
      saveIdFormat(preset);
      regenerateStudentId();
    }
    setShowIdFormatModal(false);
  }

  function applyCustomPattern() {
    const newFormat: IdFormat = {
      ...idFormat,
      pattern: customPattern,
    };
    setIdFormat(newFormat);
    saveIdFormat(newFormat);
    regenerateStudentId();
    setShowIdFormatModal(false);
    addToast('ID format saved!', 'success');
  }

  async function handleSaveDetectedFormat() {
    const detected = extractFormatFromId(pendingCustomId);
    if (detected) {
      setIdFormat(detected);
      saveIdFormat(detected);
      setCustomPattern(detected.pattern);
      addToast('ID format detected and saved!', 'success');
      regenerateStudentId();
    }
    setShowSaveFormatPrompt(false);
    setPendingCustomId('');
  }

  function handleSkipSaveFormat() {
    setShowSaveFormatPrompt(false);
    setPendingCustomId('');
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function autoSave() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    try {
      const now = new Date().toISOString();
      
      if (isEditing) {
        await dataService.update(idAuth, 'students', id!, { ...formData, updatedAt: now } as any);
      } else {
        const existing = await dataService.get(idAuth, 'students', tempId);
        if (existing) {
          await dataService.update(idAuth, 'students', tempId, { ...formData, updatedAt: now } as any);
        }
      }
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  function validateStep(step: number): ValidationError[] {
    const errors: ValidationError[] = [];

    if (step === 1) {
      if (!formData.firstName?.trim()) {
        errors.push({ field: 'firstName', message: 'First name is required' });
      }
      if (!formData.lastName?.trim()) {
        errors.push({ field: 'lastName', message: 'Last name is required' });
      }
      if (!formData.dob) {
        errors.push({ field: 'dob', message: 'Date of birth is required' });
      }
      if (!formData.classId) {
        errors.push({ field: 'classId', message: 'Class is required' });
      }
    }

    if (step === 2) {
      if (!formData.guardianName?.trim()) {
        errors.push({ field: 'guardianName', message: 'Guardian name is required' });
      }
      if (!formData.guardianPhone?.trim()) {
        errors.push({ field: 'guardianPhone', message: 'Guardian phone is required' });
      }
    }

    return errors;
  }

  function showErrors(errors: ValidationError[]) {
    setValidationErrors(errors);
    setShowValidationPopup(true);
  }

  async function handleNext() {
    const errors = validateStep(currentStep);
    
    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    await autoSave();
    
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  }

  async function handlePrevious() {
    await autoSave();
    
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const errors = validateStep(currentStep);
    if (errors.length > 0) {
      showErrors(errors);
      return;
    }

    setLoading(true);

    const idAuth = schoolId || user?.id;
    try {
      const now = new Date().toISOString();

      if (isEditing) {
        if (!idAuth) return;
        const classCapacity = formData.classId ? await getClassCapacityState(idAuth, formData.classId, id) : null;
        if (classCapacity?.isFull) {
          addToast(`${classCapacity.name} is full (${classCapacity.enrolled}/${classCapacity.capacity}). Choose another class.`, 'error');
          setCurrentStep(1);
          return;
        }

        const students = await dataService.getAll(idAuth, 'students');
        const existingValues = students.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
        const finalStudentId = studentId.trim() || generateStudentId(formData.firstName || 'ST', formData.lastName || 'UD', existingValues);
        await dataService.update(idAuth, 'students', id!, { ...formData, admissionNo: finalStudentId, studentId: finalStudentId, updatedAt: now } as any);
        addToast('Student updated successfully', 'success');
      } else {
        if (!idAuth) return;

        const classCapacity = formData.classId ? await getClassCapacityState(idAuth, formData.classId) : null;
        if (classCapacity?.isFull) {
          addToast(`${classCapacity.name} is full (${classCapacity.enrolled}/${classCapacity.capacity}). Choose another class.`, 'error');
          setCurrentStep(1);
          return;
        }

        const existingVals = await dataService.getAll(idAuth, 'students');
        const existingStudentValues = existingVals.flatMap(s => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
        const finalStudentId = studentId.trim() || generateStudentId(formData.firstName || 'ST', formData.lastName || 'UD', existingStudentValues);
        const newStudent: Student = {
          id: tempId,
          userId: user!.id,
          schoolId: idAuth,
          admissionNo: finalStudentId,
          studentId: finalStudentId,
          firstName: formData.firstName || '',
          lastName: formData.lastName || '',
          dob: formData.dob || '',
          gender: formData.gender || Gender.MALE,
          classId: formData.classId || '',
          address: formData.address || '',
          guardianName: formData.guardianName || '',
          guardianPhone: formData.guardianPhone || '',
          guardianEmail: formData.guardianEmail,
          medicalInfo: formData.medicalInfo,
          photoUrl: formData.photoUrl,
          status: formData.status || 'active',
          tuitionFee: formData.tuitionFee,
          boardingFee: formData.boardingFee,
          requirements: formData.requirements || [],
          customFields: formData.customFields || [],
          attachments: formData.attachments || [],
          createdAt: now,
          updatedAt: now,
        };
        await dataService.create(idAuth, 'students', newStudent as any);
        addToast('Student admitted successfully', 'success');
        window.dispatchEvent(new Event('studentsUpdated'));
      }

      await loadClasses();
      navigate('/students');
    } catch (error) {
      console.error('Failed to save student:', error);
      addToast('Failed to save student', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleDone() {
    const idAuth = schoolId || user?.id;
    if (!idAuth) return;
    setLoading(true);

    try {
      const now = new Date().toISOString();
      const allStudents = await dataService.getAll(idAuth, 'students');
      const existingVals = allStudents.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      const finalStudentId = studentId.trim() || generateStudentId(formData.firstName || 'ST', formData.lastName || 'UD', existingVals);
      await dataService.update(idAuth, 'students', id!, { ...formData, admissionNo: finalStudentId, studentId: finalStudentId, updatedAt: now } as any);
      addToast('Student updated successfully', 'success');
      window.dispatchEvent(new Event('studentsUpdated'));
      navigate('/students');
    } catch (error) {
      console.error('Failed to save student:', error);
      addToast('Failed to save student', 'error');
    } finally {
      setLoading(false);
    }
  }

  function addCustomField() {
    if (!newCustomField.label.trim()) return;
    
    const field: CustomField = {
      id: uuidv4(),
      label: newCustomField.label.trim(),
      value: newCustomField.value.trim(),
    };
    
    setFormData(prev => ({
      ...prev,
      customFields: [...(prev.customFields || []), field],
    }));
    setNewCustomField({ label: '', value: '' });
  }

  function removeCustomField(id: string) {
    setFormData(prev => ({
      ...prev,
      customFields: (prev.customFields || []).filter(f => f.id !== id),
    }));
  }

  function updateCustomField(id: string, value: string) {
    setFormData(prev => ({
      ...prev,
      customFields: (prev.customFields || []).map(f => 
        f.id === id ? { ...f, value } : f
      ),
    }));
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        const attachment: Attachment = {
          id: uuidv4(),
          name: file.name,
          file: reader.result as string,
          type: file.type,
        };
        
        setFormData(prev => ({
          ...prev,
          attachments: [...(prev.attachments || []), attachment],
        }));
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  }

  function removeAttachment(id: string) {
    setFormData(prev => ({
      ...prev,
      attachments: (prev.attachments || []).filter(a => a.id !== id),
    }));
  }

  function renderStepIndicator() {
    return (
      <div className="mb-8">
        <div className="flex items-center justify-center">
          {steps.map((step, index) => (
            <React.Fragment key={step.id}>
              <div className="flex items-center">
                <div 
                  className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all duration-300 ${
                    currentStep >= step.id
                      ? 'bg-primary-600 text-white shadow-lg scale-105'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                  }`}
                >
                  {currentStep > step.id ? (
                    <Check size={20} />
                  ) : (
                    <step.icon size={20} />
                  )}
                </div>
                <span className={`ml-2 text-sm font-medium hidden sm:inline ${
                  currentStep >= step.id
                    ? 'text-primary-600 dark:text-primary-400'
                    : 'text-slate-500'
                }`}>
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div 
                  className={`w-8 sm:w-16 h-1 mx-2 rounded transition-all duration-300 ${
                    currentStep > step.id
                      ? 'bg-primary-600'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    );
  }

  function renderPersonalInfoStep() {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center gap-4 mb-6">
          <ImageUpload
            label="Student Photo"
            value={formData.photoUrl}
            onChange={(base64) => setFormData(prev => ({ ...prev, photoUrl: base64 as any }))}
            className="w-32"
          />
          <div className="flex-1">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Upload a clear photo showing the student's face
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="form-label">
              Student ID / Admission No *
              <span className="ml-2 text-xs text-slate-400 font-normal">
                (e.g., {generateExampleId()})
              </span>
            </label>
            <div className="flex gap-2">
              <input
                ref={studentIdInputRef}
                type="text"
                value={studentId}
                onChange={(e) => handleStudentIdChange(e.target.value.toUpperCase())}
                className="form-input font-mono"
                placeholder="ADM/2026/0001 or JOKI0001"
                required
              />
              <button 
                type="button" 
                onClick={regenerateStudentId} 
                className="btn btn-secondary whitespace-nowrap"
                title="Generate new ID"
              >
                <Sparkles size={16} />
              </button>
              <button 
                type="button" 
                onClick={() => setShowIdFormatModal(true)} 
                className="btn btn-secondary whitespace-nowrap"
                title="ID Format Settings"
              >
                <Settings size={16} />
              </button>
            </div>
          </div>
          <div>
            <label className="form-label">First Name *</label>
            <input
              type="text"
              name="firstName"
              value={formData.firstName}
              onChange={handleChange}
              className={`form-input ${validationErrors.find(e => e.field === 'firstName') ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}`}
              placeholder="Enter first name"
            />
          </div>
          <div>
            <label className="form-label">Last Name *</label>
            <input
              type="text"
              name="lastName"
              value={formData.lastName}
              onChange={handleChange}
              className={`form-input ${validationErrors.find(e => e.field === 'lastName') ? 'border-red-500' : ''}`}
              placeholder="Enter last name"
            />
          </div>
          <div>
            <label className="form-label">Date of Birth *</label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              className={`form-input ${validationErrors.find(e => e.field === 'dob') ? 'border-red-500' : ''}`}
            />
          </div>
          <div>
            <label className="form-label">Gender *</label>
            <select 
              name="gender" 
              value={formData.gender} 
              onChange={handleChange} 
              className="form-input"
            >
              <option value={Gender.MALE}>Male</option>
              <option value={Gender.FEMALE}>Female</option>
              <option value={Gender.OTHER}>Other</option>
            </select>
          </div>
          <div>
            <label className="form-label">Class *</label>
            <select 
              name="classId" 
              value={formData.classId} 
              onChange={handleChange} 
              className={`form-input ${validationErrors.find(e => e.field === 'classId') ? 'border-red-500' : ''}`}
            >
              <option value="">Select Class</option>
              {classes.map((classItem) => (
                <option key={classItem.id} value={classItem.id} disabled={classItem.isFull && classItem.id !== formData.classId}>
                  {classItem.name} ({classItem.enrolled}/{classItem.capacity}){classItem.isFull && classItem.id !== formData.classId ? ' - Full' : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="form-label">Status</label>
            <select 
              name="status" 
              value={formData.status} 
              onChange={handleChange} 
              className="form-input"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        <div>
          <label className="form-label">Address</label>
          <textarea
            name="address"
            value={formData.address}
            onChange={handleChange}
            className="form-input"
            rows={2}
            placeholder="Enter home address"
          />
        </div>
      </div>
    );
  }

  function renderGuardianStep() {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="p-4 bg-violet-50 dark:bg-violet-900/20 rounded-xl border border-violet-200 dark:border-violet-800">
          <p className="text-sm text-violet-600 dark:text-violet-400">
            Guardian information is important for emergency contact and communication purposes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="form-label">Guardian Name *</label>
            <input
              type="text"
              name="guardianName"
              value={formData.guardianName}
              onChange={handleChange}
              className={`form-input ${validationErrors.find(e => e.field === 'guardianName') ? 'border-red-500' : ''}`}
              placeholder="Enter guardian's full name"
            />
          </div>
          <div>
            <label className="form-label">Guardian Phone *</label>
            <input
              type="tel"
              name="guardianPhone"
              value={formData.guardianPhone}
              onChange={handleChange}
              className={`form-input ${validationErrors.find(e => e.field === 'guardianPhone') ? 'border-red-500' : ''}`}
              placeholder="Enter phone number"
            />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Guardian Email</label>
            <input
              type="email"
              name="guardianEmail"
              value={formData.guardianEmail}
              onChange={handleChange}
              className="form-input"
              placeholder="Enter email address (optional)"
            />
          </div>
        </div>
      </div>
    );
  }

  function renderAdditionalStep() {
    return (
      <div className="space-y-6 animate-fade-in">
        <div>
          <label className="form-label">Medical Information</label>
          <textarea
            name="medicalInfo"
            value={formData.medicalInfo}
            onChange={handleChange}
            className="form-input"
            rows={3}
            placeholder="Any allergies, medical conditions, or special needs..."
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="form-label">Tuition Fee ({currency.symbol}/term)</label>
            <input
              type="number"
              name="tuitionFee"
              value={formData.tuitionFee || ''}
              onChange={handleChange}
              className="form-input"
              placeholder="e.g., 500000"
              min="0"
            />
          </div>
          <div>
            <label className="form-label">Boarding Fee ({currency.symbol}/term)</label>
            <input
              type="number"
              name="boardingFee"
              value={formData.boardingFee || ''}
              onChange={handleChange}
              className="form-input"
              placeholder="e.g., 300000"
              min="0"
            />
          </div>
        </div>

        {(formData.tuitionFee || formData.boardingFee) && (
          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
            <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium mb-1">Total Fees per Term</p>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
              {formatMoney((formData.tuitionFee || 0) + (formData.boardingFee || 0))}
            </p>
          </div>
        )}

        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <FileText size={20} className="text-violet-500" />
            Admission Requirements
          </h3>
          <div className="flex flex-wrap gap-2">
            {commonRequirements.map(req => (
              <button
                key={req}
                type="button"
                onClick={() => {
                  const current = formData.requirements || [];
                  if (current.includes(req)) {
                    setFormData(prev => ({ ...prev, requirements: current.filter(r => r !== req) }));
                  } else {
                    setFormData(prev => ({ ...prev, requirements: [...current, req] }));
                  }
                }}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  formData.requirements?.includes(req)
                    ? 'bg-violet-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-violet-100 dark:hover:bg-violet-900/40'
                }`}
              >
                {formData.requirements?.includes(req) && <span className="mr-1">✓</span>}
                {req}
              </button>
            ))}
          </div>
          <div className="flex gap-2 mt-4">
            <input
              type="text"
              value={newRequirement}
              onChange={e => setNewRequirement(e.target.value)}
              placeholder="Add custom requirement..."
              className="form-input flex-1"
              onKeyDown={e => {
                if (e.key === 'Enter' && newRequirement.trim()) {
                  e.preventDefault();
                  const current = formData.requirements || [];
                  if (!current.includes(newRequirement.trim())) {
                    setFormData(prev => ({ ...prev, requirements: [...current, newRequirement.trim()] }));
                  }
                  setNewRequirement('');
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (newRequirement.trim()) {
                  const current = formData.requirements || [];
                  if (!current.includes(newRequirement.trim())) {
                    setFormData(prev => ({ ...prev, requirements: [...current, newRequirement.trim()] }));
                  }
                  setNewRequirement('');
                }
              }}
              className="btn btn-secondary"
            >
              <Plus size={18} /> Add
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Plus size={20} className="text-teal-500" />
            Custom Fields
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Add custom information fields to collect additional data
          </p>
          
          {formData.customFields && formData.customFields.length > 0 && (
            <div className="space-y-3 mb-4">
              {formData.customFields.map(field => (
                <div key={field.id} className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-600 dark:text-slate-400 w-40 truncate">{field.label}</span>
                  <input
                    type="text"
                    value={field.value}
                    onChange={e => updateCustomField(field.id, e.target.value)}
                    className="form-input flex-1"
                    placeholder={`Enter ${field.label.toLowerCase()}`}
                  />
                  <button
                    type="button"
                    onClick={() => removeCustomField(field.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex gap-2">
            <input
              type="text"
              value={newCustomField.label}
              onChange={e => setNewCustomField(prev => ({ ...prev, label: e.target.value }))}
              className="form-input flex-1"
              placeholder="Field name (e.g., Nationality, Religion)"
            />
            <input
              type="text"
              value={newCustomField.value}
              onChange={e => setNewCustomField(prev => ({ ...prev, value: e.target.value }))}
              className="form-input flex-1"
              placeholder="Field value"
            />
            <button
              type="button"
              onClick={addCustomField}
              disabled={!newCustomField.label.trim()}
              className="btn btn-secondary disabled:opacity-50"
            >
              <Plus size={18} /> Add
            </button>
          </div>
        </div>

        <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
          <h3 className="text-lg font-medium text-slate-800 dark:text-white mb-4 flex items-center gap-2">
            <Paperclip size={20} className="text-amber-500" />
            Attachments
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Upload documents and files related to this student
          </p>
          
          <div className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-6 text-center hover:border-primary-400 dark:hover:border-primary-500 transition-colors">
            <input
              type="file"
              id="file-upload"
              multiple
              onChange={handleFileUpload}
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.webp"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <Upload size={32} className="mx-auto text-slate-400 mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                PDF, DOC, JPG, PNG up to 10MB
              </p>
            </label>
          </div>
          
          {formData.attachments && formData.attachments.length > 0 && (
            <div className="mt-4 space-y-2">
              {formData.attachments.map(attachment => (
                <div key={attachment.id} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center">
                    {attachment.type.startsWith('image/') ? (
                      <img src={attachment.file} alt={attachment.name} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <FileText size={20} className="text-primary-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{attachment.name}</p>
                    <p className="text-xs text-slate-400">{attachment.type.split('/')[1]?.toUpperCase() || 'FILE'}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAttachment(attachment.id)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  function renderReviewStep() {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="card border border-slate-200 dark:border-slate-700">
          <div className="card-header bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-white">Personal Information</h3>
          </div>
          <div className="card-body">
            <div className="flex items-center gap-4 mb-4">
              {formData.photoUrl ? (
                <img src={formData.photoUrl} alt="Student" className="w-20 h-20 rounded-full object-cover object-top" />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
                  <span className="text-2xl font-bold text-primary-600">
                    {formData.firstName?.[0]}{formData.lastName?.[0]}
                  </span>
                </div>
              )}
              <div>
                <p className="text-lg font-bold text-slate-800 dark:text-white">
                  {formData.firstName} {formData.lastName}
                </p>
                <p className="text-sm text-slate-500">{getClassDisplayName(formData.classId, classes)}</p>
                {studentId && (
                  <p className="text-xs text-primary-600 dark:text-primary-400 font-medium">ID: {studentId}</p>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Date of Birth</p>
                <p className="font-medium">{formData.dob}</p>
              </div>
              <div>
                <p className="text-slate-500">Gender</p>
                <p className="font-medium capitalize">{formData.gender?.toLowerCase()}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500">Address</p>
                <p className="font-medium">{formData.address || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card border border-slate-200 dark:border-slate-700">
          <div className="card-header bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-white">Guardian Information</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500">Name</p>
                <p className="font-medium">{formData.guardianName}</p>
              </div>
              <div>
                <p className="text-slate-500">Phone</p>
                <p className="font-medium">{formData.guardianPhone}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-500">Email</p>
                <p className="font-medium">{formData.guardianEmail || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card border border-slate-200 dark:border-slate-700">
          <div className="card-header bg-slate-50 dark:bg-slate-800/50">
            <h3 className="font-bold text-slate-800 dark:text-white">Fees & Requirements</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
              <div>
                <p className="text-slate-500">Tuition Fee</p>
                <p className="font-medium">{formData.tuitionFee ? formatMoney(formData.tuitionFee) : 'Not set'}</p>
              </div>
              <div>
                <p className="text-slate-500">Boarding Fee</p>
                <p className="font-medium">{formData.boardingFee ? formatMoney(formData.boardingFee) : 'Not set'}</p>
              </div>
            </div>
            {formData.requirements && formData.requirements.length > 0 && (
              <div>
                <p className="text-slate-500 mb-2">Requirements</p>
                <div className="flex flex-wrap gap-2">
                  {formData.requirements.map(req => (
                    <span key={req} className="px-2 py-1 bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded text-xs font-medium">
                      {req}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {formData.customFields && formData.customFields.length > 0 && (
          <div className="card border border-slate-200 dark:border-slate-700">
            <div className="card-header bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-white">Custom Information</h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 gap-4 text-sm">
                {formData.customFields.map(field => (
                  <div key={field.id}>
                    <p className="text-slate-500">{field.label}</p>
                    <p className="font-medium">{field.value || 'Not provided'}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {formData.attachments && formData.attachments.length > 0 && (
          <div className="card border border-slate-200 dark:border-slate-700">
            <div className="card-header bg-slate-50 dark:bg-slate-800/50">
              <h3 className="font-bold text-slate-800 dark:text-white">Attachments</h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {formData.attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                    {attachment.type.startsWith('image/') ? (
                      <img src={attachment.file} alt={attachment.name} className="w-8 h-8 rounded object-cover" />
                    ) : (
                      <FileText size={16} className="text-primary-600" />
                    )}
                    <span className="text-xs truncate">{attachment.name}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderValidationPopup() {
    return (
      <div 
        className={`fixed inset-0 z-[100] flex items-start justify-center pt-20 pointer-events-none transition-all duration-300 ${
          showValidationPopup ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div 
          className={`pointer-events-auto bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-red-200 dark:border-red-800 w-full max-w-md mx-4 overflow-hidden transition-all duration-300 ${
            showValidationPopup ? 'translate-y-0 scale-100' : '-translate-y-8 scale-95'
          }`}
        >
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
              <AlertCircle size={24} className="text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h3 className="font-bold text-red-800 dark:text-red-200">Please fill in required fields</h3>
              <p className="text-sm text-red-600 dark:text-red-400">The following fields are required:</p>
            </div>
            <button 
              onClick={() => setShowValidationPopup(false)}
              className="ml-auto p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
            >
              <X size={18} className="text-red-600 dark:text-red-400" />
            </button>
          </div>
          <div className="p-4 max-h-60 overflow-y-auto">
            <ul className="space-y-2">
              {validationErrors.map((error, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                  {error.message}
                </li>
              ))}
            </ul>
          </div>
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700">
            <button 
              onClick={() => setShowValidationPopup(false)}
              className="w-full btn btn-primary"
            >
              Fix Errors
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSaveFormatPrompt() {
    return (
      <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all ${showSaveFormatPrompt ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={handleSkipSaveFormat} />
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden animate-modal-in">
          <div className="p-5">
            <div className="w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mx-auto mb-4">
              <Sparkles size={24} className="text-indigo-600" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-800 dark:text-white mb-2">
              Save This ID Format?
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-1">
              We detected a new format from:
            </p>
            <p className="text-center font-mono font-bold text-primary-600 dark:text-primary-400 mb-4">
              {pendingCustomId}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 text-center mb-5">
              Would you like to use this format for all new student IDs?
            </p>
            <div className="flex gap-3">
              <button 
                onClick={handleSkipSaveFormat}
                className="flex-1 btn btn-secondary"
              >
                Skip
              </button>
              <button 
                onClick={handleSaveDetectedFormat}
                className="flex-1 btn btn-primary"
              >
                Save Format
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderIdFormatModal() {
    const presets = getPresetFormats();
    
    return (
      <div className={`fixed inset-0 z-[100] flex items-center justify-center p-4 transition-all ${showIdFormatModal ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowIdFormatModal(false)} />
        <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden animate-modal-in">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Settings size={20} className="text-indigo-600" />
              Student ID Format
            </h3>
            <button 
              onClick={() => setShowIdFormatModal(false)}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="p-5 max-h-[70vh] overflow-y-auto">
            <div className="mb-5">
              <label className="form-label mb-2">Quick Presets</label>
              <div className="grid grid-cols-1 gap-2">
                {Object.entries(presets).map(([key, preset]) => (
                  <button
                    key={key}
                    onClick={() => applyPresetFormat(key)}
                    className={`p-3 rounded-xl border-2 text-left transition-all ${
                      idFormat.pattern === preset.pattern 
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' 
                        : 'border-slate-200 dark:border-slate-700 hover:border-primary-300 dark:hover:border-primary-700'
                    }`}
                  >
                    <div className="font-medium text-sm text-slate-800 dark:text-white">
                      {key === 'sequential' ? 'Sequential (Recommended)' : 
                       key === 'initials_random' ? 'Name Initials + Random' : 
                       'Mixed Format'}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-1">
                      {preset.customExample}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-5">
              <label className="form-label mb-2">Custom Pattern</label>
              <div className="space-y-3">
                <div>
                  <input
                    type="text"
                    value={customPattern}
                    onChange={(e) => setCustomPattern(e.target.value.toUpperCase())}
                    className="form-input font-mono"
                    placeholder="ADM/YYYY/####"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Use: <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded">YYYY</code> year, 
                    <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded ml-1">YY</code> 2-digit year,
                    <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded ml-1">INI</code> name initials,
                    <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded ml-1">####</code> sequential,
                    <code className="bg-slate-100 dark:bg-slate-700 px-1 rounded ml-1">****</code> random
                  </p>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                  <p className="text-xs text-slate-500 mb-1">Example output:</p>
                  <p className="font-mono font-bold text-primary-600 dark:text-primary-400">
                    {generateExampleId({ ...idFormat, pattern: customPattern })}
                  </p>
                </div>
                <button
                  onClick={applyCustomPattern}
                  className="w-full btn btn-primary"
                >
                  Apply & Generate
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (loadingData) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-primary-500" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/students')} className="btn btn-ghost p-2">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
              {isEditing ? 'Edit Student' : 'New Admission'}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              {isEditing ? 'Update student information' : 'Complete the admission process'}
            </p>
          </div>
        </div>
        {isEditing && (
          <button 
            type="button"
            onClick={handleDone}
            disabled={loading}
            className="btn btn-primary"
          >
            {loading ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                <CheckCircle size={18} />
                Done
              </>
            )}
          </button>
        )}
      </div>

      {renderStepIndicator()}

      <form onSubmit={handleSubmit} className="card">
        <div className="card-body">
          {currentStep === 1 && renderPersonalInfoStep()}
          {currentStep === 2 && renderGuardianStep()}
          {currentStep === 3 && renderAdditionalStep()}
          {currentStep === 4 && renderReviewStep()}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-between gap-3">
          <button 
            type="button" 
            onClick={handlePrevious}
            disabled={currentStep === 1}
            className={`btn btn-secondary ${currentStep === 1 ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <ArrowLeft size={18} />
            Previous
          </button>
          
          {currentStep < 4 ? (
            <button 
              type="button" 
              onClick={handleNext}
              className="btn btn-primary"
            >
              Next
              <ArrowRight size={18} />
            </button>
          ) : (
            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
            >
              {loading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save size={18} />
                  {isEditing ? 'Update Student' : 'Complete Admission'}
                </>
              )}
            </button>
          )}
        </div>
      </form>

      {renderValidationPopup()}
      {renderSaveFormatPrompt()}
      {renderIdFormatModal()}
    </div>
  );
}
