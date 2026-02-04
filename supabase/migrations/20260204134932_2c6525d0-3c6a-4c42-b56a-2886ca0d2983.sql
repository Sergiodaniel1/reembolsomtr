-- Fix: Make receipts bucket private and restrict system_settings access

-- 1. Make the receipts bucket private to prevent public URL access
UPDATE storage.buckets SET public = false WHERE id = 'receipts';

-- 2. Restrict system_settings to admin and finance roles only
DROP POLICY IF EXISTS "Everyone can view settings" ON public.system_settings;

CREATE POLICY "Admin and finance can view settings"
ON public.system_settings
FOR SELECT
USING (
  has_any_role(auth.uid(), ARRAY['admin'::app_role, 'financeiro'::app_role])
);

-- Note: profiles_public view already has security_invoker = on, 
-- which means it uses the caller's permissions (RLS on profiles applies)