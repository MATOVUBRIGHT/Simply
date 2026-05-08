export declare enum UserRole {
    ADMIN = "admin",
    TEACHER = "teacher",
    ACCOUNTANT = "accountant",
    PARENT = "parent"
}
export declare enum EntityType {
    STUDENT = "student",
    STAFF = "staff"
}
export declare enum AttendanceStatus {
    PRESENT = "present",
    ABSENT = "absent",
    LATE = "late",
    EXCUSED = "excused"
}
export declare enum Gender {
    MALE = "male",
    FEMALE = "female",
    OTHER = "other"
}
export declare enum PaymentStatus {
    PAID = "paid",
    PENDING = "pending",
    PARTIAL = "partial",
    OVERDUE = "overdue"
}
export declare enum PaymentMethod {
    CASH = "cash",
    BANK_TRANSFER = "bank_transfer",
    CARD = "card",
    OTHER = "other"
}
export declare enum StaffRole {
    TEACHER = "teacher",
    DIRECTOR = "director",
    BURSAR = "bursar",
    ADMIN = "admin",
    SUPPORT = "support"
}
export declare enum Priority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    URGENT = "urgent"
}
export declare enum SyncOperation {
    CREATE = "create",
    UPDATE = "update",
    DELETE = "delete"
}
export declare const TABLES: {
    readonly USERS: "users";
    readonly STUDENTS: "students";
    readonly STAFF: "staff";
    readonly CLASSES: "classes";
    readonly SUBJECTS: "subjects";
    readonly ATTENDANCE: "attendance";
    readonly FEES: "fees";
    readonly PAYMENTS: "payments";
    readonly ANNOUNCEMENTS: "announcements";
    readonly SETTINGS: "settings";
    readonly SYNC_QUEUE: "sync_queue";
    readonly EXAMS: "exams";
    readonly EXAM_RESULTS: "exam_results";
    readonly TIMETABLE: "timetable";
    readonly TRANSPORT_ROUTES: "transport_routes";
    readonly TRANSPORT_ASSIGNMENTS: "transport_assignments";
};
export declare const DEFAULT_SETTINGS: {
    schoolName: string;
    schoolAddress: string;
    schoolPhone: string;
    schoolEmail: string;
    currentAcademicYear: string;
    currentTerm: string;
    termDates: {
        '1': {
            start: string;
            end: string;
        };
        '2': {
            start: string;
            end: string;
        };
        '3': {
            start: string;
            end: string;
        };
    };
    theme: string;
    primaryColor: string;
    shifts: string[];
};
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
    tuitionFee?: number;
    boardingFee?: number;
    requirements?: string[];
    completedYear?: number;
    completedTerm?: string;
    customFields?: {
        id: string;
        label: string;
        value: string;
    }[];
    attachments?: {
        id: string;
        name: string;
        file: string;
        type: string;
    }[];
    createdAt: string;
    updatedAt: string;
    syncedAt?: string;
}
export interface Staff {
    id: string;
    userId?: string;
    schoolId?: string;
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
export declare enum FeeCategory {
    TUITION = "tuition",
    BOARDING = "boarding",
    EXAM = "exam",
    REGISTRATION = "registration",
    UNIFORM = "uniform",
    BOOKS = "books",
    TRANSPORT = "transport",
    ACTIVITY = "activity",
    OTHER = "other"
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
}
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
//# sourceMappingURL=index.d.ts.map