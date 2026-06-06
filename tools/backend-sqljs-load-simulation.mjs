import initSqlJs from 'sql.js';
import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHOOLS = Number(process.env.SCHOFY_TEST_SCHOOLS || 100);
const STUDENTS_PER_SCHOOL = Number(process.env.SCHOFY_TEST_STUDENTS || 5000);
const STAFF_PER_SCHOOL = Number(process.env.SCHOFY_TEST_STAFF || 500);
const QUERY_SAMPLE_SCHOOLS = Number(process.env.SCHOFY_TEST_QUERY_SCHOOLS || 100);

function now() {
  return performance.now();
}

function ms(start) {
  return performance.now() - start;
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] || 0;
}

function mb(bytes) {
  return bytes / 1024 / 1024;
}

function memory() {
  const mem = process.memoryUsage();
  return {
    heapUsedMb: mb(mem.heapUsed),
    heapTotalMb: mb(mem.heapTotal),
    rssMb: mb(mem.rss),
  };
}

function runSelect(db, sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

const started = now();
const SQL = await initSqlJs();
const db = new SQL.Database();

db.run(`
  PRAGMA journal_mode = OFF;
  PRAGMA synchronous = OFF;
  CREATE TABLE schools (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );
  CREATE TABLE students (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    student_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    class_name TEXT NOT NULL,
    status TEXT NOT NULL,
    search_text TEXT NOT NULL
  );
  CREATE TABLE staff (
    id TEXT PRIMARY KEY,
    school_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    search_text TEXT NOT NULL
  );
  CREATE INDEX idx_students_school ON students(school_id);
  CREATE INDEX idx_students_school_status ON students(school_id, status);
  CREATE INDEX idx_staff_school ON staff(school_id);
  CREATE INDEX idx_staff_school_status ON staff(school_id, status);
`);

const seedStart = now();
db.run('BEGIN TRANSACTION');

const schoolStmt = db.prepare('INSERT INTO schools (id, name) VALUES (?, ?)');
const studentStmt = db.prepare(`
  INSERT INTO students (id, school_id, student_id, first_name, last_name, class_name, status, search_text)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);
const staffStmt = db.prepare(`
  INSERT INTO staff (id, school_id, employee_id, first_name, last_name, role, status, search_text)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

for (let schoolIndex = 1; schoolIndex <= SCHOOLS; schoolIndex += 1) {
  const schoolId = `school-${schoolIndex}`;
  schoolStmt.run([schoolId, `School ${schoolIndex}`]);

  for (let index = 1; index <= STUDENTS_PER_SCHOOL; index += 1) {
    const studentId = `S${String(schoolIndex).padStart(3, '0')}${String(index).padStart(5, '0')}`;
    const firstName = `Student${index}`;
    const lastName = `School${schoolIndex}`;
    const className = `Class ${(index % 12) + 1}`;
    const status = index % 31 === 0 ? 'inactive' : 'active';
    studentStmt.run([
      `sch-${schoolIndex}-stu-${index}`,
      schoolId,
      studentId,
      firstName,
      lastName,
      className,
      status,
      `${firstName} ${lastName} ${studentId} ${className} guardian ${index}`.toLowerCase(),
    ]);
  }

  for (let index = 1; index <= STAFF_PER_SCHOOL; index += 1) {
    const employeeId = `T${String(schoolIndex).padStart(3, '0')}${String(index).padStart(4, '0')}`;
    const firstName = `Staff${index}`;
    const lastName = `School${schoolIndex}`;
    const role = index % 5 === 0 ? 'accountant' : index % 3 === 0 ? 'administrator' : 'teacher';
    const status = index % 29 === 0 ? 'inactive' : 'active';
    staffStmt.run([
      `sch-${schoolIndex}-staff-${index}`,
      schoolId,
      employeeId,
      firstName,
      lastName,
      role,
      status,
      `${firstName} ${lastName} ${employeeId} ${role} subject ${(index % 20) + 1}`.toLowerCase(),
    ]);
  }
}

schoolStmt.free();
studentStmt.free();
staffStmt.free();
db.run('COMMIT');
const seedMs = ms(seedStart);

const queryTimes = [];
const searchTimes = [];
const countTimes = [];

for (let schoolIndex = 1; schoolIndex <= Math.min(SCHOOLS, QUERY_SAMPLE_SCHOOLS); schoolIndex += 1) {
  const schoolId = `school-${schoolIndex}`;
  let start = now();
  runSelect(db, 'SELECT COUNT(*) total, SUM(status = "active") active FROM students WHERE school_id = ?', [schoolId]);
  countTimes.push(ms(start));

  start = now();
  runSelect(db, 'SELECT id, student_id, first_name, last_name, class_name, status FROM students WHERE school_id = ? ORDER BY first_name, student_id LIMIT 120', [schoolId]);
  queryTimes.push(ms(start));

  start = now();
  runSelect(db, 'SELECT id, employee_id, first_name, last_name, role, status FROM staff WHERE school_id = ? ORDER BY first_name, employee_id LIMIT 120', [schoolId]);
  queryTimes.push(ms(start));

  start = now();
  runSelect(db, 'SELECT id, student_id, first_name, last_name FROM students WHERE school_id = ? AND search_text LIKE ? LIMIT 120', [schoolId, `%student1 school${schoolIndex}%`]);
  searchTimes.push(ms(start));

  start = now();
  runSelect(db, 'SELECT id, employee_id, first_name, last_name FROM staff WHERE school_id = ? AND search_text LIKE ? LIMIT 120', [schoolId, '%teacher%']);
  searchTimes.push(ms(start));
}

const exportStart = now();
const exported = db.export();
const exportMs = ms(exportStart);

const summary = {
  config: {
    schools: SCHOOLS,
    studentsPerSchool: STUDENTS_PER_SCHOOL,
    staffPerSchool: STAFF_PER_SCHOOL,
    totalStudents: SCHOOLS * STUDENTS_PER_SCHOOL,
    totalStaff: SCHOOLS * STAFF_PER_SCHOOL,
    totalPeopleRecords: SCHOOLS * (STUDENTS_PER_SCHOOL + STAFF_PER_SCHOOL),
  },
  seedMs,
  totalMs: ms(started),
  queryMs: {
    countAvg: countTimes.reduce((sum, value) => sum + value, 0) / countTimes.length,
    countP95: percentile(countTimes, 95),
    pageAvg: queryTimes.reduce((sum, value) => sum + value, 0) / queryTimes.length,
    pageP95: percentile(queryTimes, 95),
    searchAvg: searchTimes.reduce((sum, value) => sum + value, 0) / searchTimes.length,
    searchP95: percentile(searchTimes, 95),
  },
  databaseSizeMb: mb(exported.byteLength),
  memory: memory(),
};

const reportPath = join(process.cwd(), 'LOAD_TEST_BACKEND_SQLJS_100_SCHOOLS.md');
writeFileSync(reportPath, [
  '# Schofy Backend SQL.js Capacity Simulation',
  '',
  `Run date: ${new Date().toISOString()}`,
  '',
  `- Schools: ${summary.config.schools}`,
  `- Students: ${summary.config.totalStudents.toLocaleString()}`,
  `- Staff: ${summary.config.totalStaff.toLocaleString()}`,
  `- Total records: ${summary.config.totalPeopleRecords.toLocaleString()}`,
  `- Seed/insert time: ${summary.seedMs.toFixed(2)}ms`,
  `- Total time: ${summary.totalMs.toFixed(2)}ms`,
  `- Exported SQL.js DB size: ${summary.databaseSizeMb.toFixed(2)}MB`,
  `- Page query avg/P95: ${summary.queryMs.pageAvg.toFixed(2)}ms / ${summary.queryMs.pageP95.toFixed(2)}ms`,
  `- Count query avg/P95: ${summary.queryMs.countAvg.toFixed(2)}ms / ${summary.queryMs.countP95.toFixed(2)}ms`,
  `- Search query avg/P95: ${summary.queryMs.searchAvg.toFixed(2)}ms / ${summary.queryMs.searchP95.toFixed(2)}ms`,
  '',
  '```json',
  JSON.stringify(summary, null, 2),
  '```',
  '',
].join('\n'));

db.close();

console.log(JSON.stringify({ reportPath, ...summary }, null, 2));
