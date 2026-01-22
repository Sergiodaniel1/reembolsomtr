-- =============================================
-- SISTEMA DE REEMBOLSO CORPORATIVO
-- =============================================

-- 1. TIPOS ENUM
CREATE TYPE public.app_role AS ENUM ('usuario', 'gerente', 'financeiro', 'admin', 'diretoria');
CREATE TYPE public.reimbursement_status AS ENUM (
  'rascunho', 
  'enviado', 
  'em_aprovacao_gerente', 
  'ajuste_solicitado', 
  'em_aprovacao_financeiro', 
  'aprovado', 
  'reprovado', 
  'pago'
);
CREATE TYPE public.expense_type AS ENUM (
  'viagem', 
  'alimentacao', 
  'transporte', 
  'hospedagem', 
  'material', 
  'servicos', 
  'outros'
);

-- 2. TABELA DE DEPARTAMENTOS
CREATE TABLE public.departments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 3. TABELA DE CENTROS DE CUSTO
CREATE TABLE public.cost_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 4. TABELA DE PERFIS
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  department_id UUID REFERENCES public.departments(id),
  manager_id UUID REFERENCES public.profiles(id),
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 5. TABELA DE CARGOS/ROLES
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

-- 6. TABELA DE SOLICITAÇÕES DE REEMBOLSO
CREATE TABLE public.reimbursement_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  expense_type expense_type NOT NULL DEFAULT 'outros',
  category TEXT,
  amount DECIMAL(12,2) NOT NULL,
  expense_date DATE NOT NULL,
  cost_center_id UUID REFERENCES public.cost_centers(id),
  status reimbursement_status NOT NULL DEFAULT 'rascunho',
  receipt_urls TEXT[] DEFAULT '{}',
  manager_comment TEXT,
  finance_comment TEXT,
  payment_date DATE,
  payment_method TEXT,
  payment_proof_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  submitted_at TIMESTAMP WITH TIME ZONE,
  approved_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE
);

-- 7. TABELA DE HISTÓRICO/AUDITORIA
CREATE TABLE public.reimbursement_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  request_id UUID REFERENCES public.reimbursement_requests(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  action TEXT NOT NULL,
  old_status reimbursement_status,
  new_status reimbursement_status,
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 8. TABELA DE CONFIGURAÇÕES DE EMAIL
CREATE TABLE public.email_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trigger_status reimbursement_status NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 9. FUNÇÃO PARA VERIFICAR CARGO
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- 10. FUNÇÃO PARA VERIFICAR MÚLTIPLOS CARGOS
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id UUID, _roles app_role[])
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = ANY(_roles)
  )
$$;

-- 11. FUNÇÃO PARA OBTER PERFIL DO USUÁRIO
CREATE OR REPLACE FUNCTION public.get_user_profile(_user_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = _user_id LIMIT 1
$$;

-- 12. FUNÇÃO PARA VERIFICAR SE É GERENTE DO SOLICITANTE
CREATE OR REPLACE FUNCTION public.is_manager_of_requester(_request_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.reimbursement_requests r
    JOIN public.profiles p ON r.user_id = p.user_id
    JOIN public.profiles m ON p.manager_id = m.id
    WHERE r.id = _request_id
      AND m.user_id = auth.uid()
  )
$$;

-- 13. FUNÇÃO PARA ATUALIZAR TIMESTAMPS
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- 14. TRIGGERS PARA UPDATED_AT
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_departments_updated_at
  BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reimbursement_requests_updated_at
  BEFORE UPDATE ON public.reimbursement_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_email_templates_updated_at
  BEFORE UPDATE ON public.email_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 15. TRIGGER PARA CRIAR PERFIL AUTOMATICAMENTE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  
  -- Atribuir cargo padrão de usuário
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'usuario');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 16. HABILITAR RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reimbursement_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_templates ENABLE ROW LEVEL SECURITY;

-- 17. POLÍTICAS RLS - PROFILES
CREATE POLICY "Usuários podem ver todos os perfis"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar perfis"
  ON public.profiles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Usuários podem atualizar próprio perfil"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 18. POLÍTICAS RLS - USER_ROLES
CREATE POLICY "Usuários podem ver seus cargos"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins podem gerenciar cargos"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 19. POLÍTICAS RLS - DEPARTMENTS
CREATE POLICY "Todos autenticados podem ver departamentos"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar departamentos"
  ON public.departments FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 20. POLÍTICAS RLS - COST_CENTERS
CREATE POLICY "Todos autenticados podem ver centros de custo"
  ON public.cost_centers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins podem gerenciar centros de custo"
  ON public.cost_centers FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 21. POLÍTICAS RLS - REIMBURSEMENT_REQUESTS
CREATE POLICY "Usuários podem ver próprias solicitações"
  ON public.reimbursement_requests FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_any_role(auth.uid(), ARRAY['admin', 'financeiro']::app_role[])
    OR public.is_manager_of_requester(id)
  );

CREATE POLICY "Usuários podem criar próprias solicitações"
  ON public.reimbursement_requests FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Usuários podem atualizar próprias solicitações em rascunho ou ajuste"
  ON public.reimbursement_requests FOR UPDATE
  TO authenticated
  USING (
    (user_id = auth.uid() AND status IN ('rascunho', 'ajuste_solicitado'))
    OR public.has_any_role(auth.uid(), ARRAY['admin', 'gerente', 'financeiro']::app_role[])
  );

CREATE POLICY "Usuários podem deletar próprios rascunhos"
  ON public.reimbursement_requests FOR DELETE
  TO authenticated
  USING (user_id = auth.uid() AND status = 'rascunho');

-- 22. POLÍTICAS RLS - REIMBURSEMENT_HISTORY
CREATE POLICY "Usuários podem ver histórico de suas solicitações"
  ON public.reimbursement_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.reimbursement_requests r
      WHERE r.id = request_id
      AND (
        r.user_id = auth.uid()
        OR public.has_any_role(auth.uid(), ARRAY['admin', 'financeiro']::app_role[])
        OR public.is_manager_of_requester(r.id)
      )
    )
  );

CREATE POLICY "Sistema pode inserir histórico"
  ON public.reimbursement_history FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 23. POLÍTICAS RLS - EMAIL_TEMPLATES
CREATE POLICY "Admins podem gerenciar templates de email"
  ON public.email_templates FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 24. STORAGE BUCKET PARA COMPROVANTES
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false);

-- 25. POLÍTICAS DE STORAGE
CREATE POLICY "Usuários podem fazer upload de comprovantes"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Usuários podem ver seus comprovantes"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'receipts' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_any_role(auth.uid(), ARRAY['admin', 'financeiro', 'gerente']::app_role[])
  ));

CREATE POLICY "Usuários podem deletar seus comprovantes"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 26. DADOS INICIAIS
INSERT INTO public.departments (name, description) VALUES
  ('Tecnologia', 'Departamento de TI e Desenvolvimento'),
  ('Comercial', 'Vendas e Atendimento ao Cliente'),
  ('Financeiro', 'Controladoria e Finanças'),
  ('RH', 'Recursos Humanos'),
  ('Marketing', 'Marketing e Comunicação'),
  ('Operações', 'Logística e Operações');

INSERT INTO public.cost_centers (code, name) VALUES
  ('CC001', 'Projetos de TI'),
  ('CC002', 'Vendas Diretas'),
  ('CC003', 'Administrativo'),
  ('CC004', 'Marketing Digital'),
  ('CC005', 'Eventos Corporativos'),
  ('CC006', 'Viagens de Negócio');

INSERT INTO public.email_templates (trigger_status, subject, body) VALUES
  ('enviado', 'Nova Solicitação de Reembolso Recebida', 'Olá {{nome}}, sua solicitação #{{id}} foi recebida e será analisada pelo seu gerente.'),
  ('aprovado', 'Solicitação de Reembolso Aprovada', 'Parabéns {{nome}}! Sua solicitação #{{id}} foi aprovada.'),
  ('reprovado', 'Solicitação de Reembolso Reprovada', 'Olá {{nome}}, infelizmente sua solicitação #{{id}} foi reprovada. Motivo: {{comentario}}'),
  ('ajuste_solicitado', 'Ajuste Solicitado na Sua Solicitação', 'Olá {{nome}}, sua solicitação #{{id}} precisa de ajustes. Verifique: {{comentario}}'),
  ('pago', 'Reembolso Pago', 'Olá {{nome}}, o reembolso referente à solicitação #{{id}} foi processado e pago!');