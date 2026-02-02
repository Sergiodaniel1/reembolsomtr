-- Fix overly permissive RLS policies

-- 1. Fix audit_logs INSERT policy (currently uses true)
DROP POLICY IF EXISTS "Sistema pode inserir logs" ON public.audit_logs;

-- Only allow inserts from triggers (security definer functions)
-- Since log_audit_action is SECURITY DEFINER, it will bypass RLS
-- We can restrict direct inserts to authenticated users for their own actions
CREATE POLICY "Sistema pode inserir logs via funções"
ON public.audit_logs
FOR INSERT
TO authenticated
WITH CHECK (
  -- Allow insert if user_id matches or is null (system actions)
  user_id IS NULL OR user_id = auth.uid()
);

-- 2. Fix reimbursement_history INSERT policy if needed
-- Already has proper check, no changes needed

-- 3. Ensure profiles INSERT is restricted to admin
DROP POLICY IF EXISTS "Admins podem criar perfis" ON public.profiles;

CREATE POLICY "Admins podem criar perfis"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin')
);

-- Note: The handle_new_user trigger runs as SECURITY DEFINER so it bypasses RLS