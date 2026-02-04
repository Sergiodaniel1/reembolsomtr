-- 1) Create helper function to check if user is manager of another user
CREATE OR REPLACE FUNCTION public.is_manager_of_user(_target_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = _target_user_id
      AND p.manager_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
$$;

-- 2) Drop the permissive SELECT policy
DROP POLICY IF EXISTS "Usuários podem ver todos os perfis" ON public.profiles;

-- 3) Create new restrictive SELECT policy
-- Users can see: their own profile, their subordinates' profiles, or all if admin
CREATE POLICY "Usuários podem ver perfis permitidos"
ON public.profiles
FOR SELECT
USING (
  user_id = auth.uid() -- Own profile
  OR is_manager_of_user(user_id) -- Subordinate profiles
  OR has_role(auth.uid(), 'admin'::app_role) -- Admins see all
);

-- 4) Create a public view with limited fields for dropdowns/lists
-- This view only exposes non-sensitive data
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = on)
AS
SELECT 
  id,
  user_id,
  full_name,
  active
FROM public.profiles;

-- 5) Grant access to the view
GRANT SELECT ON public.profiles_public TO authenticated;

-- 6) Create RLS policy for the view's underlying query
-- The view uses security_invoker so it will respect the profiles table RLS
-- But we need a separate policy for listing basic info
-- Create a function to allow basic profile listing for authenticated users
CREATE OR REPLACE FUNCTION public.get_basic_profiles()
RETURNS TABLE (
  id uuid,
  user_id uuid,
  full_name text,
  active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, user_id, full_name, active
  FROM public.profiles
  WHERE active = true
$$;