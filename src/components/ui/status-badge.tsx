import React from 'react';
import { cn } from '@/lib/utils';
import { ReimbursementStatus, STATUS_LABELS } from '@/types/reimbursement';
import {
  FileEdit,
  Send,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  DollarSign,
} from 'lucide-react';

interface StatusBadgeProps {
  status: ReimbursementStatus;
  className?: string;
  showIcon?: boolean;
}

const statusConfig: Record<ReimbursementStatus, {
  className: string;
  icon: React.ComponentType<{ className?: string }>;
}> = {
  rascunho: {
    className: 'status-rascunho',
    icon: FileEdit,
  },
  enviado: {
    className: 'status-enviado',
    icon: Send,
  },
  em_aprovacao_gerente: {
    className: 'status-em_aprovacao_gerente',
    icon: Clock,
  },
  ajuste_solicitado: {
    className: 'status-ajuste_solicitado',
    icon: AlertCircle,
  },
  em_aprovacao_financeiro: {
    className: 'status-em_aprovacao_financeiro',
    icon: Clock,
  },
  aprovado: {
    className: 'status-aprovado',
    icon: CheckCircle,
  },
  reprovado: {
    className: 'status-reprovado',
    icon: XCircle,
  },
  pago: {
    className: 'status-pago',
    icon: DollarSign,
  },
};

export function StatusBadge({ status, className, showIcon = true }: StatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <span className={cn('status-badge', config.className, className)}>
      {showIcon && <Icon className="h-3.5 w-3.5" />}
      {STATUS_LABELS[status]}
    </span>
  );
}
