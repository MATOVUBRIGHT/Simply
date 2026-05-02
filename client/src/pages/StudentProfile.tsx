import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Edit, Mail, Phone, MapPin, Calendar, User, DollarSign, GraduationCap, BookOpen } from 'lucide-react';
import { Student, Class } from '@schofy/shared';
import ImageModal from '../components/ImageModal';
import DropdownModal from '../components/DropdownModal';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../contexts/AuthContext';
import { dataService } from '../lib/database/SupabaseDataService';
import { useTableData } from '../lib/store';

export default function StudentProfile() {
  const { id } = useParams();
  const { user, schoolId } = useAuth();
  const { addToast } = useToast();
  const sid = schoolId || user?.id || '';
  const [previewImage, setPreviewImage] = useState<{ src: string; alt: string } | null>(null);
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [updatingClass, setUpdatingClass] = useState(false);

  const { data: studentsData, loading } = useTableData(sid, 'students');
  const { data: classesData } = useTableData(sid, 'classes');

  const student = useMemo(() =>
    (studentsData.find((s: any) => s.id === id) as Student) || null,
    [studentsData, id]
  );
  const classes = classesData as Class[];

  async function handleClassChange(newClassId: string) {
    const authId = schoolId || user?.id;
    if (!authId || !student || student.classId === newClassId) {
      setShowClassDropdown(false);
      return;
    }

    setUpdatingClass(true);
    try {
      const now = new Date().toISOString();
      await dataService.update(authId, 'students', student.id, { classId: newClassId, updatedAt: now } as any);
      window.dispatchEvent(new Event('studentsUpdated'));
      addToast('Class updated successfully', 'success');
    } catch (error) {
      console.error('Failed to update class:', error);
      addToast('Failed to update class', 'error');
    } finally {
      setUpdatingClass(false);
      setShowClassDropdown(false);
    }
  }

  function getClassName(classId: string) {
    const cls = classes.find(c => c.id === classId);
    return cls ? cls.name : classId;
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Student not found</p>
        <Link to="/students" className="btn btn-primary mt-4">
          Back to Students
        </Link>
      </div>
    );
  }

  const infoItems = [
    { icon: Calendar, label: 'Date of Birth', value: student.dob ? new Date(student.dob).toLocaleDateString() : 'N/A' },
    { icon: User, label: 'Gender', value: student.gender },
    { icon: MapPin, label: 'Address', value: student.address || 'Not provided' },
    { icon: Mail, label: 'Guardian Email', value: student.guardianEmail || 'Not provided' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to="/students" className="btn btn-ghost p-2">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-800 dark:text-white">
            {student.firstName} {student.lastName}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Admission No: {student.admissionNo}</p>
        </div>
        <Link to={`/students/${student.id}/edit`} className="btn btn-primary">
          <Edit size={18} />
          Edit
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="card">
            <div className="card-body text-center">
              {student.photoUrl ? (
                <button 
                  onClick={() => setPreviewImage({ src: student.photoUrl!, alt: `${student.firstName} ${student.lastName}` })}
                  className="mx-auto mb-4 block"
                >
                  <img 
                    src={student.photoUrl} 
                    alt={`${student.firstName} ${student.lastName}`}
                    className="w-24 h-24 rounded-full object-cover object-top shadow-lg hover:ring-4 hover:ring-primary-500/30 transition-all cursor-pointer"
                  />
                </button>
              ) : (
                <div className="w-24 h-24 mx-auto rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center mb-4">
                  <span className="text-3xl font-bold text-primary-600 dark:text-primary-400">
                    {student.firstName[0]}{student.lastName[0]}
                  </span>
                </div>
              )}
              <h2 className="text-xl font-bold text-slate-800 dark:text-white">
                {student.firstName} {student.lastName}
              </h2>
              <p className="text-slate-500 dark:text-slate-400 capitalize">{student.gender}</p>
              <span className={`badge mt-3 ${
                student.status === 'active' ? 'badge-success' : 'badge-gray'
              }`}>
                {student.status}
              </span>
            </div>
          </div>

          <div className="card mt-6">
            <div className="card-header">
              <h3 className="font-semibold text-slate-800 dark:text-white">Contact Information</h3>
            </div>
            <div className="card-body space-y-4">
              <div className="flex items-center gap-3">
                <Phone size={18} className="text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="text-sm text-slate-800 dark:text-white">{student.guardianPhone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail size={18} className="text-slate-400" />
                <div>
                  <p className="text-xs text-slate-500">Email</p>
                  <p className="text-sm text-slate-800 dark:text-white">{student.guardianEmail || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <MapPin size={18} className="text-slate-400 mt-0.5" />
                <div>
                  <p className="text-xs text-slate-500">Address</p>
                  <p className="text-sm text-slate-800 dark:text-white">{student.address || 'N/A'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-slate-800 dark:text-white">Personal Information</h3>
            </div>
            <div className="card-body">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {infoItems.map((item, idx) => (
                  <div key={idx}>
                    <p className="text-xs text-slate-500 mb-1">{item.label}</p>
                    <div className="flex items-center gap-2">
                      <item.icon size={14} className="text-slate-400" />
                      <p className="text-sm font-medium text-slate-800 dark:text-white capitalize">{item.value}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="font-semibold text-slate-800 dark:text-white">Guardian Details</h3>
            </div>
            <div className="card-body">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <User size={20} className="text-slate-500" />
                </div>
                <div>
                  <p className="font-medium text-slate-800 dark:text-white">{student.guardianName}</p>
                  <p className="text-sm text-slate-500">Primary Guardian</p>
                </div>
              </div>
            </div>
          </div>

          {student.medicalInfo && (
            <div className="card">
              <div className="card-header">
                <h3 className="font-semibold text-slate-800 dark:text-white">Medical Information</h3>
              </div>
              <div className="card-body">
                <p className="text-sm text-slate-600 dark:text-slate-400">{student.medicalInfo}</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="card">
              <button 
                onClick={() => setShowClassDropdown(true)}
                className="w-full card-body flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left"
                disabled={updatingClass}
              >
                <div className="p-3 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                  <GraduationCap size={24} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-slate-500">Class</p>
                  <p className="text-lg font-bold text-slate-800 dark:text-white">
                    {updatingClass ? 'Updating...' : getClassName(student.classId)}
                  </p>
                </div>
                <BookOpen size={20} className="text-slate-400" />
              </button>
            </div>
            <DropdownModal
              isOpen={showClassDropdown}
              onClose={() => setShowClassDropdown(false)}
              title="Change Class"
              icon={<GraduationCap size={20} />}
            >
              <div className="p-2">
                {classes.map(cls => (
                  <button
                    key={cls.id}
                    onClick={() => handleClassChange(cls.id)}
                    className={`w-full px-4 py-3 text-left rounded-lg transition-colors flex items-center justify-between ${
                      student.classId === cls.id 
                        ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' 
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen size={16} className={student.classId === cls.id ? 'text-indigo-500' : 'text-slate-400'} />
                      <span className="font-medium">{cls.name}</span>
                    </div>
                    {student.classId === cls.id && (
                      <span className="text-xs bg-indigo-200 dark:bg-indigo-800 px-2 py-0.5 rounded-full">Current</span>
                    )}
                  </button>
                ))}
              </div>
            </DropdownModal>
            <div className="card">
              <div className="card-body flex items-center gap-4">
                <div className="p-3 rounded-lg bg-green-100 dark:bg-green-900/30">
                  <DollarSign size={24} className="text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-500">Fee Status</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">Paid</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      {previewImage && (
        <ImageModal 
          src={previewImage.src} 
          alt={previewImage.alt} 
          isOpen={!!previewImage}
          onClose={() => setPreviewImage(null)}
        />
      )}
    </div>
  );
}
