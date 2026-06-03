export type SchofyManualEntry = {
  route: string;
  title: string;
  section: string;
  keywords: string[];
  primaryButtons: string[];
  summary: string;
  steps?: string[];
};

export const schofyManualSource = {
  fileName: 'Schofy-System-Comprehensive-Manual.pdf',
  version: 'Version 1.1',
  updated: 'June 3, 2026',
};

export const schofyManualEntries: SchofyManualEntry[] = [
  {
    route: '/login',
    title: 'Authentication Core',
    section: 'System Entry & Access Controls',
    keywords: ['login', 'auth', 'admin', 'online account', 'offline account', 'remember admin', 'verification code', 'save admin', 'clear saved admin'],
    primaryButtons: ['Sign In', 'Create Account', 'Continue locally', 'Save admin', 'Clear saved admin', 'Enter verification code'],
    summary: 'The login screen verifies the main school administrator, supports online or cached local sessions, preserves saved admin sessions across refreshes, and exposes verification-code access for payment authorization.',
    steps: ['Sign in or create the school account.', 'Use Save admin only on trusted devices.', 'Use Clear saved admin when the device should require the admin password again.'],
  },
  {
    route: '/login',
    title: 'Staff Role Login and Shift Management',
    section: 'System Entry & Access Controls',
    keywords: ['staff login', 'role login', 'shift', 'teacher login', 'accountant login', 'save staff login', 'offline staff login', 'continue as admin'],
    primaryButtons: ['Continue as Admin', 'Start Shift', 'Save Login', 'Clear Saved Login'],
    summary: 'After the admin session is verified, staff can start shifts with their name and password. Saved staff credentials allow offline shifts on a device that has already validated them, while the admin session remains separate.',
    steps: ['Admin signs in first.', 'Staff enter name and password to start a shift.', 'Use Save Login for trusted offline workstations and Clear Saved Login when the device should require credentials again.'],
  },
  {
    route: '/roles',
    title: 'Roles and Access Control Matrix',
    section: 'System Entry & Access Controls',
    keywords: ['roles', 'permissions', 'access control', 'activity log', 'read only', 'staff password', 'activate staff', 'deactivate staff'],
    primaryButtons: ['Add Staff', 'Edit', 'Change Password', 'Read-only toggle', 'Activate', 'Deactivate', 'Delete'],
    summary: 'Roles & Access creates staff credentials, assigns allowed pages, applies read-only limits, activates or deactivates staff login, and keeps staff activity history.',
  },
  {
    route: '/',
    title: 'Dashboard Ecosystem',
    section: 'Overview & Diagnostics',
    keywords: ['dashboard', 'welcome', 'greeting', 'growth', 'profit', 'attendance', 'summary', 'refresh', 'dashboard cards'],
    primaryButtons: ['Refresh', 'Open linked cards'],
    summary: 'Dashboard loads from indexed local data first, shows a time-based greeting with the active user name, rotates encouragement text, and summarizes enrollment, staff, finance, class capacity, attendance, and growth.',
  },
  {
    route: '/students',
    title: 'Students Management Registry',
    section: 'People & Workflow Management',
    keywords: ['students', 'student list', 'student id', 'admission number', 'import students', 'export students', 'cleanup', 'check classes', 'class capacity'],
    primaryButtons: ['New Admission', 'Import', 'Export', 'Check Classes', 'Cleanup', 'Status filter', 'Class filter'],
    summary: 'Students is the main registry for active, deactivated, completed, and historical student cohorts. It supports searching, filtering, imports, exports, cleanup, and class-capacity checks.',
    steps: ['Use New Admission to create a student.', 'Use Import for bulk spreadsheets and preview before saving.', 'Use Check Classes to warn about capacity issues without blocking student counts.'],
  },
  {
    route: '/students/new',
    title: 'Student Admission Form',
    section: 'People & Workflow Management',
    keywords: ['new student', 'admission form', 'guardian', 'photo', 'change class', 'medical notes', 'special notes', 'over capacity'],
    primaryButtons: ['Save', 'Cancel', 'Upload photo', 'Change class'],
    summary: 'The admission form records personal information, class assignment, guardian contacts, communication channels, profile photo, medical notes, and special notes. Saving caches locally before queueing sync.',
  },
  {
    route: '/students/:id',
    title: 'Comprehensive Student Profiles',
    section: 'People & Workflow Management',
    keywords: ['student profile', 'subjects tab', 'optional subjects', 'combinations', 'ledger', 'invoice', 'record payment', 'change class', 'more records'],
    primaryButtons: ['Edit', 'Invoice', 'Ledger', 'Change Class', 'Record Payment', 'Profile tabs'],
    summary: 'Student Profile centralizes demographic details, guardian context, subjects, optional combinations, fees, payments, academic documents, ledger history, and editable extra records.',
  },
  {
    route: '/parents',
    title: 'Parents Directories and Communication',
    section: 'People & Workflow Management',
    keywords: ['parents', 'guardians', 'parent emails', 'student emails', 'class filter', 'copy emails', 'call icon', 'email icon'],
    primaryButtons: ['Class filter', 'Call icon', 'Email icon', 'Students emails', 'Copy selected', 'Copy all'],
    summary: 'Parents & Emails links guardians to students and classes, supports searches by student or guardian data, and prepares parent or student contact lists for communication.',
  },
  {
    route: '/staff',
    title: 'Teachers and Faculty Profiles',
    section: 'People & Workflow Management',
    keywords: ['staff', 'teachers', 'teacher subjects', 'payroll', 'staff profile', 'activate', 'deactivate', 'subject deduplication'],
    primaryButtons: ['Add Staff', 'Generate Payroll', 'Edit', 'Profile', 'Activate', 'Deactivate'],
    summary: 'Teachers & Staff manages staff records, subjects, payroll setup, profiles, and active status. Teacher subject lists show each subject once even when assigned across several classes.',
  },
  {
    route: '/classes',
    title: 'Classes and Capacity Architectures',
    section: 'Academics & Grading Infrastructure',
    keywords: ['classes', 'capacity', 'class details', 'assign ops', 'optional subjects', 'view all', 'fees', 'class cards'],
    primaryButtons: ['Add Class', 'Timetable', 'Import', 'Export', 'Assign OPs', 'View all'],
    summary: 'Classes & Timetables manages grade divisions, capacity, student rosters, subjects, teachers, fees, optional subjects, attendance indicators, and timetable access.',
  },
  {
    route: '/classes/timetable',
    title: 'Dynamic Timetable Engine and Collisions',
    section: 'Academics & Grading Infrastructure',
    keywords: ['timetable', 'overall timetable', 'class timetable', 'collisions', 'room', 'exam', 'custom event', 'free time', 'fullscreen'],
    primaryButtons: ['Class', 'Overall', 'Save', 'Print', 'Fullscreen', 'Minimize', 'Cell editor'],
    summary: 'Timetable builds class and overall school grids with subjects, teachers, rooms, exams, custom events, free time, print views, fullscreen editing, and collision warnings for teachers, rooms, and time windows.',
  },
  {
    route: '/subjects',
    title: 'Academic Subjects Management',
    section: 'Academics & Grading Infrastructure',
    keywords: ['subjects', 'subject code', 'alphanumeric code', 'assign teacher', 'class subject', 'optional subjects', 'delete selected class subject'],
    primaryButtons: ['Add Subject', 'Edit', 'Delete', 'Assign Teacher', 'Class filter'],
    summary: 'Subjects manages course names, alphanumeric codes, class links, optional subjects, and teacher alignment. Deleting a subject link removes it for the active class without corrupting the wider subject index.',
  },
  {
    route: '/homework-tests',
    title: 'Assignments and Progress Testing',
    section: 'Academics & Grading Infrastructure',
    keywords: ['assignments', 'homework', 'tests', 'completed', 'results', 'send email', 'class filter', 'subject filter'],
    primaryButtons: ['Add', 'Edit', 'Delete', 'Send email', 'Class filter', 'Subject filter'],
    summary: 'Assignments & Tests tracks issued work, completion, results, and email communication, with class and subject filtering.',
  },
  {
    route: '/grades',
    title: 'Exams and Grading Infrastructure',
    section: 'Academics & Grading Infrastructure',
    keywords: ['exams', 'grades', 'custom grading', 'download template', 'import marks', 'save grades', 'report cards'],
    primaryButtons: ['Add Exam', 'Download Template', 'Import Marks', 'Custom Grading', 'Save'],
    summary: 'Exams & Grades sets up assessments, downloads manual templates by term and score scale, imports marks, configures custom grading, and prepares report cards.',
  },
  {
    route: '/exam-marks',
    title: 'Exam Marks Ledger Processing',
    section: 'Academics & Grading Infrastructure',
    keywords: ['exam marks', 'marks entry', 'class filter', 'exam filter', 'print results', 'save marks'],
    primaryButtons: ['Class filter', 'Exam filter', 'Save', 'Print'],
    summary: 'Exam Marks is the spreadsheet-style screen for manually entering or reviewing student scores by class, exam, and subject.',
  },
  {
    route: '/report-card/:id',
    title: 'Interactive Report Card Templates',
    section: 'Academics & Grading Infrastructure',
    keywords: ['report card', 'template', 'live edit', 'watermark logo', 'color controls', 'save template', 'export pdf', 'print'],
    primaryButtons: ['Template left', 'Template right', 'Live Edit', 'Color controls', 'Save Template', 'Print', 'Export PDF'],
    summary: 'Report card templates let users switch layouts, live-edit boilerplate text, adjust colors, save templates by class or school type, and export or print while protected student data remains mapped from records.',
  },
  {
    route: '/attendance',
    title: 'Attendance Tracker',
    section: 'Daily Records & Cohorts',
    keywords: ['attendance', 'present', 'absent', 'late', 'mark all', 'date picker', 'class selector', 'attendance import', 'auto save'],
    primaryButtons: ['Date picker', 'Class selector', 'Mark all', 'Import', 'Save'],
    summary: 'Attendance records student or staff presence by date and class. It supports mark-all actions, spreadsheet imports, and manual or automatic saving depending on settings.',
  },
  {
    route: '/day-boarding',
    title: 'Day and Boarding Registry Split',
    section: 'Daily Records & Cohorts',
    keywords: ['day boarding', 'boarding', 'boys', 'girls', 'view all boys', 'view all girls', 'hidden lists', 'residency'],
    primaryButtons: ['View all boys', 'View all girls', 'Filter'],
    summary: 'Day & Boarding separates residency groups and gender lists. Long boys and girls lists stay hidden until opened, reducing layout work and improving scroll speed.',
  },
  {
    route: '/finance',
    title: 'Fees and Financial Ledgers',
    section: 'Finance & Ledger Operations',
    keywords: ['finance', 'fees', 'ledger', 'payments', 'opening balance', 'balance', 'bursary', 'discount', 'record payment', 'term filter'],
    primaryButtons: ['Students', 'Ledger', 'Invoices', 'Payments', 'Record Payment', 'Search', 'Print', 'Export'],
    summary: 'Fees & Finance tracks student balances, ledger streams, invoices, payments, bursaries, discounts, term and year reporting, and printable or exportable financial records.',
  },
  {
    route: '/payment-accounts',
    title: 'Payment Account Provisioning',
    section: 'Finance & Ledger Operations',
    keywords: ['payment accounts', 'bank', 'branch', 'mobile money', 'cash', 'hold account', 'invoice account details'],
    primaryButtons: ['Add Account', 'Edit', 'Hold', 'Delete', 'Save'],
    summary: 'Payment Accounts controls the bank, mobile money, and cash details that appear on invoices. Bank accounts require a branch and no phone field; mobile money uses phone details without bank fields; cash uses collection instructions.',
  },
  {
    route: '/expenses',
    title: 'Operational Expenses Engine',
    section: 'Finance & Ledger Operations',
    keywords: ['expenses', 'record expense', 'payment method', 'profit', 'net profit', 'spending'],
    primaryButtons: ['Add Expense', 'Payment method', 'Edit', 'Delete', 'Save'],
    summary: 'Expenses records school spending with category, date, amount, recorded-by, payment method, and notes, then feeds profit and reporting calculations.',
  },
  {
    route: '/invoices',
    title: 'Invoice Processing and Billing Infrastructure',
    section: 'Finance & Ledger Operations',
    keywords: ['invoices', 'invoice template', 'fee description', 'fee structure', 'bill to student', 'double click select', 'delete invoices', 'zero rows'],
    primaryButtons: ['Generate', 'Record', 'Print', 'Live Edit', 'Filters', 'Delete selected'],
    summary: 'Invoices generate fee requirements, record payments, filter by student/class/fee item, edit templates, print, and batch-delete selected invoices. Empty or zero-value rows are hidden and invoices bill the student name.',
  },
  {
    route: '/reports',
    title: 'Institutional Intelligence Reports',
    section: 'Operations, Logistics & Communication',
    keywords: ['reports', 'profit', 'expenses', 'net profit', 'amount not paid', 'print selected', 'term filter', 'year filter', 'growth'],
    primaryButtons: ['Term filter', 'Year filter', 'Print selected card', 'Export', 'Class filters'],
    summary: 'Reports combine academic, attendance, finance, expense, profit, and class data. Profit cards compare expenses with gross profits, net profits, and outstanding collection needs.',
  },
  {
    route: '/transport',
    title: 'Transport and Route Logistics',
    section: 'Operations, Logistics & Communication',
    keywords: ['transport', 'routes', 'bus', 'vehicle', 'route fees', 'student transit'],
    primaryButtons: ['Add Route', 'Edit', 'Delete', 'Save Route'],
    summary: 'Transport manages routes, vehicle assets, route fees, and student transit assignments.',
  },
  {
    route: '/announcements',
    title: 'Broadcast Announcements',
    section: 'Operations, Logistics & Communication',
    keywords: ['announcements', 'broadcast', 'notice', 'events', 'send announcement'],
    primaryButtons: ['New Announcement', 'Send', 'Edit', 'Delete'],
    summary: 'Announcements creates and manages broadcast messages and school notices for parents and faculty.',
  },
  {
    route: '/notifications',
    title: 'System and Admin Notification Centers',
    section: 'Operations, Logistics & Communication',
    keywords: ['notifications', 'broadcast', 'read receipts', 'two blue ticks', 'reply', 'attachments', 'online label'],
    primaryButtons: ['Mark read', 'Delete', 'Open attachment', 'Reply'],
    summary: 'Notifications tracks alerts, broadcasts, replies, attachments, and read states. Direct messages can show read receipts while broadcasts track tenant-wide read statistics.',
  },
  {
    route: '/plans',
    title: 'Subscription Plans and Account Verification',
    section: 'Administration & Configuration',
    keywords: ['plans', 'billing', 'verification code', 'payment code', 'whatsapp payment', 'trial', 'unlimited', 'month', 'year', 'term', 'ugx', 'expired'],
    primaryButtons: ['Choose Plan', 'Contact Us', 'Request Trial', 'Enter verification code', 'Send payment via WhatsApp', 'Verify'],
    summary: 'Plans handles subscriptions, payment submission, trial requests, WhatsApp payment routing, and verification-code checks for invalid, used, or terminated codes before routing to the dashboard.',
  },
  {
    route: '/settings',
    title: 'Global Settings and Customizations',
    section: 'Administration & Configuration',
    keywords: ['settings', 'school logo', 'upload logo', 'school type', 'school category', 'music school', 'tailoring', 'generate classes', 'theme', 'save'],
    primaryButtons: ['Save', 'Upload Logo', 'Generate Classes', 'Confirm', 'Theme controls'],
    summary: 'Settings configures school identity, logo, currency, term/year, theme, school type, optional category tracks, and class generation. Changing organization profile asks for confirmation.',
  },
  {
    route: '/settings',
    title: 'App Status Telemetry',
    section: 'Global Controls',
    keywords: ['app status', 'speed', 'load', 'slow page', 'speedometer', 'ctrl s', 'refresh', 'reload', 'memory', 'frame rate'],
    primaryButtons: ['Refresh', 'Reload app', 'Close until refresh', 'Close'],
    summary: 'App Status opens from the profile menu or Ctrl+S and shows local-only performance telemetry such as speed score, load percentage, frame rate, event lag, long tasks, memory where available, and safe reload options.',
  },
  {
    route: '/recycle-bin',
    title: 'Recycle Bin Safety Net',
    section: 'Administration & Configuration',
    keywords: ['recycle bin', 'deleted records', 'restore', 'permanent delete', 'purge', 'filter'],
    primaryButtons: ['Restore', 'Delete permanently', 'Filter'],
    summary: 'Recycle Bin stores deleted records so admins can restore them or permanently purge them without breaking historical data links.',
  },
  {
    route: '/about',
    title: 'Compliance and Support Matrix',
    section: 'Administration & Configuration',
    keywords: ['about app', 'privacy policy', 'terms of use', 'help support', 'support', 'logo'],
    primaryButtons: ['Privacy Policy', 'Terms of Use', 'Help & Support'],
    summary: 'About App contains application information, privacy policy, terms of use, help and support details, and the app logo from the profile menu.',
  },
  {
    route: '/settings',
    title: 'Global Shortcuts and Navigation',
    section: 'Global Architecture & Controls',
    keywords: ['ctrl k', 'global search', 'sidebar typeahead', 'ctrl left', 'ctrl right', 'ctrl s', 'shortcuts', 'profile menu', 'recycle bin'],
    primaryButtons: ['Ctrl+K', 'Sidebar typeahead', 'Ctrl+Left', 'Ctrl+Right', 'Ctrl+S', 'Profile menu'],
    summary: 'Global controls include Ctrl+K for search, sidebar typeahead plus Enter for page navigation, Ctrl+Left/Ctrl+Right for sidebar collapse, and Ctrl+S for App Status.',
  },
  {
    route: '/settings',
    title: 'Offline First and Sync Behavior',
    section: 'Global Architecture & Controls',
    keywords: ['offline', 'sync', 'cached data', 'local storage', 'indexeddb', 'background sync', 'automatic sync', 'conflicts'],
    primaryButtons: ['Refresh/Sync', 'Settings sync controls'],
    summary: 'Schofy should open pages from local cached data first, keep CRUD operations available offline, queue changes automatically, and sync in the background when internet returns without blocking navigation.',
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchSchofyManual(query: string, currentPath = '') {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(term => term.length > 1);

  return schofyManualEntries
    .map(entry => {
      const haystack = normalize([
        entry.title,
        entry.section,
        entry.route,
        entry.summary,
        ...entry.keywords,
        ...entry.primaryButtons,
        ...(entry.steps || []),
      ].join(' '));
      const routeBase = entry.route.includes('/:') ? entry.route.split('/:')[0] : entry.route;
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        + (currentPath && routeBase !== '/' && currentPath.startsWith(routeBase) ? 2 : 0)
        + (normalize(entry.title).includes(normalizedQuery) ? 3 : 0);
      return { entry, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map(item => item.entry);
}
