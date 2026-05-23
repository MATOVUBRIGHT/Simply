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

  saveDatabase();
  console.log('Database initialized');
}

export function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(DB_PATH, buffer);
}

export function getDatabase() {
  return db;
}

