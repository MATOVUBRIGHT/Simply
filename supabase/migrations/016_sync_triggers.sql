-- =====================================================
-- SYNC TRIGGERS FOR ALL TABLES
-- =====================================================

-- Ensure the trigger function exists
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all syncable tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'schools',
    'students',
    'staff',
    'classes',
    'subjects',
    'attendance',
    'fees',
    'fee_structures',
    'bursaries',
    'discounts',
    'payments',
    'salary_payments',
    'invoices',
    'exams',
    'exam_results',
    'timetable',
    'transport_routes',
    'transport_assignments',
    'announcements',
    'notifications',
    'users'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS tr_update_updated_at ON %I', t);
    EXECUTE format('CREATE TRIGGER tr_update_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()', t);
  END LOOP;
END;
$$;
