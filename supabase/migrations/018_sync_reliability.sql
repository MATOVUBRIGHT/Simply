-- =====================================================
-- Migration: 018_sync_reliability
-- Description: Ensure all sync-critical tables exist with required columns/indexes
-- =====================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- SETTINGS (cross-device app settings)
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL,
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_settings_school_key UNIQUE (school_id, key)
);

CREATE INDEX IF NOT EXISTS idx_settings_school_id ON settings(school_id);
CREATE INDEX IF NOT EXISTS idx_settings_key ON settings(key);

ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- PROFILES
-- =====================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  user_id UUID NOT NULL,
  display_name VARCHAR(200),
  avatar_url TEXT,
  bio TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_profiles_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);

ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- FOLLOWS
-- =====================================================
CREATE TABLE IF NOT EXISTS follows (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  follower_id UUID NOT NULL,
  following_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uq_follows_pair UNIQUE (follower_id, following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_school_id ON follows(school_id);
CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);

ALTER TABLE follows DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- MESSAGES
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  sender_id UUID NOT NULL,
  recipient_id UUID,
  conversation_id UUID,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_messages_school_id ON messages(school_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_id ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);

ALTER TABLE messages DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- SUBSCRIPTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  user_id UUID NOT NULL,
  plan VARCHAR(50) NOT NULL DEFAULT 'free',
  status VARCHAR(30) NOT NULL DEFAULT 'active',
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_school_id ON subscriptions(school_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- POINT TRANSACTIONS
-- =====================================================
CREATE TABLE IF NOT EXISTS point_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID,
  user_id UUID NOT NULL,
  points INTEGER NOT NULL,
  direction VARCHAR(10) NOT NULL,
  reason TEXT,
  reference_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  CONSTRAINT chk_point_transactions_direction CHECK (direction IN ('credit', 'debit'))
);

CREATE INDEX IF NOT EXISTS idx_point_transactions_school_id ON point_transactions(school_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at DESC);

ALTER TABLE point_transactions DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- INSTRUCTORS (for compatibility with clients expecting this table)
-- =====================================================
CREATE TABLE IF NOT EXISTS instructors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  school_id UUID NOT NULL,
  staff_id UUID,
  employee_id VARCHAR(100),
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  role VARCHAR(50) DEFAULT 'teacher',
  phone VARCHAR(50),
  email VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_instructors_school_id ON instructors(school_id);
CREATE INDEX IF NOT EXISTS idx_instructors_employee_id ON instructors(employee_id);
CREATE INDEX IF NOT EXISTS idx_instructors_status ON instructors(status);

ALTER TABLE instructors DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- Ensure update_updated_at trigger function exists
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to new tables
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'settings',
    'profiles',
    'follows',
    'messages',
    'subscriptions',
    'point_transactions',
    'instructors'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', t, t);
    EXECUTE format(
      'CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      t,
      t
    );
  END LOOP;
END $$;

-- =====================================================
-- Ensure realtime publication includes sync tables
-- =====================================================
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
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
    'settings',
    'profiles',
    'follows',
    'messages',
    'subscriptions',
    'point_transactions',
    'instructors'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    EXCEPTION
      WHEN duplicate_object THEN
        NULL;
      WHEN undefined_object THEN
        NULL;
    END;
  END LOOP;
END $$;
