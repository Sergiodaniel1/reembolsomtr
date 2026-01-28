
-- Tabela de Logs de Auditoria
CREATE TABLE public.audit_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  old_data JSONB,
  new_data JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- RLS para audit_logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apenas admins podem ver logs
CREATE POLICY "Admins podem ver todos os logs"
ON public.audit_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- Sistema pode inserir logs (via trigger ou edge function)
CREATE POLICY "Sistema pode inserir logs"
ON public.audit_logs
FOR INSERT
WITH CHECK (true);

-- Ninguém pode deletar ou atualizar logs (imutabilidade)
-- (Não criamos políticas de UPDATE/DELETE, então ficam bloqueadas por padrão)

-- Função para registrar log automaticamente
CREATE OR REPLACE FUNCTION public.log_audit_action(
  _action TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id UUID DEFAULT NULL,
  _old_data JSONB DEFAULT NULL,
  _new_data JSONB DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_email TEXT;
  _user_role TEXT;
  _log_id UUID;
BEGIN
  -- Get user email from profiles
  SELECT email INTO _user_email 
  FROM profiles 
  WHERE user_id = auth.uid();
  
  -- Get primary role
  SELECT role::TEXT INTO _user_role 
  FROM user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  INSERT INTO audit_logs (user_id, user_email, user_role, action, entity_type, entity_id, old_data, new_data)
  VALUES (auth.uid(), _user_email, _user_role, _action, _entity_type, _entity_id, _old_data, _new_data)
  RETURNING id INTO _log_id;
  
  RETURN _log_id;
END;
$$;

-- Trigger para logar mudanças de status em reembolsos
CREATE OR REPLACE FUNCTION public.log_reimbursement_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM log_audit_action(
      'reimbursement_status_change',
      'reimbursement_requests',
      NEW.id,
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_reimbursement_status
AFTER UPDATE ON public.reimbursement_requests
FOR EACH ROW
EXECUTE FUNCTION public.log_reimbursement_status_change();

-- Trigger para logar criação de usuários
CREATE OR REPLACE FUNCTION public.log_profile_creation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO audit_logs (user_id, user_email, action, entity_type, entity_id, new_data)
  VALUES (
    NEW.user_id, 
    NEW.email, 
    'user_created', 
    'profiles', 
    NEW.id,
    jsonb_build_object('full_name', NEW.full_name, 'email', NEW.email)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_profile_creation
AFTER INSERT ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.log_profile_creation();
