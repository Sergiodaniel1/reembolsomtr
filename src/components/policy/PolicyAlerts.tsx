import React from 'react';
import { AlertTriangle, ShieldAlert, Info } from 'lucide-react';
import { PolicyViolation } from '@/hooks/useReimbursementPolicy';
import { cn } from '@/lib/utils';

interface PolicyAlertsProps {
  violations: PolicyViolation[];
  className?: string;
  compact?: boolean;
}

export function PolicyAlerts({ violations, className, compact = false }: PolicyAlertsProps) {
  if (violations.length === 0) return null;

  const blocks = violations.filter(v => v.type === 'block');
  const warnings = violations.filter(v => v.type === 'warning');

  if (compact) {
    return (
      <div className={cn('flex flex-wrap gap-1.5', className)}>
        {blocks.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium">
            <ShieldAlert className="h-3 w-3" />
            {v.code === 'category_limit_exceeded' ? 'Limite excedido' :
             v.code === 'submission_deadline_exceeded' ? 'Prazo expirado' :
             v.code === 'receipt_required' ? 'Sem comprovante' :
             v.code === 'category_not_allowed' ? 'Categoria bloqueada' : 'Bloqueio'}
          </span>
        ))}
        {warnings.map((v, i) => (
          <span key={i} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-warning/10 text-warning font-medium">
            <AlertTriangle className="h-3 w-3" />
            {v.code === 'special_approval_needed' ? 'Valor alto' :
             v.code === 'category_special_approval' ? 'Atenção especial' : 'Alerta'}
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {blocks.map((v, i) => (
        <div key={`b-${i}`} className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <ShieldAlert className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-sm text-destructive">{v.message}</p>
        </div>
      ))}
      {warnings.map((v, i) => (
        <div key={`w-${i}`} className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
          <p className="text-sm text-foreground">{v.message}</p>
        </div>
      ))}
    </div>
  );
}
