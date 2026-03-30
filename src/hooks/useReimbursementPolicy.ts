import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ExpenseType, EXPENSE_TYPE_LABELS } from '@/types/reimbursement';

export interface CategoryLimit {
  category: ExpenseType;
  maxAmount: number;
  requiresSpecialApproval: number; // above this value requires special approval
}

export interface ReimbursementPolicy {
  maxSubmissionDays: number; // max days after expense_date to submit
  requireReceipt: boolean;
  specialApprovalThreshold: number; // global threshold
  categoryLimits: Record<string, CategoryLimit>;
  allowedCategories: ExpenseType[];
}

const DEFAULT_POLICY: ReimbursementPolicy = {
  maxSubmissionDays: 30,
  requireReceipt: true,
  specialApprovalThreshold: 5000,
  categoryLimits: {},
  allowedCategories: Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[],
};

export interface PolicyViolation {
  type: 'block' | 'warning';
  code: string;
  message: string;
}

export function useReimbursementPolicy() {
  const { data: policy = DEFAULT_POLICY, isLoading } = useQuery({
    queryKey: ['reimbursement-policy'],
    queryFn: async () => {
      const { data } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', [
          'reimbursement_policy',
          'require_receipt',
          'max_reimbursement_amount',
        ]);

      const settings: Record<string, any> = {};
      (data || []).forEach(s => {
        const val = s.value as Record<string, unknown>;
        settings[s.key] = val?.value ?? val;
      });

      const policyData = settings.reimbursement_policy;
      if (policyData && typeof policyData === 'object') {
        return {
          maxSubmissionDays: policyData.maxSubmissionDays ?? DEFAULT_POLICY.maxSubmissionDays,
          requireReceipt: settings.require_receipt ?? policyData.requireReceipt ?? DEFAULT_POLICY.requireReceipt,
          specialApprovalThreshold: policyData.specialApprovalThreshold ?? DEFAULT_POLICY.specialApprovalThreshold,
          categoryLimits: policyData.categoryLimits ?? DEFAULT_POLICY.categoryLimits,
          allowedCategories: policyData.allowedCategories ?? DEFAULT_POLICY.allowedCategories,
        } as ReimbursementPolicy;
      }

      return {
        ...DEFAULT_POLICY,
        requireReceipt: settings.require_receipt ?? DEFAULT_POLICY.requireReceipt,
        specialApprovalThreshold: settings.max_reimbursement_amount ?? DEFAULT_POLICY.specialApprovalThreshold,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  function validateRequest(params: {
    expenseType: ExpenseType;
    amount: number;
    expenseDate: string;
    receiptCount: number;
    isDraft: boolean;
  }): PolicyViolation[] {
    const violations: PolicyViolation[] = [];

    // Check allowed categories
    if (policy.allowedCategories.length > 0 && !policy.allowedCategories.includes(params.expenseType)) {
      violations.push({
        type: 'block',
        code: 'category_not_allowed',
        message: `A categoria "${EXPENSE_TYPE_LABELS[params.expenseType]}" não é permitida pela política atual.`,
      });
    }

    // Check category limit
    const catLimit = policy.categoryLimits[params.expenseType];
    if (catLimit && params.amount > catLimit.maxAmount) {
      violations.push({
        type: 'block',
        code: 'category_limit_exceeded',
        message: `O valor excede o limite de R$ ${catLimit.maxAmount.toFixed(2)} para ${EXPENSE_TYPE_LABELS[params.expenseType]}.`,
      });
    }

    // Check submission deadline
    if (params.expenseDate && policy.maxSubmissionDays > 0) {
      const expDate = new Date(params.expenseDate);
      const today = new Date();
      const diffDays = Math.floor((today.getTime() - expDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > policy.maxSubmissionDays) {
        violations.push({
          type: 'block',
          code: 'submission_deadline_exceeded',
          message: `O prazo de ${policy.maxSubmissionDays} dias para envio após a data da despesa foi ultrapassado (${diffDays} dias).`,
        });
      }
    }

    // Check receipt requirement (only on submit, not draft)
    if (!params.isDraft && policy.requireReceipt && params.receiptCount === 0) {
      violations.push({
        type: 'block',
        code: 'receipt_required',
        message: 'É obrigatório anexar pelo menos um comprovante para enviar a solicitação.',
      });
    }

    // Warning: special approval threshold
    if (params.amount > policy.specialApprovalThreshold) {
      violations.push({
        type: 'warning',
        code: 'special_approval_needed',
        message: `Valor acima de R$ ${policy.specialApprovalThreshold.toFixed(2)} — requer aprovação especial.`,
      });
    }

    // Warning: category special approval
    if (catLimit && catLimit.requiresSpecialApproval > 0 && params.amount > catLimit.requiresSpecialApproval) {
      violations.push({
        type: 'warning',
        code: 'category_special_approval',
        message: `Valor acima de R$ ${catLimit.requiresSpecialApproval.toFixed(2)} para ${EXPENSE_TYPE_LABELS[params.expenseType]} requer atenção especial.`,
      });
    }

    return violations;
  }

  function getRequestAlerts(params: {
    expenseType: ExpenseType;
    amount: number;
    expenseDate: string;
    receiptCount: number;
  }): PolicyViolation[] {
    // For display purposes (always shows warnings, never blocks)
    return validateRequest({ ...params, isDraft: true }).filter(v => v.type === 'warning');
  }

  return { policy, isLoading, validateRequest, getRequestAlerts };
}
