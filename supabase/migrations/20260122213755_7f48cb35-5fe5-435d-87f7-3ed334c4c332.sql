-- Corrigir política RLS permissiva de histórico
DROP POLICY IF EXISTS "Sistema pode inserir histórico" ON public.reimbursement_history;

CREATE POLICY "Usuários autenticados podem inserir histórico de suas solicitações"
  ON public.reimbursement_history FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.reimbursement_requests r
      WHERE r.id = request_id
      AND (
        r.user_id = auth.uid()
        OR public.has_any_role(auth.uid(), ARRAY['admin', 'gerente', 'financeiro']::app_role[])
        OR public.is_manager_of_requester(r.id)
      )
    )
  );