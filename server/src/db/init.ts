import initSqlJs, { Database } from 'sql.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(__dirname, '../../database.sqlite');

let db: Database;

export async function initDatabase() {
  const SQL = await initSqlJs();

  if (existsSync(DB_PATH)) {
    const buffer = readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.run(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA temp_store = MEMORY;
    PRAGMA cache_size = -64000;
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      admission_no TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      dob TEXT,
      gender TEXT,
      class_id TEXT,
      stream_id TEXT,
      address TEXT,
      guardian_name TEXT,
      guardian_phone TEXT,
      guardian_email TEXT,
      medical_info TEXT,
      photo_url TEXT,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      employee_id TEXT UNIQUE NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      role TEXT NOT NULL,
      department TEXT,
      dob TEXT,
      address TEXT,
      phone TEXT,
      email TEXT,
      photo_url TEXT,
      salary REAL,
      status TEXT DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL,
      stream TEXT,
      capacity INTEGER DEFAULT 40,
      class_teacher_id TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      class_id TEXT,
      teacher_id TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      remarks TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fees (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      class_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      term TEXT NOT NULL,
      year TEXT NOT NULL,
      due_date TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      fee_id TEXT,
      student_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT,
      reference TEXT,
      date TEXT NOT NULL,
      received_by TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS academic_year_archives (
      id TEXT PRIMARY KEY,
      academic_year TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'open',
      archived_at TEXT,
      restored_at TEXT,
      record_counts TEXT DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS attendance_archive (
      id TEXT PRIMARY KEY,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL,
      remarks TEXT,
      academic_year TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS fees_archive (
      id TEXT PRIMARY KEY,
      student_id TEXT,
      class_id TEXT,
      description TEXT NOT NULL,
      amount REAL NOT NULL,
      term TEXT NOT NULL,
      year TEXT NOT NULL,
      due_date TEXT,
      archived_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS payments_archive (
      id TEXT PRIMARY KEY,
      fee_id TEXT,
      student_id TEXT NOT NULL,
      amount REAL NOT NULL,
      method TEXT,
      reference TEXT,
      date TEXT NOT NULL,
      received_by TEXT,
      academic_year TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS announcements (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT,
      priority TEXT DEFAULT 'medium',
      created_by TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      value TEXT,
      updated_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      class_id TEXT,
      term TEXT NOT NULL,
      year TEXT NOT NULL,
      start_date TEXT,
      end_date TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      exam_id TEXT NOT NULL,
      student_id TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      score REAL NOT NULL,
      max_score REAL DEFAULT 100,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS timetable (
      id TEXT PRIMARY KEY,
      class_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject_id TEXT,
      start_time TEXT,
      end_time TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transport_routes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      fee REAL DEFAULT 0,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS transport_assignments (
      id TEXT PRIMARY KEY,
      student_id TEXT NOT NULL,
      route_id TEXT NOT NULL,
      pickup_time TEXT,
      drop_time TEXT,
      created_at TEXT NOT NULL,
      synced_at TEXT
    )
  `);

  applyPerformanceOptimizations();
  saveDatabase();
  console.log('Database initialized');
}

function applyPerformanceOptimizations() {
  const schemaUpgrades = [
    'ALTER TABLE students ADD COLUMN student_id TEXT',
    'ALTER TABLE students ADD COLUMN school_id TEXT',
    'ALTER TABLE students ADD COLUMN boarding_status TEXT',
    'ALTER TABLE students ADD COLUMN completed_year INTEGER',
    'ALTER TABLE students ADD COLUMN completed_term TEXT',
    'ALTER TABLE fees ADD COLUMN status TEXT DEFAULT "pending"',
    'ALTER TABLE staff ADD COLUMN school_id TEXT',
    'ALTER TABLE classes ADD COLUMN school_id TEXT',
    'ALTER TABLE attendance ADD COLUMN school_id TEXT',
    'ALTER TABLE payments ADD COLUMN school_id TEXT',
  ];

  for (const statement of schemaUpgrades) {
    try {
      db.run(statement);
    } catch {
      // Column already exists on upgraded databases.
    }
  }

  const statements = [
    'CREATE INDEX IF NOT EXISTS idx_students_student_id ON students(student_id)',
    'CREATE INDEX IF NOT EXISTS idx_students_admission_no ON students(admission_no)',
    'CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id)',
    'CREATE INDEX IF NOT EXISTS idx_students_status_class ON students(status, class_id)',
    'CREATE INDEX IF NOT EXISTS idx_students_guardian_phone ON students(guardian_phone)',
    'CREATE INDEX IF NOT EXISTS idx_students_created_at_id ON students(created_at DESC, id DESC)',
    'CREATE INDEX IF NOT EXISTS idx_staff_employee_id ON staff(employee_id)',
    'CREATE INDEX IF NOT EXISTS idx_staff_role ON staff(role)',
    'CREATE INDEX IF NOT EXISTS idx_staff_status ON staff(status)',
    'CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON classes(class_teacher_id)',
    'CREATE INDEX IF NOT EXISTS idx_subjects_teacher_id ON subjects(teacher_id)',
    'CREATE INDEX IF NOT EXISTS idx_subjects_class_teacher ON subjects(class_id, teacher_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_entity_date ON attendance(entity_type, entity_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_date_entity ON attendance(date, entity_type, entity_id)',
    'CREATE INDEX IF NOT EXISTS idx_fees_student_term_year ON fees(student_id, term, year)',
    'CREATE INDEX IF NOT EXISTS idx_fees_class_term_year ON fees(class_id, term, year)',
    'CREATE INDEX IF NOT EXISTS idx_fees_year_term ON fees(year, term)',
    'CREATE INDEX IF NOT EXISTS idx_payments_student_date ON payments(student_id, date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_payments_fee_id ON payments(fee_id)',
    'CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(date DESC)',
    'CREATE INDEX IF NOT EXISTS idx_exams_class_term_year ON exams(class_id, term, year)',
    'CREATE INDEX IF NOT EXISTS idx_exam_results_student_exam ON exam_results(student_id, exam_id)',
    'CREATE INDEX IF NOT EXISTS idx_exam_results_exam_subject ON exam_results(exam_id, subject_id)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_archive_year_date ON attendance_archive(academic_year, date)',
    'CREATE INDEX IF NOT EXISTS idx_attendance_archive_entity_date ON attendance_archive(entity_type, entity_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_fees_archive_year_term ON fees_archive(year, term)',
    'CREATE INDEX IF NOT EXISTS idx_fees_archive_student_year ON fees_archive(student_id, year)',
    'CREATE INDEX IF NOT EXISTS idx_payments_archive_year_date ON payments_archive(academic_year, date)',
    'CREATE INDEX IF NOT EXISTS idx_payments_archive_student_date ON payments_archive(student_id, date)',
  ];

  for (const statement of statements) db.run(statement);

  try {
    db.run(`
      CREATE VIRTUAL TABLE IF NOT EXISTS students_fts USING fts5(
        id UNINDEXED,
        first_name,
        last_name,
        admission_no,
        student_id,
        guardian_phone,
        guardian_name,
        content='students',
        content_rowid='rowid'
      )
    `);
    db.run(`
      INSERT INTO students_fts(rowid, id, first_name, last_name, admission_no, student_id, guardian_phone, guardian_name)
      SELECT rowid, id, first_name, last_name, admission_no, COALESCE(student_id, ''), COALESCE(guardian_phone, ''), COALESCE(guardian_name, '')
      FROM students
      WHERE rowid NOT IN (SELECT rowid FROM students_fts)
    `);
  } catch {
    // Older SQLite builds may omit FTS5. B-tree indexes above still keep core lookups fast.
  }

  db.run('ANALYZE');
}

export function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

export function getDatabase() {
  return db;
}

