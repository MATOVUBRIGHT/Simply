-- Migration: 033_admin_message_release_links
-- Description: Add optional reply controls and media/action links to super-admin broadcasts.

ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS allow_reply BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS action_url TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS attachment_url TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS attachment_name TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS attachment_type TEXT;
ALTER TABLE admin_messages ADD COLUMN IF NOT EXISTS attachment_size INTEGER;

CREATE INDEX IF NOT EXISTS idx_admin_messages_allow_reply ON admin_messages(allow_reply);

NOTIFY pgrst, 'reload schema';
