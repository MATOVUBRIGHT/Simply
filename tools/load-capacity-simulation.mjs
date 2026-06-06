import { performance } from 'node:perf_hooks';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const SCHOOLS = Number(process.env.SCHOFY_TEST_SCHOOLS || 100);
const STUDENTS_PER_SCHOOL = Number(process.env.SCHOFY_TEST_STUDENTS || 5000);
const STAFF_PER_SCHOOL = Number(process.env.SCHOFY_TEST_STAFF || 500);
const PAGE_SIZE_STUDENTS = Number(process.env.SCHOFY_TEST_STUDENT_PAGE || 120);
const PAGE_SIZE_STAFF = Number(process.env.SCHOFY_TEST_STAFF_PAGE || 120);
const SEARCHES_PER_SCHOOL = Number(process.env.SCHOFY_TEST_SEARCHES || 4);

function now() {
  return performance.now();
}

function elapsed(start) {
  return now() - start;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

function bytesToMb(bytes) {
  return bytes / 1024 / 1024;
}

function formatMs(value) {
  return `${value.toFixed(2)}ms`;
}

function formatMb(value) {
  return `${value.toFixed(2)}MB`;
}

function memorySnapshot(label) {
  const mem = process.memoryUsage();
  return {
    label,
    heapUsedMb: bytesToMb(mem.heapUsed),
    heapTotalMb: bytesToMb(mem.heapTotal),
    rssMb: bytesToMb(mem.rss),
  };
}

function makeStudent(schoolIndex, index) {
  const classNo = (index % 12) + 1;
  const gender = index % 2 === 0 ? 'Male' : 'Female';
  const id = `sch-${schoolIndex}-stu-${index}`;
  const firstName = `Student${index}`;
  const lastName = `School${schoolIndex}`;
  const studentId = `S${String(schoolIndex).padStart(3, '0')}${String(index).padStart(5, '0')}`;
  return {
    id,
    schoolId: `school-${schoolIndex}`,
    firstName,
    lastName,
    studentId,
    admissionNo: studentId,
    classId: `school-${schoolIndex}-class-${classNo}`,
    className: `Class ${classNo}`,
    gender,
    status: index % 31 === 0 ? 'inactive' : 'active',
    guardianName: `Guardian ${index}`,
    guardianPhone: `07${String(70000000 + index).slice(0, 8)}`,
    email: `student${index}@school${schoolIndex}.test`,
    createdAt: new Date(2026, 0, 1, 0, 0, index % 60).toISOString(),
  };
}

function makeStaff(schoolIndex, index) {
  const role = index % 5 === 0 ? 'accountant' : index % 3 === 0 ? 'administrator' : 'teacher';
  const id = `sch-${schoolIndex}-staff-${index}`;
  const firstName = `Staff${index}`;
  const lastName = `School${schoolIndex}`;
  const employeeId = `T${String(schoolIndex).padStart(3, '0')}${String(index).padStart(4, '0')}`;
  return {
    id,
    schoolId: `school-${schoolIndex}`,
    firstName,
    lastName,
    employeeId,
    role,
    department: role === 'teacher' ? `Subject ${(index % 20) + 1}` : 'Operations',
    status: index % 29 === 0 ? 'inactive' : 'active',
    phone: `07${String(80000000 + index).slice(0, 8)}`,
    email: `staff${index}@school${schoolIndex}.test`,
    createdAt: new Date(2026, 0, 1, 0, 0, index % 60).toISOString(),
  };
}

function buildSearchText(record, fields) {
  return fields.map(field => String(record[field] || '').toLowerCase()).join(' ');
}

function createDataset() {
  const schools = new Map();
  const allStudents = [];
  const allStaff = [];

  for (let schoolIndex = 1; schoolIndex <= SCHOOLS; schoolIndex += 1) {
    const schoolId = `school-${schoolIndex}`;
    const school = {
      id: schoolId,
      students: [],
      staff: [],
      studentSearch: [],
      staffSearch: [],
    };

    for (let index = 1; index <= STUDENTS_PER_SCHOOL; index += 1) {
      const student = makeStudent(schoolIndex, index);
      school.students.push(student);
      allStudents.push(student);
    }

    for (let index = 1; index <= STAFF_PER_SCHOOL; index += 1) {
      const staff = makeStaff(schoolIndex, index);
      school.staff.push(staff);
      allStaff.push(staff);
    }

    schools.set(schoolId, school);
  }

  return { schools, allStudents, allStaff };
}

function indexDataset(dataset) {
  for (const school of dataset.schools.values()) {
    school.students.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.studentId.localeCompare(b.studentId));
    school.staff.sort((a, b) => a.firstName.localeCompare(b.firstName) || a.employeeId.localeCompare(b.employeeId));
    school.studentSearch = school.students.map(student => ({
      record: student,
      text: buildSearchText(student, ['firstName', 'lastName', 'studentId', 'admissionNo', 'className', 'guardianName', 'email']),
    }));
    school.staffSearch = school.staff.map(staff => ({
      record: staff,
      text: buildSearchText(staff, ['firstName', 'lastName', 'employeeId', 'role', 'department', 'email']),
    }));
  }
}

function simulateSchoolPageLoad(school) {
  const start = now();
  const studentSummary = {
    total: school.students.length,
    active: school.students.filter(student => student.status === 'active').length,
    firstPage: school.students.slice(0, PAGE_SIZE_STUDENTS),
  };
  const staffSummary = {
    total: school.staff.length,
    active: school.staff.filter(staff => staff.status === 'active').length,
    firstPage: school.staff.slice(0, PAGE_SIZE_STAFF),
  };
  return { duration: elapsed(start), studentSummary, staffSummary };
}

function simulateProgressiveList(totalItems, pageSize) {
  const start = now();
  let visible = 0;
  let pages = 0;
  while (visible < totalItems) {
    visible = Math.min(totalItems, visible + pageSize);
    pages += 1;
  }
  return { duration: elapsed(start), pages };
}

function simulateSearch(index, query) {
  const start = now();
  const q = query.toLowerCase();
  const results = [];
  for (const item of index) {
    if (item.text.includes(q)) results.push(item.record);
  }
  return { duration: elapsed(start), count: results.length };
}

function simulateBackendBatches(totalRecords) {
  const start = now();
  const batchSize = 1000;
  const batches = Math.ceil(totalRecords / batchSize);
  const estimatedPayloadMb = (totalRecords * 850) / 1024 / 1024;
  const retryQueueEntries = batches;
  return { duration: elapsed(start), batchSize, batches, estimatedPayloadMb, retryQueueEntries };
}

const started = now();
const memory = [memorySnapshot('start')];
const datasetStart = now();
const dataset = createDataset();
const datasetMs = elapsed(datasetStart);
memory.push(memorySnapshot('after data generation'));

const indexStart = now();
indexDataset(dataset);
const indexMs = elapsed(indexStart);
memory.push(memorySnapshot('after indexing'));

const pageLoadTimes = [];
const studentSearchTimes = [];
const staffSearchTimes = [];
let studentSearchHits = 0;
let staffSearchHits = 0;

for (const [schoolId, school] of dataset.schools) {
  const pageLoad = simulateSchoolPageLoad(school);
  pageLoadTimes.push(pageLoad.duration);

  const schoolNumber = Number(schoolId.replace('school-', ''));
  const studentQueries = [
    `student1 school${schoolNumber}`,
    `s${String(schoolNumber).padStart(3, '0')}00050`,
    `class 6`,
    `guardian 200`,
  ].slice(0, SEARCHES_PER_SCHOOL);
  const staffQueries = [
    `staff1 school${schoolNumber}`,
    `teacher`,
    `subject 8`,
    `accountant`,
  ].slice(0, SEARCHES_PER_SCHOOL);

  for (const query of studentQueries) {
    const result = simulateSearch(school.studentSearch, query);
    studentSearchTimes.push(result.duration);
    studentSearchHits += result.count;
  }
  for (const query of staffQueries) {
    const result = simulateSearch(school.staffSearch, query);
    staffSearchTimes.push(result.duration);
    staffSearchHits += result.count;
  }
}

const studentLongPage = simulateProgressiveList(STUDENTS_PER_SCHOOL, PAGE_SIZE_STUDENTS);
const staffLongPage = simulateProgressiveList(STAFF_PER_SCHOOL, PAGE_SIZE_STAFF);
const backend = simulateBackendBatches(SCHOOLS * (STUDENTS_PER_SCHOOL + STAFF_PER_SCHOOL));
const totalMs = elapsed(started);
memory.push(memorySnapshot('end'));

const summary = {
  config: {
    schools: SCHOOLS,
    studentsPerSchool: STUDENTS_PER_SCHOOL,
    staffPerSchool: STAFF_PER_SCHOOL,
    totalStudents: SCHOOLS * STUDENTS_PER_SCHOOL,
    totalStaff: SCHOOLS * STAFF_PER_SCHOOL,
    totalPeopleRecords: SCHOOLS * (STUDENTS_PER_SCHOOL + STAFF_PER_SCHOOL),
  },
  timings: {
    datasetGenerationMs: datasetMs,
    indexingMs: indexMs,
    totalMs,
    pageLoad: {
      avgMs: pageLoadTimes.reduce((sum, value) => sum + value, 0) / pageLoadTimes.length,
      p95Ms: percentile(pageLoadTimes, 95),
      maxMs: Math.max(...pageLoadTimes),
    },
    studentSearch: {
      avgMs: studentSearchTimes.reduce((sum, value) => sum + value, 0) / studentSearchTimes.length,
      p95Ms: percentile(studentSearchTimes, 95),
      maxMs: Math.max(...studentSearchTimes),
      totalHits: studentSearchHits,
    },
    staffSearch: {
      avgMs: staffSearchTimes.reduce((sum, value) => sum + value, 0) / staffSearchTimes.length,
      p95Ms: percentile(staffSearchTimes, 95),
      maxMs: Math.max(...staffSearchTimes),
      totalHits: staffSearchHits,
    },
    progressiveLists: {
      studentPagesToShowAll: studentLongPage.pages,
      staffPagesToShowAll: staffLongPage.pages,
      studentSimulationMs: studentLongPage.duration,
      staffSimulationMs: staffLongPage.duration,
    },
    backendBatchEstimate: backend,
  },
  memory,
};

const reportLines = [
  '# Schofy Capacity Simulation',
  '',
  `Run date: ${new Date().toISOString()}`,
  '',
  '## Scenario',
  '',
  `- Schools: ${summary.config.schools}`,
  `- Students per school: ${summary.config.studentsPerSchool}`,
  `- Staff per school: ${summary.config.staffPerSchool}`,
  `- Total students: ${summary.config.totalStudents.toLocaleString()}`,
  `- Total staff: ${summary.config.totalStaff.toLocaleString()}`,
  `- Total person records: ${summary.config.totalPeopleRecords.toLocaleString()}`,
  '',
  '## Machine Simulation Results',
  '',
  `- Dataset generation: ${formatMs(summary.timings.datasetGenerationMs)}`,
  `- Sorting/search indexing: ${formatMs(summary.timings.indexingMs)}`,
  `- Total simulation time: ${formatMs(summary.timings.totalMs)}`,
  `- Heap used at end: ${formatMb(summary.memory.at(-1).heapUsedMb)}`,
  `- RSS at end: ${formatMb(summary.memory.at(-1).rssMb)}`,
  '',
  '## Per-School Page Handling',
  '',
  `- Average school page load computation: ${formatMs(summary.timings.pageLoad.avgMs)}`,
  `- P95 school page load computation: ${formatMs(summary.timings.pageLoad.p95Ms)}`,
  `- Max school page load computation: ${formatMs(summary.timings.pageLoad.maxMs)}`,
  `- Students page: ${summary.timings.progressiveLists.studentPagesToShowAll} progressive chunks of ${PAGE_SIZE_STUDENTS} rows to reveal all ${STUDENTS_PER_SCHOOL.toLocaleString()} students.`,
  `- Staff page: ${summary.timings.progressiveLists.staffPagesToShowAll} progressive chunks of ${PAGE_SIZE_STAFF} rows to reveal all ${STAFF_PER_SCHOOL.toLocaleString()} staff.`,
  '',
  '## Search / Filter Simulation',
  '',
  `- Student search average: ${formatMs(summary.timings.studentSearch.avgMs)}`,
  `- Student search P95: ${formatMs(summary.timings.studentSearch.p95Ms)}`,
  `- Student search max: ${formatMs(summary.timings.studentSearch.maxMs)}`,
  `- Staff search average: ${formatMs(summary.timings.staffSearch.avgMs)}`,
  `- Staff search P95: ${formatMs(summary.timings.staffSearch.p95Ms)}`,
  `- Staff search max: ${formatMs(summary.timings.staffSearch.maxMs)}`,
  '',
  '## Backend / Sync Estimate',
  '',
  `- Records to sync: ${summary.config.totalPeopleRecords.toLocaleString()}`,
  `- Suggested batch size: ${summary.timings.backendBatchEstimate.batchSize.toLocaleString()}`,
  `- Batches needed: ${summary.timings.backendBatchEstimate.batches.toLocaleString()}`,
  `- Estimated raw JSON payload: ${formatMb(summary.timings.backendBatchEstimate.estimatedPayloadMb)}`,
  '',
  '## Notes',
  '',
  '- This test does not write 550,000 rows to Supabase, so it avoids backend credit usage.',
  '- It measures local/offline data pressure, per-school list handling, search/filter cost, and sync batch sizing.',
  '- For production backend proof, run the same scenario against a staging Supabase project with paid quota and indexes on `school_id`, ID fields, names, class, status, and updated timestamp.',
  '',
  '```json',
  JSON.stringify(summary, null, 2),
  '```',
  '',
];

const reportPath = join(process.cwd(), 'LOAD_TEST_100_SCHOOLS_5000_STUDENTS.md');
writeFileSync(reportPath, reportLines.join('\n'));

console.log(JSON.stringify({
  reportPath,
  config: summary.config,
  pageLoad: summary.timings.pageLoad,
  studentSearch: summary.timings.studentSearch,
  staffSearch: summary.timings.staffSearch,
  progressiveLists: summary.timings.progressiveLists,
  backendBatchEstimate: summary.timings.backendBatchEstimate,
  memory: summary.memory,
}, null, 2));
