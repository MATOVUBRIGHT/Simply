-- Migration: 021_add_missing_columns
-- Description: Add missing columns to tables that the app expects

-- fee_structures: add is_required and name columns
ALTER TABLE IF EXISTS fee_structures ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;
ALTER TABLE IF EXISTS fee_structures ADD COLUMN IF NOT EXISTS name VARCHAR(100);

-- announcements: add created_by column  
ALTER TABLE IF EXISTS announcements ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);

-- payments: add payment_type column
ALTER TABLE IF EXISTS payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(50) DEFAULT 'fee';

-- fees: add is_required column
ALTER TABLE IF EXISTS fees ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true;