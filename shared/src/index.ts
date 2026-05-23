// User Roles
export enum UserRole {
  ADMIN = 'admin',
  TEACHER = 'teacher',
  ACCOUNTANT = 'accountant',
  PARENT = 'parent'
}

// Entity Types
export enum EntityType {
  STUDENT = 'student',
  STAFF = 'staff'
}

// Attendance Status
export enum AttendanceStatus {
  PRESENT = 'present',
  ABSENT = 'absent',
  LATE = 'late',
  EXCUSED = 'excused'
}

// Gender
export enum Gender {
  MALE = 'male',
  FEMALE = 'female',
  OTHER = 'other'
}

// Payment Status
export enum PaymentStatus {
  PAID = 'paid',
  PENDING = 'pending',
  PARTIAL = 'partial',
  OVERDUE = 'overdue'
}

// Payment Method
export enum PaymentMethod {
  CASH = 'cash',
  BANK_TRANSFER = 'bank_transfer',
  CARD = 'card',
  OTHER = 'other'
}

// Staff Roles
export enum StaffRole {
  TEACHER = 'teacher',
  DIRECTOR = 'director',
  BURSAR = 'bursar',
  ADMIN = 'admin',
  SUPPORT = 'support'
}

// Priority
export enum Priority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent'
}

// Sync Operation
export enum SyncOperation {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete'
}

// Database Tables
export const TABLES = {
  USERS: 'users',
  STUDENTS: 'students',
  STAFF: 'staff',
  CLASSES: 'classes',
  SUBJECTS: 'subjects',
  ATTENDANCE: 'attendance',
  FEES: 'fees',
  PAYMENTS: 'payments',
  ANNOUNCEMENTS: 'announcements',
  SETTINGS: 'settings',
  SYNC_QUEUE: 'sync_queue',
  EXAMS: 'exams',
  EXAM_RESULTS: 'exam_results',
  TIMETABLE: 'timetable',
  TRANSPORT_ROUTES: 'transport_routes',
  TRANSPORT_ASSIGNMENTS: 'transport_assignments'
} as const;

// Default Settings
export const DEFAULT_SETTINGS = {
  schoolName: 'My School',
  schoolAddress: '',
  schoolPhone: '',
  schoolEmail: '',
  currentAcademicYear: new Date().getFullYear().toString(),
  currentTerm: '1',
  termDates: {
    '1': { start: '', end: '' },
    '2': { start: '', end: '' },
    '3': { start: '', end: '' }
  },
  theme: 'light',
  primaryColor: '#3b82f6',
  shifts: ['Morning', 'Afternoon', 'Evening']
};

// Interfaces
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface Student {
  id: string;
  userId?: string;
  schoolId: string;
  admissionNo: string;
  studentId?: string;
  firstName: string;
  lastName: string;
  dob: string;
  gender: Gender;
  classId: string;
  streamId?: string;
  address: string;
  guardianName: string;
  guardianPhone: string;
  guardianEmail?: string;
  medicalInfo?: string;
  photoUrl?: string;
  status: 'active' | 'inactive' | 'graduated' | 'transferred' | 'completed';
  boardingStatus?: 'day' | 'boarding';
  tuitionFee?: number;
  boardingFee?: number;
  requirements?: string[];
  completedYear?: number;
  completedTerm?: string;
  customFields?: { id: string; label: string; value: string }[];
  attachments?: { id: string; name: string; file: string; type: string }[];
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface Staff {
  id: string;
  userId?: string;
  schoolId: string;
  employeeId: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  department?: string;
  dob?: string;
  address?: string;
  phone: string;
  email?: string;
  photoUrl?: string;
  salary?: number;
  joinDate?: string;
  qualification?: string;
  status: 'active' | 'inactive';
  subjects?: string[];
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface Class {
  id: string;
  schoolId: string;
  name: string;
  level: number;
  stream?: string;
  capacity: number;
  classTeacherId?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  classId: string;
  teacherId?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface Attendance {
  id: string;
  entityType: EntityType;
  entityId: string;
  date: string;
  status: AttendanceStatus;
  remarks?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface Fee {
  id: string;
  studentId?: string;
  classId?: string;
  description: string;
  amount: number;
  term: string;
  year: string;
  dueDate?: string;
  createdAt: string;
  syncedAt?: string;
}

export enum FeeCategory {
  TUITION = 'tuition',
  BOARDING = 'boarding',
  EXAM = 'exam',
  REGISTRATION = 'registration',
  UNIFORM = 'uniform',
  BOOKS = 'books',
  TRANSPORT = 'transport',
  ACTIVITY = 'activity',
  OTHER = 'other'
}

export interface FeeStructure {
  id: string;
  classId: string;
  name: string;
  category: FeeCategory;
  amount: number;
  isRequired: boolean;
  term: string;
  year: string;
  description?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface Payment {
  id: string;
  feeId: string;
  studentId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  date: string;
  receivedBy?: string;
  createdAt: string;
  syncedAt?: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  priority: Priority;
  createdBy: string;
  eventDate?: string;
  createdAt: string;
  updatedAt?: string;
  syncedAt?: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read: boolean;
  createdAt: string;
  link?: string;
}

export interface SalaryPayment {
  id: string;
  staffId: string;
  staffName: string;
  amount: number;
  month: string;
  year: number;
  status: 'pending' | 'paid' | 'upcoming';
  paidAt?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  createdAt: string;
}

export interface Settings {
  id: string;
  key: string;
  value: any;
  updatedAt: string;
}

export interface SyncQueueItem {
  id: string;
  table: string;
  operation: SyncOperation;
  recordId: string;
  data: any;
  timestamp: string;
  synced: boolean;
  retryCount: number;
  schoolId?: string;
  priority?: number;
  lastError?: string;
  createdAt?: string;
}

export interface SyncLog {
  id: string;
  table: string;
  recordId: string;
  direction: 'push' | 'pull';
  operation: SyncOperation;
  status: 'success' | 'conflict' | 'failed';
  localData?: any;
  remoteData?: any;
  resolvedWith?: 'local' | 'remote' | 'merged';
  details?: string;
  createdAt: string;
}

export interface SyncMeta {
  id: string;
  tableName: string;
  lastSyncedAt?: string;
  lastSyncedId?: string;
  pendingCount: number;
  updatedAt: string;
}

export interface SyncConfig {
  schoolId: string;
  supabaseUrl: string;
  supabaseKey: string;
  enabled: boolean;
  autoSyncInterval: number;
  syncOnStartup: boolean;
  syncOnReconnect: boolean;
  conflictResolution: 'last_write_wins' | 'local_wins' | 'remote_wins' | 'manual';
  lastSyncedAt?: string;
  isOnline: boolean;
}

export interface SyncStats {
  pendingItems: number;
  failedItems: number;
  conflicts: number;
  lastSyncAt?: string;
  isOnline: boolean;
  isSyncing: boolean;
}

export const SYNC_TABLES = [
  'students',
  'staff',
  'classes',
  'subjects',
  'attendance',
  'fees',
  'feeStructures',
  'payments',
  'announcements',
  'notifications',
  'exams',
  'examResults',
  'timetable',
  'transportRoutes',
  'transportAssignments',
  'salaryPayments',
] as const;

export interface Exam {
  id: string;
  name: string;
  classId: string;
  term: string;
  year: string;
  startDate: string;
  endDate: string;
  createdAt: string;
  syncedAt?: string;
}

export interface ExamResult {
  id: string;
  examId: string;
  studentId: string;
  subjectId: string;
  score: number;
  maxScore: number;
  createdAt: string;
  syncedAt?: string;
}

export interface TimetableEntry {
  id: string;
  classId: string;
  dayOfWeek: number;
  period: number;
  subjectId: string;
  startTime: string;
  endTime: string;
  createdAt: string;
  syncedAt?: string;
}

export interface TransportRoute {
  id: string;
  name: string;
  description?: string;
  fee: number;
  createdAt: string;
  syncedAt?: string;
}

export interface TransportAssignment {
  id: string;
  studentId: string;
  routeId: string;
  pickupTime?: string;
  dropTime?: string;
  createdAt: string;
  syncedAt?: string;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Dashboard Stats
export interface DashboardStats {
  totalStudents: number;
  totalStaff: number;
  feesCollected: number;
  feesPending: number;
  attendanceToday: {
    present: number;
    absent: number;
    late: number;
  };
}

// Auth Types
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: UserRole;
}

export interface AuthResponse {
  token: string;
  user: Omit<User, 'passwordHash'>;
}
