-- Migration: 032_admin_message_replies
-- Description: Ensure super-admin broadcasts and school replies have a shared chat table.

CREATE TABLE IF NOT EXISTS admin_messages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  target_schools TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by TEXT NOT NULL DEFAULT 'Super Admin'
);

ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS direction TEXT NOT NULL DEFAULT 'broadcast';
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS parent_id TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS school_id TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS school_name TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS cleared_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_admin_messages_direction ON admin_messages(direction);
CREATE INDEX IF NOT EXISTS idx_admin_messages_parent_id ON admin_messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_school_id ON admin_messages(school_id);
CREATE INDEX IF NOT EXISTS idx_admin_messages_sent_at ON admin_messages(sent_at);

ALTER TABLE admin_messages DISABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_messages TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
