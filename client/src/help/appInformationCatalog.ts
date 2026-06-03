export type AppInformationPage = {
  route: string;
  title: string;
  section: string;
  keywords: string[];
  primaryButtons: string[];
  summary: string;
  screenshot: string;
};

export const appInformationPages: AppInformationPage[] = [
  {
    route: '/login',
    title: 'Authentication',
    section: 'Start',
    keywords: ['login', 'auth', 'admin', 'offline account', 'online account', 'remember admin', 'verification', 'sign in', 'create account'],
    primaryButtons: ['Sign In', 'Create Account', 'Continue Locally', 'Save admin', 'Clear saved admin', 'Enter verification code'],
    summary: 'Lets the main school/admin account sign in, create an account, continue locally where allowed, and preserve saved admin sessions.',
    screenshot: 'auth-login.png',
  },
  {
    route: '/',
    title: 'Dashboard',
    section: 'Overview',
    keywords: ['dashboard', 'summary', 'growth', 'profit', 'attendance', 'students', 'finance', 'overview', 'welcome', 'greeting'],
    primaryButtons: ['Refresh', 'Open linked cards'],
    summary: 'Shows a time-based greeting with the user name, rotating encouragement text, high-level school summaries, growth, finance, attendance, and quick operational status.',
    screenshot: 'dashboard.png',
  },
  {
    route: '/students',
    title: 'Students',
    section: 'People',
    keywords: ['student list', 'students', 'admission number', 'active students', 'import', 'export', 'cleanup', 'class filter', 'student id'],
    primaryButtons: ['New Admission', 'Import', 'Export', 'Check Classes', 'Cleanup', 'Status filter', 'Class filter', 'Row actions'],
    summary: 'Lists students, supports search/filtering, bulk actions, import/export, activation, completion, class checks, and profile access.',
    screenshot: 'students.png',
  },
  {
    route: '/students/new',
    title: 'Student Admission Form',
    section: 'People',
    keywords: ['new student', 'admission', 'guardian', 'photo', 'class', 'status', 'student form'],
    primaryButtons: ['Save', 'Cancel', 'Upload photo', 'Change class'],
    summary: 'Creates or edits a student record with personal, guardian, class, contact, photo, and status details.',
    screenshot: 'student-new.png',
  },
  {
    route: '/students/:id',
    title: 'Student Profile',
    section: 'People',
    keywords: ['student profile', 'subjects', 'fees', 'ledger', 'records', 'change class', 'invoice', 'optional subjects', 'combinations'],
    primaryButtons: ['Edit', 'Invoice', 'Ledger', 'Tabs', 'Change Class', 'Record Payment'],
    summary: 'Shows complete student details, subjects, optional subjects, combinations, fees, payments, documents, ledger, and editable extra records.',
    screenshot: 'student-profile.png',
  },
  {
    route: '/parents',
    title: 'Parents & Emails',
    section: 'People',
    keywords: ['parents', 'guardians', 'email', 'student email', 'class filter', 'copy emails', 'call parent'],
    primaryButtons: ['Call icon', 'Email icon', 'Students emails', 'Copy selected', 'Copy all', 'Class filter'],
    summary: 'Lists guardians and student email details with class filtering and quick copy/send workflows.',
    screenshot: 'parents-emails.png',
  },
  {
    route: '/parent-emails',
    title: 'Parent/Student Email Composer',
    section: 'People',
    keywords: ['email composer', 'parents', 'students', 'copy emails', 'gmail', 'student emails'],
    primaryButtons: ['Parent emails', 'Student emails', 'Both', 'Copy selected', 'Copy all'],
    summary: 'Selects parent or student email groups and prepares copied email lists for sending.',
    screenshot: 'parent-email-composer.png',
  },
  {
    route: '/admission',
    title: 'Admission',
    section: 'People',
    keywords: ['admission workflow', 'documents', 'new student', 'enroll'],
    primaryButtons: ['Next', 'Back', 'Submit Admission', 'Document toggles'],
    summary: 'Guided admission workflow for capturing applicant details and required documents.',
    screenshot: 'admission.png',
  },
  {
    route: '/staff',
    title: 'Teachers & Staff',
    section: 'People',
    keywords: ['staff', 'teachers', 'subjects', 'payroll', 'roles', 'teacher list'],
    primaryButtons: ['Add Staff', 'Generate Payroll', 'Edit', 'Profile', 'Activate/Deactivate'],
    summary: 'Manages teachers and staff, their subjects, profile details, payroll setup, and active status.',
    screenshot: 'staff.png',
  },
  {
    route: '/roles',
    title: 'Roles & Access',
    section: 'Operations',
    keywords: ['staff login', 'role access', 'permissions', 'activity log', 'offline staff login', 'staff password'],
    primaryButtons: ['Add Staff', 'Edit', 'Change Password', 'Read-only toggle', 'Activate/Deactivate', 'Delete'],
    summary: 'Creates staff role credentials by name and password, assigns allowed pages, and reviews activity logs.',
    screenshot: 'roles-access.png',
  },
  {
    route: '/classes',
    title: 'Classes & Timetables',
    section: 'Academics',
    keywords: ['classes', 'capacity', 'subjects', 'fees', 'timetable', 'optional subjects', 'assign ops'],
    primaryButtons: ['Add Class', 'Timetable', 'Import', 'Export', 'Assign OPs', 'View all'],
    summary: 'Manages class records, capacities, students, subjects, fees, optional subjects, and timetable entry.',
    screenshot: 'classes-timetables.png',
  },
  {
    route: '/classes/timetable',
    title: 'Timetable',
    section: 'Academics',
    keywords: ['timetable', 'class timetable', 'overall timetable', 'collisions', 'room', 'exam', 'custom event', 'free time'],
    primaryButtons: ['Class', 'Overall', 'Save', 'Print', 'Fullscreen', 'Minimize', 'Add subject/room/free time'],
    summary: 'Builds class and overall school timetables with rooms, exams, custom events, free time, print views, and collision warnings.',
    screenshot: 'timetable.png',
  },
  {
    route: '/subjects',
    title: 'Subjects',
    section: 'Academics',
    keywords: ['subjects', 'subject code', 'teacher', 'class subject', 'optional', 'delete subject'],
    primaryButtons: ['Add Subject', 'Edit', 'Delete', 'Assign Teacher', 'Class filter'],
    summary: 'Manages subject names, codes, class assignment, optional subjects, and teacher links.',
    screenshot: 'subjects.png',
  },
  {
    route: '/homework-tests',
    title: 'Assignments & Tests',
    section: 'Academics',
    keywords: ['assignment', 'homework', 'test', 'issued', 'completed', 'results', 'email'],
    primaryButtons: ['Add', 'Edit', 'Delete', 'Send email', 'Class filter', 'Subject filter'],
    summary: 'Tracks issued assignments and tests, completion, results, and email actions.',
    screenshot: 'assignments-tests.png',
  },
  {
    route: '/grades',
    title: 'Exams & Grades',
    section: 'Academics',
    keywords: ['grades', 'exam', 'marks', 'custom grading', 'report card', 'download template'],
    primaryButtons: ['Add Exam', 'Download Template', 'Import Marks', 'Custom Grading', 'Save'],
    summary: 'Manages exams, marks, grading, manual templates, and report card preparation.',
    screenshot: 'exams-grades.png',
  },
  {
    route: '/attendance',
    title: 'Attendance',
    section: 'Daily Records',
    keywords: ['attendance', 'present', 'absent', 'late', 'import', 'auto save', 'mark all'],
    primaryButtons: ['Save', 'Import', 'Class filter', 'Date picker', 'Mark all'],
    summary: 'Records student and staff attendance by date/class, with import and auto-save behavior.',
    screenshot: 'attendance.png',
  },
  {
    route: '/finance',
    title: 'Fees & Finance',
    section: 'Finance',
    keywords: ['fees', 'ledger', 'payments', 'opening balance', 'balance', 'invoice', 'record payment'],
    primaryButtons: ['Students', 'Ledger', 'Invoices', 'Payments', 'Record Payment', 'Filters'],
    summary: 'Shows student finance summaries, ledgers, invoice status, payments, balances, and bursary/discount indicators.',
    screenshot: 'fees-finance.png',
  },
  {
    route: '/invoices',
    title: 'Invoices',
    section: 'Finance',
    keywords: ['invoice', 'fee structure', 'student filter', 'class filter', 'template', 'delete invoices', 'live edit'],
    primaryButtons: ['Generate', 'Record', 'Print', 'Live Edit', 'Filters', 'Double-click select', 'Delete selected'],
    summary: 'Creates, filters, edits, prints, records payments against, and manages invoices and invoice templates.',
    screenshot: 'invoices.png',
  },
  {
    route: '/reports',
    title: 'Reports',
    section: 'Operations',
    keywords: ['reports', 'profit', 'expense', 'net profit', 'print selected', 'term', 'year'],
    primaryButtons: ['Print', 'Export', 'Term filter', 'Year filter', 'Card selection'],
    summary: 'Shows class-organized reports, finance/profit cards, dashboard growth data, and print/export options.',
    screenshot: 'reports.png',
  },
  {
    route: '/settings',
    title: 'Settings',
    section: 'Admin',
    keywords: ['settings', 'logo', 'school type', 'category', 'shortcuts', 'currency', 'save', 'ctrl s', 'app status'],
    primaryButtons: ['Save', 'Upload Logo', 'Generate Classes', 'Confirm', 'Theme controls'],
    summary: 'Configures school identity, logo, currency, shortcuts including Ctrl+S for App Status, class generation, school type/category, and app preferences.',
    screenshot: 'settings.png',
  },
  {
    route: '/settings',
    title: 'App Status',
    section: 'Global Controls',
    keywords: ['app status', 'speed', 'load', 'slow page', 'refresh', 'reload', 'speedometer', 'ctrl s', 'performance'],
    primaryButtons: ['Refresh', 'Reload app', 'Close until refresh', 'Close'],
    summary: 'Opens from the profile menu, Ctrl+S, or automatic slow-mode detection and shows live local browser speed data with a theme-colored speedometer, load percentage, frame rate, event lag, recent long tasks, memory where available, the slowing page, suggested fixes, local-only refresh, Close until refresh, and session-preserving reload without calling Supabase.',
    screenshot: 'settings.png',
  },
  {
    route: '/plans',
    title: 'Plans & Billing',
    section: 'Admin',
    keywords: ['plans', 'billing', 'verification code', 'whatsapp payment', 'unlimited', 'trial', 'payment code', 'month', 'year', 'term', 'ugx'],
    primaryButtons: ['Choose Plan', 'Request Trial', 'Enter verification code', 'Contact Us', 'Send payment via WhatsApp', 'Enter Code', 'Verify'],
    summary: 'Handles subscription plans, payment submission, verification codes, pending access, themed billing/currency selectors, and unlimited release messaging.',
    screenshot: 'plans-billing.png',
  },
  {
    route: '/payment-accounts',
    title: 'Payment Accounts',
    section: 'Finance',
    keywords: ['bank', 'mobile money', 'cash', 'account', 'branch', 'invoice account details'],
    primaryButtons: ['Add Account', 'Edit', 'Hold', 'Delete', 'Save'],
    summary: 'Sets bank, mobile money, and cash payment details that can appear on invoices.',
    screenshot: 'payment-accounts.png',
  },
  {
    route: '/expenses',
    title: 'Expenses',
    section: 'Finance',
    keywords: ['expenses', 'profit', 'payment method', 'record expense'],
    primaryButtons: ['Add Expense', 'Save', 'Edit', 'Delete', 'Payment method'],
    summary: 'Records school expenses with category, date, amount, recorded-by, payment method, and notes.',
    screenshot: 'expenses.png',
  },
  {
    route: '/notifications',
    title: 'Notifications',
    section: 'Communication',
    keywords: ['notifications', 'read', 'delete', 'broadcast', 'attachments', 'reply'],
    primaryButtons: ['Mark read', 'Delete', 'Open attachment', 'Reply'],
    summary: 'Lists notifications, read states, broadcast messages, replies, and attachments.',
    screenshot: 'notifications.png',
  },
  {
    route: '/about',
    title: 'About App',
    section: 'Admin',
    keywords: ['about', 'privacy', 'terms', 'help', 'support', 'logo'],
    primaryButtons: ['Privacy Policy', 'Terms of Use', 'Help & Support'],
    summary: 'Shows app information, privacy policy, terms of use, support details, and the app logo.',
    screenshot: 'about-app.png',
  },
];

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function searchInformationCatalog(query: string, currentPath = '') {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const terms = normalizedQuery.split(/\s+/).filter(term => term.length > 1);

  return appInformationPages
    .map(page => {
      const haystack = normalize([
        page.title,
        page.section,
        page.route,
        page.summary,
        ...page.keywords,
        ...page.primaryButtons,
      ].join(' '));
      const score = terms.reduce((total, term) => total + (haystack.includes(term) ? 1 : 0), 0)
        + (currentPath && page.route !== '/' && currentPath.startsWith(page.route.replace('/:id', '')) ? 2 : 0)
        + (normalize(page.title).includes(normalizedQuery) ? 3 : 0);
      return { page, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(item => item.page);
}
