-- Fix RLS Policies for Automatic Sync
-- Run this in Supabase SQL Editor if sync fails with permission errors

-- 1. Disable RLS on users table (quick fix for development)
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;

-- 2. OR create proper policies for production (recommended)
-- First enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to insert (for registration)
CREATE POLICY "Allow anonymous insert on users" ON public.users
  FOR INSERT
  WITH CHECK (true);

-- Allow users to view their own data
CREATE POLICY "Users can view own data" ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Allow users to update their own data
CREATE POLICY "Users can update own data" ON public.users
  FOR UPDATE
  USING (auth.uid() = id);

-- 3. Apply similar policies to other sync tables
-- Disable RLS on all sync tables for development
ALTER TABLE public.schools DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.students DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.fees DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exams DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.timetable DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_routes DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.transport_assignments DISABLE ROW LEVEL SECURITY;

-- 4. Verify the changes
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('users', 'schools', 'students', 'staff', 'classes', 'subjects');
