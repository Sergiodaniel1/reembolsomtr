import { describe, it, expect } from 'vitest';
import { STATUS_LABELS, EXPENSE_TYPE_LABELS, ROLE_LABELS, ReimbursementStatus, AppRole } from '@/types/reimbursement';

describe('Status consistency', () => {
  const ALL_STATUSES: ReimbursementStatus[] = [
    'rascunho', 'enviado', 'em_aprovacao_gerente', 'ajuste_solicitado',
    'em_aprovacao_financeiro', 'aprovado', 'reprovado', 'pago',
  ];

  it('STATUS_LABELS covers all statuses', () => {
    ALL_STATUSES.forEach(status => {
      expect(STATUS_LABELS[status]).toBeDefined();
      expect(STATUS_LABELS[status].length).toBeGreaterThan(0);
    });
  });

  it('No extra statuses in STATUS_LABELS', () => {
    const keys = Object.keys(STATUS_LABELS);
    expect(keys.sort()).toEqual([...ALL_STATUSES].sort());
  });

  it('EXPENSE_TYPE_LABELS has all types', () => {
    const types = ['viagem', 'alimentacao', 'transporte', 'hospedagem', 'material', 'servicos', 'outros'];
    types.forEach(t => {
      expect(EXPENSE_TYPE_LABELS[t as keyof typeof EXPENSE_TYPE_LABELS]).toBeDefined();
    });
  });

  it('ROLE_LABELS covers all roles', () => {
    const roles: AppRole[] = ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'];
    roles.forEach(role => {
      expect(ROLE_LABELS[role]).toBeDefined();
    });
  });
});

describe('Status transition map (expected valid transitions)', () => {
  const VALID_TRANSITIONS: Record<string, string[]> = {
    rascunho: ['enviado'],
    enviado: ['em_aprovacao_gerente'],
    em_aprovacao_gerente: ['em_aprovacao_financeiro', 'reprovado', 'ajuste_solicitado'],
    ajuste_solicitado: ['em_aprovacao_gerente', 'rascunho'],
    em_aprovacao_financeiro: ['aprovado', 'reprovado'],
    aprovado: ['pago'],
    reprovado: [],
    pago: [],
  };

  it('final statuses have no outgoing transitions', () => {
    expect(VALID_TRANSITIONS['reprovado']).toEqual([]);
    expect(VALID_TRANSITIONS['pago']).toEqual([]);
  });

  it('all statuses are accounted for', () => {
    const keys = Object.keys(VALID_TRANSITIONS).sort();
    const expected = Object.keys(STATUS_LABELS).sort();
    expect(keys).toEqual(expected);
  });
});
