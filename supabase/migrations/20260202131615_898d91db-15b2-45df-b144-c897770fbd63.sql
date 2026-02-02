-- =====================================================
-- 1) TRIGGER: Validar transições de status (fluxo travado)
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_role app_role;
BEGIN
  -- Get the role of the current user
  SELECT role INTO _user_role 
  FROM public.user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  -- If status hasn't changed, allow the update
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;

  -- Block editing after final states (aprovado, reprovado, pago)
  IF OLD.status IN ('aprovado', 'reprovado', 'pago') THEN
    RAISE EXCEPTION 'Não é permitido alterar solicitações com status final (%, %, %)', 'aprovado', 'reprovado', 'pago';
  END IF;

  -- Define valid transitions based on current status and user role
  CASE OLD.status
    -- From rascunho: only owner can submit (enviado)
    WHEN 'rascunho' THEN
      IF NEW.status NOT IN ('enviado') THEN
        RAISE EXCEPTION 'Transição inválida: de % para %', OLD.status, NEW.status;
      END IF;
      IF OLD.user_id != auth.uid() AND _user_role != 'admin' THEN
        RAISE EXCEPTION 'Apenas o proprietário pode enviar um rascunho';
      END IF;

    -- From enviado: goes to em_aprovacao_gerente (automatic or manual)
    WHEN 'enviado' THEN
      IF NEW.status NOT IN ('em_aprovacao_gerente') THEN
        RAISE EXCEPTION 'Transição inválida: de % para %', OLD.status, NEW.status;
      END IF;

    -- From em_aprovacao_gerente: manager can approve, reject, or request adjustment
    WHEN 'em_aprovacao_gerente' THEN
      IF NEW.status NOT IN ('em_aprovacao_financeiro', 'reprovado', 'ajuste_solicitado') THEN
        RAISE EXCEPTION 'Transição inválida: de % para %', OLD.status, NEW.status;
      END IF;
      -- Check if user is manager or admin
      IF NOT (has_any_role(auth.uid(), ARRAY['gerente'::app_role, 'admin'::app_role]) OR is_manager_of_requester(OLD.id)) THEN
        RAISE EXCEPTION 'Apenas gerentes podem aprovar/reprovar nesta etapa';
      END IF;
      -- Require comment for rejection
      IF NEW.status = 'reprovado' AND (NEW.manager_comment IS NULL OR NEW.manager_comment = '') THEN
        RAISE EXCEPTION 'Comentário obrigatório para reprovação';
      END IF;

    -- From ajuste_solicitado: owner can resubmit
    WHEN 'ajuste_solicitado' THEN
      IF NEW.status NOT IN ('em_aprovacao_gerente', 'rascunho') THEN
        RAISE EXCEPTION 'Transição inválida: de % para %', OLD.status, NEW.status;
      END IF;
      IF OLD.user_id != auth.uid() AND _user_role != 'admin' THEN
        RAISE EXCEPTION 'Apenas o proprietário pode reenviar após ajuste';
      END IF;

    -- From em_aprovacao_financeiro: finance can approve, reject
    WHEN 'em_aprovacao_financeiro' THEN
      IF NEW.status NOT IN ('aprovado', 'reprovado') THEN
        RAISE EXCEPTION 'Transição inválida: de % para %', OLD.status, NEW.status;
      END IF;
      -- Check if user is finance or admin
      IF NOT has_any_role(auth.uid(), ARRAY['financeiro'::app_role, 'admin'::app_role]) THEN
        RAISE EXCEPTION 'Apenas financeiro pode aprovar/reprovar nesta etapa';
      END IF;
      -- Require comment for rejection
      IF NEW.status = 'reprovado' AND (NEW.finance_comment IS NULL OR NEW.finance_comment = '') THEN
        RAISE EXCEPTION 'Comentário obrigatório para reprovação';
      END IF;
      -- Set approved_at timestamp
      IF NEW.status = 'aprovado' THEN
        NEW.approved_at = now();
      END IF;

    -- From aprovado: finance can mark as paid
    WHEN 'aprovado' THEN
      IF NEW.status NOT IN ('pago') THEN
        RAISE EXCEPTION 'Transição inválida: de % para %', OLD.status, NEW.status;
      END IF;
      IF NOT has_any_role(auth.uid(), ARRAY['financeiro'::app_role, 'admin'::app_role]) THEN
        RAISE EXCEPTION 'Apenas financeiro pode marcar como pago';
      END IF;
      -- Require payment info
      IF NEW.payment_method IS NULL OR NEW.payment_date IS NULL THEN
        RAISE EXCEPTION 'Informações de pagamento obrigatórias';
      END IF;
      NEW.paid_at = now();

    ELSE
      RAISE EXCEPTION 'Status desconhecido: %', OLD.status;
  END CASE;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS validate_reimbursement_status ON public.reimbursement_requests;

-- Create trigger
CREATE TRIGGER validate_reimbursement_status
  BEFORE UPDATE ON public.reimbursement_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_status_transition();

-- =====================================================
-- 2) TRIGGER: Proteger último admin
-- =====================================================

CREATE OR REPLACE FUNCTION public.protect_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_count INTEGER;
BEGIN
  -- On DELETE: check if this is the last admin
  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      SELECT COUNT(*) INTO _admin_count 
      FROM public.user_roles 
      WHERE role = 'admin' AND id != OLD.id;
      
      IF _admin_count = 0 THEN
        RAISE EXCEPTION 'Não é possível remover o último administrador do sistema';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- On UPDATE: check if changing from admin would leave no admins
  IF TG_OP = 'UPDATE' THEN
    IF OLD.role = 'admin' AND NEW.role != 'admin' THEN
      SELECT COUNT(*) INTO _admin_count 
      FROM public.user_roles 
      WHERE role = 'admin' AND id != OLD.id;
      
      IF _admin_count = 0 THEN
        RAISE EXCEPTION 'Não é possível remover o cargo de administrador: é o último admin do sistema';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS protect_last_admin_trigger ON public.user_roles;

-- Create trigger
CREATE TRIGGER protect_last_admin_trigger
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_last_admin();

-- =====================================================
-- 3) TRIGGERS: Auditoria completa
-- =====================================================

-- Trigger for role changes
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit_action(
      'role_assigned',
      'user_roles',
      NEW.id,
      NULL,
      jsonb_build_object('user_id', NEW.user_id, 'role', NEW.role)
    );
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.role IS DISTINCT FROM NEW.role THEN
      PERFORM log_audit_action(
        'role_changed',
        'user_roles',
        NEW.id,
        jsonb_build_object('role', OLD.role),
        jsonb_build_object('role', NEW.role)
      );
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit_action(
      'role_removed',
      'user_roles',
      OLD.id,
      jsonb_build_object('user_id', OLD.user_id, 'role', OLD.role),
      NULL
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS log_role_changes ON public.user_roles;
CREATE TRIGGER log_role_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_role_change();

-- Trigger for profile deactivation
CREATE OR REPLACE FUNCTION public.log_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Log activation/deactivation
    IF OLD.active IS DISTINCT FROM NEW.active THEN
      PERFORM log_audit_action(
        CASE WHEN NEW.active THEN 'user_activated' ELSE 'user_deactivated' END,
        'profiles',
        NEW.id,
        jsonb_build_object('active', OLD.active),
        jsonb_build_object('active', NEW.active)
      );
    END IF;
    
    -- Log manager changes
    IF OLD.manager_id IS DISTINCT FROM NEW.manager_id THEN
      PERFORM log_audit_action(
        'manager_changed',
        'profiles',
        NEW.id,
        jsonb_build_object('manager_id', OLD.manager_id),
        jsonb_build_object('manager_id', NEW.manager_id)
      );
    END IF;
    
    -- Log department changes
    IF OLD.department_id IS DISTINCT FROM NEW.department_id THEN
      PERFORM log_audit_action(
        'department_changed',
        'profiles',
        NEW.id,
        jsonb_build_object('department_id', OLD.department_id),
        jsonb_build_object('department_id', NEW.department_id)
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_profile_changes ON public.profiles;
CREATE TRIGGER log_profile_changes
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_changes();

-- Trigger for system settings changes
CREATE OR REPLACE FUNCTION public.log_settings_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.value IS DISTINCT FROM NEW.value THEN
      PERFORM log_audit_action(
        'settings_changed',
        'system_settings',
        NEW.id,
        jsonb_build_object('key', OLD.key, 'value', OLD.value),
        jsonb_build_object('key', NEW.key, 'value', NEW.value)
      );
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    PERFORM log_audit_action(
      'settings_created',
      'system_settings',
      NEW.id,
      NULL,
      jsonb_build_object('key', NEW.key, 'value', NEW.value)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS log_settings_changes ON public.system_settings;
CREATE TRIGGER log_settings_changes
  AFTER INSERT OR UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.log_settings_change();

-- =====================================================
-- 4) ATUALIZAR RLS para maior segurança
-- =====================================================

-- Reforçar política de reimbursement_requests para update
DROP POLICY IF EXISTS "Usuários podem atualizar próprias solicitações em rascunho" ON public.reimbursement_requests;

CREATE POLICY "Usuários podem atualizar próprias solicitações em rascunho"
ON public.reimbursement_requests
FOR UPDATE
TO authenticated
USING (
  -- Owner can update drafts and adjustment requests
  (user_id = auth.uid() AND status IN ('rascunho', 'ajuste_solicitado'))
  -- Manager can update when pending manager approval
  OR (is_manager_of_requester(id) AND status = 'em_aprovacao_gerente')
  -- Finance can update when pending finance approval or approved (for payment)
  OR (has_role(auth.uid(), 'financeiro') AND status IN ('em_aprovacao_financeiro', 'aprovado'))
  -- Admin has full access
  OR has_role(auth.uid(), 'admin')
);

-- Add policy for gerente to update manager approval status
DROP POLICY IF EXISTS "Gerentes podem aprovar solicitações de subordinados" ON public.reimbursement_requests;

CREATE POLICY "Gerentes podem aprovar solicitações de subordinados"
ON public.reimbursement_requests
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'gerente') 
  AND is_manager_of_requester(id) 
  AND status = 'em_aprovacao_gerente'
)
WITH CHECK (
  has_role(auth.uid(), 'gerente') 
  AND is_manager_of_requester(id)
);