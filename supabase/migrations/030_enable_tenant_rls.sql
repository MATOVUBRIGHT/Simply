-- Migration: 030_enable_tenant_rls
-- Description: Re-enable production RLS and scope app data to the signed-in user's school.

GRANT USAGE ON SCHEMA public TO authenticated;

DO $$
DECLARE
  table_name text;
  scoped_tables text[] := ARRAY[
    'students',
    'staff',
    'classes',
    'subjects',
    'attendance',
    'fees',
    'fee_structures',
    'payments',
    'salary_payments',
    'announcements',
    'notifications',
    'exams',
    'exam_results',
    'timetable',
    'transport_routes',
    'transport_assignments',
    'bursaries',
    'discounts',
    'invoices',
    'settings',
    'subscriptions',
    'point_transactions',
    'inventory',
    'expenses',
    'audit_logs',
    'library_books',
    'library_issues',
    'homework',
    'behavior_logs',
    'parent_messages',
    'student_attendance',
    'staff_attendance',
    'exam_timetable',
    'lesson_plans',
    'student_resources',
    'hostel_rooms',
    'hostel_assignments',
    'events',
    'visitor_logs',
    'certificates',
    'admin_messages',
    'school_staff_users',
    'staff_activity_log'
  ];
BEGIN
  IF to_regclass('public.users') IS NOT NULL THEN
    ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.users FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO authenticated;

    DROP POLICY IF EXISTS schofy_users_select ON public.users;
    DROP POLICY IF EXISTS schofy_users_insert ON public.users;
    DROP POLICY IF EXISTS schofy_users_update ON public.users;
    DROP POLICY IF EXISTS schofy_users_delete ON public.users;

    CREATE POLICY schofy_users_select ON public.users
      FOR SELECT TO authenticated
      USING (id = auth.uid() OR school_id = auth.uid());

    CREATE POLICY schofy_users_insert ON public.users
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid() AND (school_id = auth.uid() OR school_id IS NULL));

    CREATE POLICY schofy_users_update ON public.users
      FOR UPDATE TO authenticated
      USING (id = auth.uid() OR school_id = auth.uid())
      WITH CHECK (id = auth.uid() OR school_id = auth.uid());

    CREATE POLICY schofy_users_delete ON public.users
      FOR DELETE TO authenticated
      USING (id = auth.uid() OR school_id = auth.uid());
  END IF;

  IF to_regclass('public.schools') IS NOT NULL THEN
    ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON public.schools FROM anon;
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;

    DROP POLICY IF EXISTS schofy_schools_select ON public.schools;
    DROP POLICY IF EXISTS schofy_schools_insert ON public.schools;
    DROP POLICY IF EXISTS schofy_schools_update ON public.schools;
    DROP POLICY IF EXISTS schofy_schools_delete ON public.schools;

    CREATE POLICY schofy_schools_select ON public.schools
      FOR SELECT TO authenticated
      USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.schools.id));

    CREATE POLICY schofy_schools_insert ON public.schools
      FOR INSERT TO authenticated
      WITH CHECK (id = auth.uid());

    CREATE POLICY schofy_schools_update ON public.schools
      FOR UPDATE TO authenticated
      USING (id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.schools.id))
      WITH CHECK (id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.schools.id));

    CREATE POLICY schofy_schools_delete ON public.schools
      FOR DELETE TO authenticated
      USING (id = auth.uid());
  END IF;

  FOREACH table_name IN ARRAY scoped_tables LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE SELECT, INSERT, UPDATE, DELETE ON public.%I FROM anon', table_name);
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', table_name);

      EXECUTE format('DROP POLICY IF EXISTS schofy_tenant_select ON public.%I', table_name);
      EXECUTE format('DROP POLICY IF EXISTS schofy_tenant_insert ON public.%I', table_name);
      EXECUTE format('DROP POLICY IF EXISTS schofy_tenant_update ON public.%I', table_name);
      EXECUTE format('DROP POLICY IF EXISTS schofy_tenant_delete ON public.%I', table_name);

      EXECUTE format(
        'CREATE POLICY schofy_tenant_select ON public.%I FOR SELECT TO authenticated USING (school_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.%I.school_id))',
        table_name,
        table_name
      );
      EXECUTE format(
        'CREATE POLICY schofy_tenant_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (school_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.%I.school_id))',
        table_name,
        table_name
      );
      EXECUTE format(
        'CREATE POLICY schofy_tenant_update ON public.%I FOR UPDATE TO authenticated USING (school_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.%I.school_id)) WITH CHECK (school_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.%I.school_id))',
        table_name,
        table_name,
        table_name
      );
      EXECUTE format(
        'CREATE POLICY schofy_tenant_delete ON public.%I FOR DELETE TO authenticated USING (school_id = auth.uid() OR EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid() AND u.school_id = public.%I.school_id))',
        table_name,
        table_name
      );
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
