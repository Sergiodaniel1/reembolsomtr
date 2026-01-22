// Tipos do sistema de reembolso

export type AppRole = 'usuario' | 'gerente' | 'financeiro' | 'admin' | 'diretoria';

export type ReimbursementStatus = 
  | 'rascunho'
  | 'enviado'
  | 'em_aprovacao_gerente'
  | 'ajuste_solicitado'
  | 'em_aprovacao_financeiro'
  | 'aprovado'
  | 'reprovado'
  | 'pago';

export type ExpenseType = 
  | 'viagem'
  | 'alimentacao'
  | 'transporte'
  | 'hospedagem'
  | 'material'
  | 'servicos'
  | 'outros';

export interface Profile {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  department_id?: string;
  manager_id?: string;
  avatar_url?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export interface Department {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface CostCenter {
  id: string;
  code: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface ReimbursementRequest {
  id: string;
  user_id: string;
  title: string;
  description?: string;
  expense_type: ExpenseType;
  category?: string;
  amount: number;
  expense_date: string;
  cost_center_id?: string;
  status: ReimbursementStatus;
  receipt_urls: string[];
  manager_comment?: string;
  finance_comment?: string;
  payment_date?: string;
  payment_method?: string;
  payment_proof_url?: string;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  approved_at?: string;
  paid_at?: string;
  // Joins
  profiles?: Profile;
  cost_centers?: CostCenter;
}

export interface ReimbursementHistory {
  id: string;
  request_id: string;
  user_id: string;
  action: string;
  old_status?: ReimbursementStatus;
  new_status?: ReimbursementStatus;
  comment?: string;
  created_at: string;
  // Joins
  profiles?: Profile;
}

export interface EmailTemplate {
  id: string;
  trigger_status: ReimbursementStatus;
  subject: string;
  body: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// Status helpers
export const STATUS_LABELS: Record<ReimbursementStatus, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_aprovacao_gerente: 'Em Aprovação (Gerente)',
  ajuste_solicitado: 'Ajuste Solicitado',
  em_aprovacao_financeiro: 'Em Aprovação (Financeiro)',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  pago: 'Pago',
};

export const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  viagem: 'Viagem',
  alimentacao: 'Alimentação',
  transporte: 'Transporte',
  hospedagem: 'Hospedagem',
  material: 'Material',
  servicos: 'Serviços',
  outros: 'Outros',
};

export const ROLE_LABELS: Record<AppRole, string> = {
  usuario: 'Usuário',
  gerente: 'Gerente',
  financeiro: 'Financeiro',
  admin: 'Administrador',
  diretoria: 'Diretoria',
};
