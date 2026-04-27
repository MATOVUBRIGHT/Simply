import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, User, Users, FileText, ClipboardCheck, Loader2, Save, Plus, Settings, Sparkles, X } from 'lucide-react';
import { useToast } from '../contexts/ToastContext';
import { Student, Gender } from '@schofy/shared';
import { v4 as uuidv4 } from 'uuid';
import ImageUpload from '../components/ImageUpload';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { ClassOption, getClassCapacityState, getStudentClassOptions } from '../utils/classroom';
import { generateStudentId, getSavedIdFormat, saveIdFormat, getPresetFormats, generateExampleId, extractFormatFromId, IdFormat } from '../utils/idFormat';

interface AdmissionFormData {
  admissionNo: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: Gender;
  classId: string;
  address: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string;
  guardianRelation: string;
  guardianOccupation: string;
  medicalInfo: string;
  photoUrl: string;
  tuitionFee: number;
  boardingFee: number;
  requirements: string[];
  previousSchool: string;
  previousClass: string;
  transferLetter: boolean;
  birthCertificate: boolean;
  passportPhotos: boolean;
}

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

const initialFormData: AdmissionFormData = {
  admissionNo: '',
  firstName: '',
  lastName: '',
  dob: '',
  gender: Gender.MALE,
  classId: '',
  address: '',
  guardianName: '',
  guardianPhone: '',
  guardianEmail: '',
  guardianRelation: 'Parent',
  guardianOccupation: '',
  medicalInfo: '',
  photoUrl: '',
  tuitionFee: 0,
  boardingFee: 0,
  requirements: [],
  previousSchool: '',
  previousClass: '',
  transferLetter: false,
  birthCertificate: false,
  passportPhotos: false,
};

const steps = [
  { id: 1, title: 'Student Info', icon: User },
  { id: 2, title: 'Guardian', icon: Users },
  { id: 3, title: 'Documents', icon: FileText },
  { id: 4, title: 'Review', icon: ClipboardCheck },
];

export default function Admission() {
  const { user, schoolId } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [formData, setFormData] = useState<AdmissionFormData>(initialFormData);
  const [loading, setLoading] = useState(false);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [newRequirement, setNewRequirement] = useState('');
  const [showIdFormatModal, setShowIdFormatModal] = useState(false);
  const [idFormat, setIdFormat] = useState<IdFormat>(getSavedIdFormat());
  const [customPattern, setCustomPattern] = useState(getSavedIdFormat().pattern);
  const [showSaveFormatPrompt, setShowSaveFormatPrompt] = useState(false);
  const [pendingCustomId, setPendingCustomId] = useState<string>('');

  useEffect(() => {
    if (user?.id || schoolId) {
      loadClasses();
      hydrateAdmissionNo();
    }
  }, [user?.id, schoolId]);

  async function loadClasses() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      setClasses(await getStudentClassOptions(id));
    } catch (error) {
      console.error('Failed to load classes:', error);
    }
  }

  async function hydrateAdmissionNo() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const students = await dataService.getAll(id, 'students');
      const existingValues = students.flatMap(s => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      
      const admissionNo = generateStudentId(
        formData.firstName || '',
        formData.lastName || '',
        existingValues
      );
      setFormData((prev) => ({ ...prev, admissionNo }));
    } catch (error) {
      console.error('Failed to generate admission number:', error);
    }
  }

  async function regenerateAdmissionNo() {
    const id = schoolId || user?.id;
    if (!id) return;
    try {
      const students = await dataService.getAll(id, 'students');
      const existingValues = students.flatMap(s => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      
      const admissionNo = generateStudentId(
        formData.firstName || 'ST',
        formData.lastName || 'UD',
        existingValues
      );
      setFormData((prev) => ({ ...prev, admissionNo }));
      addToast(`Generated: ${admissionNo}`, 'success');
    } catch (error) {
      console.error('Failed to regenerate admission number:', error);
      addToast('Failed to generate ID', 'error');
    }
  }

  function handleAdmissionNoChange(value: string) {
    setFormData((prev) => ({ ...prev, admissionNo: value.toUpperCase() }));
    
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
      regenerateAdmissionNo();
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
    regenerateAdmissionNo();
    setShowIdFormatModal(false);
    addToast('ID format saved!', 'success');
  }

  function handleSaveDetectedFormat() {
    const detected = extractFormatFromId(pendingCustomId);
    if (detected) {
      setIdFormat(detected);
      saveIdFormat(detected);
      setCustomPattern(detected.pattern);
      addToast('ID format detected and saved!', 'success');
    }
    setShowSaveFormatPrompt(false);
    setPendingCustomId('');
  }

  function handleSkipSaveFormat() {
    setShowSaveFormatPrompt(false);
    setPendingCustomId('');
  }

  useEffect(() => {
    if (formData.firstName && formData.lastName) {
      const timer = setTimeout(() => {
        regenerateAdmissionNo();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [formData.firstName, formData.lastName]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  }

  function nextStep() {
    if (currentStep < 4) {
      setCurrentStep(prev => prev + 1);
    }
  }

  function prevStep() {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  }

  function toggleRequirement(req: string) {
    setFormData(prev => ({
      ...prev,
      requirements: prev.requirements.includes(req)
        ? prev.requirements.filter(r => r !== req)
        : [...prev.requirements, req]
    }));
  }

  async function handleSubmit() {
    const id = schoolId || user?.id;
    if (!id) return;
    setLoading(true);
    try {
      const selectedClass = await getClassCapacityState(id, formData.classId);
      if (selectedClass?.isFull) {
        addToast(`${selectedClass.name} is full (${selectedClass.enrolled}/${selectedClass.capacity}). Choose another class.`, 'error');
        setCurrentStep(1);
        return;
      }

      const now = new Date().toISOString();
      const students = await dataService.getAll(id, 'students');
      const existingValues = students.flatMap((s: any) => [s.admissionNo, s.studentId].filter(Boolean) as string[]);
      const admissionNo = formData.admissionNo.trim() || generateStudentId(formData.firstName || 'ST', formData.lastName || 'UD', existingValues);

      const newStudent: Student = {
        id: uuidv4(),
        userId: user!.id,
        schoolId: id,
        admissionNo,
        studentId: admissionNo,
        firstName: formData.firstName,
        lastName: formData.lastName,
        dob: formData.dob,
        gender: formData.gender,
        classId: formData.classId,
        address: formData.address,
        guardianName: formData.guardianName,
        guardianPhone: formData.guardianPhone,
        guardianEmail: formData.guardianEmail || undefined,
        medicalInfo: formData.medicalInfo || undefined,
        photoUrl: formData.photoUrl || undefined,
        status: 'active',
        tuitionFee: formData.tuitionFee,
        boardingFee: formData.boardingFee,
        requirements: formData.requirements,
        createdAt: now,
        updatedAt: now,
      };

      await dataService.create(id, 'students', newStudent as any);
      addToast(`Student ${formData.firstName} admitted successfully! Admission No: ${admissionNo}`, 'success');
      await loadClasses();
      navigate('/students');
    } catch (error) {
      console.error('Failed to admit student:', error);
      addToast('Failed to complete admission', 'error');
    } finally {
      setLoading(false);
    }
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1:
        return formData.firstName && formData.lastName && formData.dob && formData.classId;
      case 2:
        return formData.guardianName && formData.guardianPhone;
      case 3:
        return true;
      case 4:
        return true;
      default:
        return false;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/students')} className="btn btn-ghost p-2">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Student Admission</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">New Student Registration</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                    isCompleted
                      ? 'bg-green-500 text-white'
                      : isActive
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
                  }`}>
                    {isCompleted ? <Check size={24} /> : <Icon size={24} />}
                  </div>
                  <span className={`text-xs font-medium mt-2 ${
                    isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-500'
                  }`}>{step.title}</span>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 rounded ${
                    currentStep > step.id ? 'bg-green-500' : 'bg-slate-200 dark:bg-slate-700'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Form Content */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6">
        {/* Step 1: Student Information */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <User size={20} className="text-indigo-600" />
              Student Information
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
              <div className="lg:col-span-1">
                <ImageUpload
                  label="Student Photo"
                  value={formData.photoUrl}
                  onChange={(base64) => setFormData(prev => ({ ...prev, photoUrl: base64 as string }))}
                />
              </div>
              <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="form-label">
                    Student ID / Admission No *
                    <span className="ml-2 text-xs text-slate-400 font-normal">
                      (e.g., {generateExampleId()})
                    </span>
                  </label>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      name="admissionNo" 
                      value={formData.admissionNo} 
                      onChange={(e) => handleAdmissionNoChange(e.target.value)} 
                      className="form-input font-mono" 
                      required 
                    />
                    <button 
                      type="button" 
                      onClick={regenerateAdmissionNo} 
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
                  <input type="text" name="firstName" value={formData.firstName} onChange={handleChange} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Last Name *</label>
                  <input type="text" name="lastName" value={formData.lastName} onChange={handleChange} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Date of Birth *</label>
                  <input type="date" name="dob" value={formData.dob} onChange={handleChange} className="form-input" required />
                </div>
                <div>
                  <label className="form-label">Gender *</label>
                  <select name="gender" value={formData.gender} onChange={handleChange} className="form-input">
                    <option value={Gender.MALE}>Male</option>
                    <option value={Gender.FEMALE}>Female</option>
                    <option value={Gender.OTHER}>Other</option>
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Class *</label>
                  <select name="classId" value={formData.classId} onChange={handleChange} className="form-input" required>
                    <option value="">Select Class</option>
                    {classes.map(c => (
                      <option key={c.id} value={c.id} disabled={c.isFull}>
                        {c.name} ({c.enrolled}/{c.capacity}){c.isFull ? ' - Full' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="form-label">Address</label>
                  <textarea name="address" value={formData.address} onChange={handleChange} className="form-input" rows={2} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Guardian Information */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <Users size={20} className="text-indigo-600" />
              Guardian Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="form-label">Guardian Name *</label>
                <input type="text" name="guardianName" value={formData.guardianName} onChange={handleChange} className="form-input" required />
              </div>
              <div>
                <label className="form-label">Relationship</label>
                <select name="guardianRelation" value={formData.guardianRelation} onChange={handleChange} className="form-input">
                  <option value="Parent">Parent</option>
                  <option value="Guardian">Guardian</option>
                  <option value="Sibling">Sibling</option>
                  <option value="Relative">Relative</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="form-label">Phone Number *</label>
                <input type="tel" name="guardianPhone" value={formData.guardianPhone} onChange={handleChange} className="form-input" required />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input type="email" name="guardianEmail" value={formData.guardianEmail} onChange={handleChange} className="form-input" />
              </div>
              <div>
                <label className="form-label">Occupation</label>
                <input type="text" name="guardianOccupation" value={formData.guardianOccupation} onChange={handleChange} className="form-input" />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">Medical Information</label>
                <textarea name="medicalInfo" value={formData.medicalInfo} onChange={handleChange} className="form-input" rows={3} placeholder="Allergies, medical conditions, special needs..." />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Documents */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <FileText size={20} className="text-indigo-600" />
              Documents & Requirements
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h3 className="font-medium text-slate-700 dark:text-slate-300">Required Documents Checklist</h3>
                <div className="space-y-3">
                  {[
                    { field: 'birthCertificate', label: 'Birth Certificate' },
                    { field: 'transferLetter', label: 'Transfer Letter' },
                    { field: 'passportPhotos', label: 'Passport Photos (4)' },
                  ].map(doc => (
                    <label key={doc.field} className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                      <input
                        type="checkbox"
                        name={doc.field}
                        checked={formData[doc.field as keyof AdmissionFormData] as boolean}
                        onChange={handleChange}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-slate-700 dark:text-slate-300">{doc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-medium text-slate-700 dark:text-slate-300">Additional Requirements</h3>
                <div className="flex flex-wrap gap-2">
                  {commonRequirements.map(req => (
                    <button
                      key={req}
                      type="button"
                      onClick={() => toggleRequirement(req)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        formData.requirements.includes(req)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
                      }`}
                    >
                      {formData.requirements.includes(req) && <Check size={14} className="inline mr-1" />}
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
                        if (!formData.requirements.includes(newRequirement.trim())) {
                          setFormData(prev => ({ ...prev, requirements: [...prev.requirements, newRequirement.trim()] }));
                        }
                        setNewRequirement('');
                      }
                    }}
                  />
                  <button type="button" onClick={() => {
                    if (newRequirement.trim() && !formData.requirements.includes(newRequirement.trim())) {
                      setFormData(prev => ({ ...prev, requirements: [...prev.requirements, newRequirement.trim()] }));
                      setNewRequirement('');
                    }
                  }} className="btn btn-secondary">
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-6">
              <h3 className="font-medium text-slate-700 dark:text-slate-300 mb-4">Previous School Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="form-label">Previous School Name</label>
                  <input type="text" name="previousSchool" value={formData.previousSchool} onChange={handleChange} className="form-input" placeholder="Enter school name" />
                </div>
                <div>
                  <label className="form-label">Class Previously Attended</label>
                  <input type="text" name="previousClass" value={formData.previousClass} onChange={handleChange} className="form-input" placeholder="e.g., Primary 6" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 4 && (
          <div className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <ClipboardCheck size={20} className="text-indigo-600" />
              Review & Confirm Admission
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <User size={18} className="text-indigo-600" />
                  Student Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Student ID</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.admissionNo || 'Will be generated'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Name</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.firstName} {formData.lastName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Gender</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.gender}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Date of Birth</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.dob || 'Not provided'}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Class</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{classes.find((classItem) => classItem.id === formData.classId)?.name || formData.classId || 'Not selected'}</p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 space-y-4">
                <h3 className="font-bold text-slate-800 dark:text-white flex items-center gap-2">
                  <Users size={18} className="text-indigo-600" />
                  Guardian Information
                </h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-slate-500">Name</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.guardianName}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Relationship</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.guardianRelation}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Phone</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.guardianPhone}</p>
                  </div>
                  <div>
                    <p className="text-slate-500">Email</p>
                    <p className="font-semibold text-slate-800 dark:text-white">{formData.guardianEmail || 'Not provided'}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-5 space-y-4">
              <h3 className="font-bold text-slate-800 dark:text-white">Documents Submitted</h3>
              <div className="flex flex-wrap gap-2">
                {formData.birthCertificate && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Birth Certificate</span>}
                {formData.transferLetter && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Transfer Letter</span>}
                {formData.passportPhotos && <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">Passport Photos</span>}
                {formData.requirements.map(req => (
                  <span key={req} className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">{req}</span>
                ))}
                {(!formData.birthCertificate && !formData.transferLetter && !formData.passportPhotos && formData.requirements.length === 0) && (
                  <span className="text-slate-500 text-sm">No documents marked</span>
                )}
              </div>
            </div>

            <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-5 border border-indigo-100 dark:border-indigo-800">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Check size={20} />
                <span className="font-bold">Ready for Admission</span>
              </div>
              <p className="text-sm text-indigo-600 dark:text-indigo-400 mt-2">
                Click "Complete Admission" to register this student using the selected student ID and class.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={prevStep}
          disabled={currentStep === 1}
          className={`btn ${currentStep === 1 ? 'btn-ghost opacity-50 cursor-not-allowed' : 'btn-secondary'}`}
        >
          <ArrowLeft size={18} />
          Previous
        </button>
        {currentStep < 4 ? (
          <button
            onClick={nextStep}
            disabled={!isStepValid()}
            className="btn btn-primary"
          >
            Next
            <ArrowRight size={18} />
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn bg-green-600 hover:bg-green-700 text-white border-green-600"
          >
            {loading ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Save size={18} />
                Complete Admission
              </>
            )}
          </button>
        )}
      </div>

      {/* Save Format Prompt Modal */}
      {showSaveFormatPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
      )}

      {/* ID Format Settings Modal */}
      {showIdFormatModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
                  {Object.entries(getPresetFormats()).map(([key, preset]) => (
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
      )}
    </div>
  );
}
