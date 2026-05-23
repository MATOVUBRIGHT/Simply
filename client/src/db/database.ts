import Dexie, { Table } from 'dexie';
import {
  Student,
  Staff,
  Class,
  Subject,
  Attendance,
  Fee,
  FeeStructure,
  Payment,
  Announcement,
  User,
  SyncQueueItem,
  Exam,
  ExamResult,
  TimetableEntry,
  TransportRoute,
  TransportAssignment,
  Notification,
  SalaryPayment
} from '@schofy/shared';

interface Bursary {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  isFull?: boolean;
  term: string;
  year: string;
  createdAt: string;
}

interface Discount {
  id: string;
  studentId?: string;
  studentName?: string;
  classId?: string;
  className?: string;
  amount: number;
  type: 'fixed' | 'percentage';
  term: string;
  year: string;
  createdAt: string;
}

interface SyncLog {
  id: string;
  table: string;
  recordId: string;
  direction: 'push' | 'pull';
  operation: 'create' | 'update' | 'delete';
  status: 'success' | 'conflict' | 'failed';
  localData?: any;
  remoteData?: any;
  resolvedWith?: 'local' | 'remote' | 'merged';
  details?: string;
  createdAt: string;
}

interface SyncMeta {
  id: string;
  tableName: string;
  lastSyncedAt?: string;
  lastSyncedId?: string;
  pendingCount: number;
  updatedAt: string;
}

interface School {
  id: string;
  name: string;
  supabaseId?: string;
  settings: any;
  plan: string;
  maxStudents: number;
  maxStaff: number;
  createdAt: string;
  updatedAt: string;
}

interface Invoice {
  id: string;
  studentId: string;
  description: string;
  amount: number;
  amountPaid: number;
  term: string;
  year: string;
  status: 'pending' | 'paid' | 'partial';
  dueDate?: string;
  issuedAt: string;
  paidAt?: string;
  createdAt: string;
}

export class SchofyDB extends Dexie {
  schools!: Table<School>;
  users!: Table<User>;
  students!: Table<Student>;
  staff!: Table<Staff>;
  classes!: Table<Class>;
  subjects!: Table<Subject>;
  attendance!: Table<Attendance>;
  fees!: Table<Fee>;
  feeStructures!: Table<FeeStructure>;
  bursaries!: Table<Bursary>;
  discounts!: Table<Discount>;
  payments!: Table<Payment>;
  invoices!: Table<Invoice>;
  announcements!: Table<Announcement>;
  syncQueue!: Table<SyncQueueItem>;
  syncLogs!: Table<SyncLog>;
  syncMeta!: Table<SyncMeta>;
  exams!: Table<Exam>;
  examResults!: Table<ExamResult>;
  timetable!: Table<TimetableEntry>;
  transportRoutes!: Table<TransportRoute>;
  transportAssignments!: Table<TransportAssignment>;
  settings!: Table<{ id: string; key: string; value: any }>;
  notifications!: Table<Notification>;
  salaryPayments!: Table<SalaryPayment>;

  constructor() {
    super('SchofyDB');

    this.version(1).stores({
      schools: 'id, name',
      users: 'id, email, role',
      students: 'id, admissionNo, classId, firstName, lastName, status',
      staff: 'id, employeeId, role, firstName, lastName, status',
      classes: 'id, name, level',
      subjects: 'id, classId, name',
      attendance: 'id, entityType, entityId, date',
      fees: 'id, studentId, classId, term, year',
      payments: 'id, feeId, studentId, date',
      announcements: 'id, priority, createdAt',
      syncQueue: 'id, table, synced, timestamp',
      exams: 'id, classId, term, year',
      examResults: 'id, examId, studentId, subjectId',
      timetable: 'id, classId, dayOfWeek, period',
      transportRoutes: 'id, name',
      transportAssignments: 'id, studentId, routeId',
      settings: 'id, key'
    });

    this.version(2).stores({
      schools: 'id, name',
      users: 'id, email, role',
      students: 'id, admissionNo, classId, firstName, lastName, status',
      staff: 'id, employeeId, role, firstName, lastName, status',
      classes: 'id, name, level',
      subjects: 'id, classId, name',
      attendance: 'id, entityType, entityId, date',
      fees: 'id, studentId, classId, term, year',
      payments: 'id, feeId, studentId, date',
      announcements: 'id, priority, createdAt',
      syncQueue: 'id, table, synced, timestamp',
      exams: 'id, classId, term, year',
      examResults: 'id, examId, studentId, subjectId',
      timetable: 'id, classId, dayOfWeek, period',
      transportRoutes: 'id, name',
      transportAssignments: 'id, studentId, routeId',
      settings: 'id, key'
    });

    this.version(3).stores({
      schools: 'id, name',
      users: 'id, email, role',
      students: 'id, admissionNo, classId, firstName, lastName, status',
      staff: 'id, employeeId, role, firstName, lastName, status',
      classes: 'id, name, level',
      subjects: 'id, classId, name',
      attendance: 'id, entityType, entityId, date',
      fees: 'id, studentId, classId, term, year',
      payments: 'id, feeId, studentId, date',
      announcements: 'id, priority, createdAt',
      syncQueue: 'id, table, synced, timestamp',
      exams: 'id, classId, term, year',
      examResults: 'id, examId, studentId, subjectId',
      timetable: 'id, classId, dayOfWeek, period',
      transportRoutes: 'id, name',
      transportAssignments: 'id, studentId, routeId',
      settings: 'id, key',
      notifications: 'id, read, createdAt, type'
    });

    this.version(4).stores({
      schools: 'id, name',
      users: 'id, email, role',
      students: 'id, admissionNo, classId, firstName, lastName, status',
      staff: 'id, employeeId, role, firstName, lastName, status',
      classes: 'id, name, level',
      subjects: 'id, classId, name',
      attendance: 'id, entityType, entityId, date',
      fees: 'id, studentId, classId, term, year',
      feeStructures: 'id, classId, category, term, year',
      bursaries: 'id, studentId, term, year',
      discounts: 'id, classId, term, year',
      payments: 'id, feeId, studentId, date',
      announcements: 'id, priority, createdAt',
      syncQueue: 'id, table, synced, timestamp',
      exams: 'id, classId, term, year',
      examResults: 'id, examId, studentId, subjectId',
      timetable: 'id, classId, dayOfWeek, period',
      transportRoutes: 'id, name',
      transportAssignments: 'id, studentId, routeId',
      settings: 'id, key',
      notifications: 'id, read, createdAt, type'
    });

    this.version(5).stores({
      schools: 'id, name',
      users: 'id, email, role',
      students: 'id, admissionNo, classId, firstName, lastName, status',
      staff: 'id, employeeId, role, firstName, lastName, status',
      classes: 'id, name, level',
      subjects: 'id, classId, name',
      attendance: 'id, entityType, entityId, date',
      fees: 'id, studentId, classId, term, year',
      feeStructures: 'id, classId, category, term, year',
      bursaries: 'id, studentId, term, year',
      discounts: 'id, classId, term, year',
      payments: 'id, feeId, studentId, date',
      announcements: 'id, priority, createdAt',
      syncQueue: 'id, table, synced, timestamp',
      exams: 'id, classId, term, year',
      examResults: 'id, examId, studentId, subjectId',
      timetable: 'id, classId, dayOfWeek, period',
      transportRoutes: 'id, name',
      transportAssignments: 'id, studentId, routeId',
      settings: 'id, key',
      notifications: 'id, read, createdAt, type',
      salaryPayments: 'id, staffId, month, year, status'
    });

    this.version(7).stores({
      schools: 'id, name',
      users: 'id, email, role, schoolId',
      students: 'id, admissionNo, classId, firstName, lastName, status, schoolId',
      staff: 'id, employeeId, role, firstName, lastName, status, schoolId',
      classes: 'id, name, level, schoolId',
      subjects: 'id, classId, name, schoolId',
      attendance: 'id, entityType, entityId, date, schoolId',
      fees: 'id, studentId, classId, term, year, schoolId',
      feeStructures: 'id, classId, category, term, year, schoolId',
      bursaries: 'id, studentId, term, year, schoolId',
      discounts: 'id, classId, term, year, schoolId',
      payments: 'id, feeId, studentId, date, schoolId',
      invoices: 'id, studentId, status, term, year, schoolId',
      announcements: 'id, priority, createdAt, schoolId',
      syncQueue: 'id, table, synced, timestamp',
      syncLogs: 'id, table, status, createdAt',
      syncMeta: 'id, tableName',
      exams: 'id, classId, term, year, schoolId',
      examResults: 'id, examId, studentId, subjectId, schoolId',
      timetable: 'id, classId, dayOfWeek, period, schoolId',
      transportRoutes: 'id, name, schoolId',
      transportAssignments: 'id, studentId, routeId, schoolId',
      settings: 'id, key',
      notifications: 'id, read, createdAt, type, schoolId',
      salaryPayments: 'id, staffId, month, year, status, schoolId'
    });

    this.version(8).stores({
      schools: 'id, name',
      users: 'id, email, role, schoolId',
      students: 'id, admissionNo, classId, firstName, lastName, status, boardingStatus, schoolId',
      staff: 'id, employeeId, role, firstName, lastName, status, schoolId',
      classes: 'id, name, level, schoolId',
      subjects: 'id, classId, name, schoolId',
      attendance: 'id, entityType, entityId, date, schoolId',
      fees: 'id, studentId, classId, term, year, schoolId',
      feeStructures: 'id, classId, category, term, year, schoolId',
      bursaries: 'id, studentId, term, year, schoolId',
      discounts: 'id, classId, studentId, term, year, schoolId',
      payments: 'id, feeId, studentId, date, schoolId',
      invoices: 'id, studentId, status, term, year, schoolId',
      announcements: 'id, priority, createdAt, schoolId',
      syncQueue: 'id, table, synced, timestamp',
      syncLogs: 'id, table, status, createdAt',
      syncMeta: 'id, tableName',
      exams: 'id, classId, term, year, schoolId',
      examResults: 'id, examId, studentId, subjectId, schoolId',
      timetable: 'id, classId, dayOfWeek, period, schoolId',
      transportRoutes: 'id, name, schoolId',
      transportAssignments: 'id, studentId, routeId, schoolId',
      settings: 'id, key',
      notifications: 'id, read, createdAt, type, schoolId',
      salaryPayments: 'id, staffId, month, year, status, schoolId'
    });
  }
}

export const db = new SchofyDB();

export async function initializeDatabase() {
  try {
    await db.open();
    console.log('Database opened successfully');
  } catch (error) {
    console.error('Failed to open database:', error);
    throw error;
  }
}

export async function clearAllData() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) {
      await table.clear();
    }
  });
}

export async function getCurrentSchoolId(): Promise<string> {
  const school = await db.schools.toCollection().first();
  return school?.id || 'default';
}

export async function setCurrentSchool(school: School) {
  const existing = await db.schools.get(school.id);
  if (existing) {
    await db.schools.put(school);
  } else {
    await db.schools.add(school);
  }
}
