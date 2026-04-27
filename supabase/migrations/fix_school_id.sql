-- Fix: Ensure users have correct school_id

-- Check current users
SELECT id, email, school_id FROM users;

-- Update users to have correct school_id (matching the sample data schools)
UPDATE users SET school_id = '11111111-1111-1111-1111-111111111111' WHERE email = 'admin@greenvalley.edu';
UPDATE users SET school_id = '22222222-2222-2222-2222-222222222222' WHERE email = 'admin@riverside.edu';
UPDATE users SET school_id = '33333333-3333-3333-3333-333333333333' WHERE email = 'admin@mountview.edu';