-- Drop existing insert policy for user_roles if exists
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "First admin can bootstrap" ON public.user_roles;

-- Create policy to allow the first admin to be created when no admin exists
CREATE POLICY "First admin can bootstrap"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  role = 'admin' 
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  )
  AND auth.uid() = user_id
);

-- Create policy for admins to manage roles (for subsequent operations)
CREATE POLICY "Admins can manage roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));