-- Add user accounts for login
INSERT INTO users (id, school_id, email, password_hash, role, first_name, last_name, phone, is_active) VALUES
('31111111-1111-1111-1111-111111111101', '11111111-1111-1111-1111-111111111111', 'admin@greenvalley.edu', '$2a$10$abcdefghijklmnopqrstuv', 'admin', 'John', 'Smith', '+1-555-1001', true),
('32222222-2222-2222-2222-222222222201', '22222222-2222-2222-2222-222222222222', 'admin@riverside.edu', '$2a$10$abcdefghijklmnopqrstuv', 'admin', 'Lisa', 'Anderson', '+1-555-2001', true),
('33333333-3333-3333-3333-333333333301', '33333333-3333-3333-3333-333333333333', 'admin@mountview.edu', '$2a$10$abcdefghijklmnopqrstuv', 'admin', 'Patricia', 'Garcia', '+1-555-3001', true)
ON CONFLICT DO NOTHING;