-- Update the SELECT policy to also allow financeiro role to view profiles
-- They need this to see requester names in their workflow
DROP POLICY IF EXISTS "Usuários podem ver perfis permitidos" ON public.profiles;

CREATE POLICY "Usuários podem ver perfis permitidos"
ON public.profiles
FOR SELECT
USING (
  user_id = auth.uid() -- Own profile
  OR is_manager_of_user(user_id) -- Subordinate profiles
  OR has_any_role(auth.uid(), ARRAY['admin'::app_role, 'financeiro'::app_role, 'diretoria'::app_role]) -- These roles see all
);