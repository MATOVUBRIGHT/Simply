#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const CONFIRM_TEXT = 'DELETE_SCHOOL_DATA';
const SCHOOL_ID_TABLES = [
  'library_issues',
  'hostel_assignments',
  'certificates',
  'student_resources',
  'lesson_plans',
  'exam_timetable',
  'staff_attendance',
  'student_attendance',
  'parent_messages',
  'behavior_logs',
  'library_books',
  'audit_logs',
  'expenses',
  'inventory',
  'timetable',
  'invoices',
  'discounts',
  'bursaries',
  'transport_assignments',
  'transport_routes',
  'exam_results',
  'exams',
  'attendance',
  'notifications',
  'salary_payments',
  'payments',
  'fee_structures',
  'fees',
  'subjects',
  'classes',
  'staff',
  'students',
  'announcements',
  'settings',
  'subscriptions',
  'users',
  'events',
  'visitor_logs',
];

function parseArgs(argv) {
  const args = {
    allSchools: false,
    schoolIds: [],
    execute: false,
    confirm: '',
    keepSchools: false,
    deleteAuthUsers: false,
    includeGlobalTables: false,
  };

  for (const arg of argv) {
    if (arg === '--all-schools') args.allSchools = true;
    else if (arg === '--execute') args.execute = true;
    else if (arg === '--keep-schools') args.keepSchools = true;
    else if (arg === '--delete-auth-users') args.deleteAuthUsers = true;
    else if (arg === '--include-global-tables') args.includeGlobalTables = true;
    else if (arg.startsWith('--school-id=')) {
      args.schoolIds.push(...arg.slice('--school-id='.length).split(',').map(v => v.trim()).filter(Boolean));
    } else if (arg.startsWith('--confirm=')) {
      args.confirm = arg.slice('--confirm='.length);
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  args.schoolIds = Array.from(new Set(args.schoolIds));
  return args;
}

function printHelp() {
  console.log(`
Delete Schofy school data from Supabase.

Dry run for every school:
  node scripts/delete-supabase-school-data.mjs --all-schools

Actually delete every school and its school-owned records:
  node scripts/delete-supabase-school-data.mjs --all-schools --execute --confirm=${CONFIRM_TEXT}

Delete one or more schools:
  node scripts/delete-supabase-school-data.mjs --school-id=<uuid>[,<uuid>] --execute --confirm=${CONFIRM_TEXT}

Options:
  --keep-schools          Delete records but keep rows in public.schools
  --delete-auth-users     Also delete Supabase Auth users matching public.users.id
  --include-global-tables Delete global public.plans too. Usually not needed.

Environment:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY
`);
}

function requireEnv(name, fallbackName) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : '');
  if (!value) throw new Error(`Missing ${name}${fallbackName ? ` or ${fallbackName}` : ''}`);
  return value;
}

function chunks(items, size = 100) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function maybeCount(supabase, table, column, ids) {
  try {
    let count = 0;
    for (const batch of chunks(ids)) {
      const query = supabase.from(table).select('*', { count: 'exact', head: true });
      const { count: batchCount, error } = await query.in(column, batch);
      if (error) {
        console.warn(`Skipping count for ${table}: ${error.message}`);
        return null;
      }
      count += batchCount || 0;
    }
    return count;
  } catch (error) {
    console.warn(`Skipping count for ${table}: ${error?.message || error}`);
    return null;
  }
}

async function deleteByIds(supabase, table, column, ids) {
  let deleted = 0;
  for (const batch of chunks(ids)) {
    const { count, error } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .in(column, batch);
    if (error) {
      console.warn(`Skipping delete for ${table}: ${error.message}`);
      continue;
    }
    deleted += count || 0;
  }
  return deleted;
}

async function getTargetSchoolIds(supabase, args) {
  if (args.schoolIds.length > 0) return args.schoolIds;
  if (!args.allSchools) {
    throw new Error('Pass --all-schools or --school-id=<uuid>.');
  }

  const { data, error } = await supabase.from('schools').select('id');
  if (error) throw new Error(`Failed to list schools: ${error.message}`);
  return (data || []).map(row => row.id).filter(Boolean);
}

async function getAuthUserIdsForSchools(supabase, schoolIds) {
  const ids = new Set();
  for (const batch of chunks(schoolIds)) {
    const { data, error } = await supabase.from('users').select('id').in('school_id', batch);
    if (error) {
      console.warn(`Could not read public.users for auth cleanup: ${error.message}`);
      continue;
    }
    (data || []).forEach(row => row?.id && ids.add(row.id));
  }
  return Array.from(ids);
}

async function deleteAuthUsers(supabase, userIds, dryRun) {
  if (userIds.length === 0) return 0;
  if (dryRun) return userIds.length;

  let deleted = 0;
  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.warn(`Could not delete auth user ${userId}: ${error.message}`);
      continue;
    }
    deleted += 1;
  }
  return deleted;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dryRun = !args.execute;
  if (args.execute && args.confirm !== CONFIRM_TEXT) {
    throw new Error(`Refusing to delete. Add --confirm=${CONFIRM_TEXT}`);
  }

  const supabaseUrl = requireEnv('SUPABASE_URL', 'VITE_SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const schoolIds = await getTargetSchoolIds(supabase, args);
  if (schoolIds.length === 0) {
    console.log('No schools found. Nothing to delete.');
    return;
  }

  console.log(`${dryRun ? 'DRY RUN' : 'EXECUTE'}: ${schoolIds.length} school(s) targeted.`);
  if (dryRun) console.log(`Add --execute --confirm=${CONFIRM_TEXT} to delete.`);

  const authUserIds = args.deleteAuthUsers ? await getAuthUserIdsForSchools(supabase, schoolIds) : [];
  if (args.deleteAuthUsers) {
    console.log(`${dryRun ? 'Would delete' : 'Deleting'} ${authUserIds.length} Supabase Auth user(s).`);
    const authDeleted = await deleteAuthUsers(supabase, authUserIds, dryRun);
    console.log(`${dryRun ? 'Would delete' : 'Deleted'} auth users: ${authDeleted}`);
  }

  let total = 0;
  for (const table of SCHOOL_ID_TABLES) {
    if (dryRun) {
      const count = await maybeCount(supabase, table, 'school_id', schoolIds);
      if (count === null) continue;
      total += count;
      console.log(`Would delete ${count} row(s) from ${table}`);
    } else {
      const deleted = await deleteByIds(supabase, table, 'school_id', schoolIds);
      total += deleted;
      console.log(`Deleted ${deleted} row(s) from ${table}`);
    }
  }

  if (!args.keepSchools) {
    if (dryRun) {
      const count = await maybeCount(supabase, 'schools', 'id', schoolIds);
      total += count || 0;
      console.log(`Would delete ${count || 0} row(s) from schools`);
    } else {
      const deleted = await deleteByIds(supabase, 'schools', 'id', schoolIds);
      total += deleted;
      console.log(`Deleted ${deleted} row(s) from schools`);
    }
  }

  if (args.includeGlobalTables) {
    if (dryRun) {
      const { count, error } = await supabase.from('plans').select('*', { count: 'exact', head: true });
      if (!error) {
        total += count || 0;
        console.log(`Would delete ${count || 0} row(s) from global table plans`);
      }
    } else {
      const { count, error } = await supabase.from('plans').delete({ count: 'exact' }).neq('id', '__never__');
      if (error) console.warn(`Skipping delete for plans: ${error.message}`);
      else {
        total += count || 0;
        console.log(`Deleted ${count || 0} row(s) from global table plans`);
      }
    }
  }

  console.log(`${dryRun ? 'Dry run complete' : 'Cleanup complete'}: ${total} row(s) ${dryRun ? 'would be deleted' : 'deleted'}.`);
}

main().catch(error => {
  console.error(error?.message || error);
  process.exit(1);
});
