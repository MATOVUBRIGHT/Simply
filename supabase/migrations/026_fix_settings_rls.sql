-- Migration: 026_fix_settings_rls
-- Description: Ensure authenticated users can manage school settings

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage school settings" ON public.settings;

CREATE POLICY "Users can manage school settings" 
ON public.settings 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- Also ensure schools table is accessible
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view schools" ON public.schools;
CREATE POLICY "Anyone can view schools" ON public.schools FOR SELECT USING (true);
DROP POLICY IF EXISTS "Authenticated users can update schools" ON public.schools;
CREATE POLICY "Authenticated users can update schools" ON public.schools FOR UPDATE TO authenticated USING (true);
