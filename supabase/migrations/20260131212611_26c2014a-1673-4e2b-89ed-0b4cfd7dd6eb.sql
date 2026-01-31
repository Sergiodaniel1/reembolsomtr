-- Add policy for first admin to update their role
DROP POLICY IF EXISTS "First admin can update their role" ON public.user_roles;

CREATE POLICY "First admin can update their role"
ON public.user_roles
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  )
)
WITH CHECK (
  role = 'admin'
  AND user_id = auth.uid()
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin' AND user_id != auth.uid()
  )
);