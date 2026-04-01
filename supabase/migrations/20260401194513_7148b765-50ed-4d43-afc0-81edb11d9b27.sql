
-- 1. Remove duplicate RLS policies
DROP POLICY IF EXISTS "Usuários podem atualizar próprias solicitações em rascunho " ON public.reimbursement_requests;
DROP POLICY IF EXISTS "Admins podem gerenciar cargos" ON public.user_roles;

-- 2. Function to check if setup is completed (admin exists)
CREATE OR REPLACE FUNCTION public.check_setup_completed()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE role = 'admin'
  )
$$;

-- 3. Central RPC for status transitions with built-in audit + history
CREATE OR REPLACE FUNCTION public.transition_request_status(
  _request_id uuid,
  _action text,
  _comment text DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _payment_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _request reimbursement_requests%ROWTYPE;
  _new_status reimbursement_status;
  _user_id uuid := auth.uid();
  _history_action text;
  _audit_action text;
BEGIN
  -- Fetch request with lock
  SELECT * INTO _request
  FROM reimbursement_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  -- Determine new status and validate permissions
  CASE _action
    -- User submits draft or resubmits after adjustment
    WHEN 'submit' THEN
      IF _request.status NOT IN ('rascunho', 'ajuste_solicitado') THEN
        RAISE EXCEPTION 'Não é possível enviar neste status: %', _request.status;
      END IF;
      IF _request.user_id != _user_id AND NOT has_role(_user_id, 'admin') THEN
        RAISE EXCEPTION 'Apenas o proprietário pode enviar';
      END IF;
      _new_status := 'enviado';
      _history_action := 'submitted';
      _audit_action := 'request_submitted';

    -- Manager approves
    WHEN 'manager_approve' THEN
      IF _request.status NOT IN ('enviado', 'em_aprovacao_gerente') THEN
        RAISE EXCEPTION 'Não é possível aprovar neste status: %', _request.status;
      END IF;
      IF NOT (has_role(_user_id, 'admin') OR has_role(_user_id, 'gerente') AND is_manager_of_requester(_request_id)) THEN
        RAISE EXCEPTION 'Sem permissão para aprovar esta solicitação';
      END IF;
      _new_status := 'em_aprovacao_financeiro';
      _history_action := 'approved_by_manager';
      _audit_action := 'manager_approved';

    -- Manager rejects
    WHEN 'manager_reject' THEN
      IF _request.status NOT IN ('enviado', 'em_aprovacao_gerente') THEN
        RAISE EXCEPTION 'Não é possível reprovar neste status: %', _request.status;
      END IF;
      IF NOT (has_role(_user_id, 'admin') OR has_role(_user_id, 'gerente') AND is_manager_of_requester(_request_id)) THEN
        RAISE EXCEPTION 'Sem permissão para reprovar esta solicitação';
      END IF;
      IF _comment IS NULL OR trim(_comment) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória para reprovação';
      END IF;
      _new_status := 'reprovado';
      _history_action := 'rejected_by_manager';
      _audit_action := 'manager_rejected';

    -- Manager requests adjustment
    WHEN 'manager_adjust' THEN
      IF _request.status NOT IN ('enviado', 'em_aprovacao_gerente') THEN
        RAISE EXCEPTION 'Não é possível solicitar ajuste neste status: %', _request.status;
      END IF;
      IF NOT (has_role(_user_id, 'admin') OR has_role(_user_id, 'gerente') AND is_manager_of_requester(_request_id)) THEN
        RAISE EXCEPTION 'Sem permissão para solicitar ajuste';
      END IF;
      IF _comment IS NULL OR trim(_comment) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória para solicitação de ajuste';
      END IF;
      _new_status := 'ajuste_solicitado';
      _history_action := 'adjustment_requested';
      _audit_action := 'adjustment_requested';

    -- Finance approves
    WHEN 'finance_approve' THEN
      IF _request.status != 'em_aprovacao_financeiro' THEN
        RAISE EXCEPTION 'Não é possível aprovar financeiramente neste status: %', _request.status;
      END IF;
      IF NOT has_any_role(_user_id, ARRAY['financeiro'::app_role, 'admin'::app_role]) THEN
        RAISE EXCEPTION 'Apenas financeiro pode aprovar';
      END IF;
      _new_status := 'aprovado';
      _history_action := 'approved_by_finance';
      _audit_action := 'finance_approved';

    -- Finance rejects
    WHEN 'finance_reject' THEN
      IF _request.status != 'em_aprovacao_financeiro' THEN
        RAISE EXCEPTION 'Não é possível reprovar financeiramente neste status: %', _request.status;
      END IF;
      IF NOT has_any_role(_user_id, ARRAY['financeiro'::app_role, 'admin'::app_role]) THEN
        RAISE EXCEPTION 'Apenas financeiro pode reprovar';
      END IF;
      IF _comment IS NULL OR trim(_comment) = '' THEN
        RAISE EXCEPTION 'Justificativa obrigatória para reprovação';
      END IF;
      _new_status := 'reprovado';
      _history_action := 'rejected_by_finance';
      _audit_action := 'finance_rejected';

    -- Finance marks as paid
    WHEN 'mark_paid' THEN
      IF _request.status != 'aprovado' THEN
        RAISE EXCEPTION 'Não é possível marcar como pago neste status: %', _request.status;
      END IF;
      IF NOT has_any_role(_user_id, ARRAY['financeiro'::app_role, 'admin'::app_role]) THEN
        RAISE EXCEPTION 'Apenas financeiro pode marcar como pago';
      END IF;
      IF _payment_method IS NULL OR _payment_date IS NULL THEN
        RAISE EXCEPTION 'Informações de pagamento obrigatórias';
      END IF;
      _new_status := 'pago';
      _history_action := 'marked_as_paid';
      _audit_action := 'marked_as_paid';

    ELSE
      RAISE EXCEPTION 'Ação desconhecida: %', _action;
  END CASE;

  -- Update request
  UPDATE reimbursement_requests SET
    status = _new_status,
    manager_comment = CASE 
      WHEN _action IN ('manager_approve', 'manager_reject', 'manager_adjust') THEN COALESCE(_comment, manager_comment)
      ELSE manager_comment
    END,
    finance_comment = CASE
      WHEN _action IN ('finance_approve', 'finance_reject', 'mark_paid') THEN COALESCE(_comment, finance_comment)
      ELSE finance_comment
    END,
    submitted_at = CASE WHEN _action = 'submit' THEN now() ELSE submitted_at END,
    approved_at = CASE WHEN _action = 'finance_approve' THEN now() ELSE approved_at END,
    paid_at = CASE WHEN _action = 'mark_paid' THEN now() ELSE paid_at END,
    payment_method = CASE WHEN _action = 'mark_paid' THEN _payment_method ELSE payment_method END,
    payment_date = CASE WHEN _action = 'mark_paid' THEN _payment_date ELSE payment_date END,
    updated_at = now()
  WHERE id = _request_id;

  -- Insert history record
  INSERT INTO reimbursement_history (request_id, user_id, action, old_status, new_status, comment)
  VALUES (_request_id, _user_id, _history_action, _request.status, _new_status, _comment);

  -- Audit log
  PERFORM log_audit_action(
    _audit_action,
    'reimbursement_requests',
    _request_id,
    jsonb_build_object('status', _request.status),
    jsonb_build_object('status', _new_status, 'comment', _comment)
  );

  RETURN jsonb_build_object(
    'success', true,
    'old_status', _request.status,
    'new_status', _new_status,
    'request_id', _request_id
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.transition_request_status TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_setup_completed TO authenticated, anon;
