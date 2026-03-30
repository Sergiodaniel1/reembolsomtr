import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ReceiptPreviewItem } from '@/components/receipts/ReceiptPreviewItem';
import { PolicyAlerts } from '@/components/policy/PolicyAlerts';
import { useReimbursementPolicy } from '@/hooks/useReimbursementPolicy';
import {
  ReimbursementRequest,
  EXPENSE_TYPE_LABELS,
  STATUS_LABELS,
  Profile,
  ReimbursementHistory,
  ReimbursementStatus,
  ExpenseType,
} from '@/types/reimbursement';
import { format, differenceInDays, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  User,
  Calendar,
  DollarSign,
  FileText,
  Clock,
  Paperclip,
  MessageSquare,
  CalendarCheck,
  CreditCard,
  Timer,
} from 'lucide-react';

interface RequestDetailDialogProps {
  request: (ReimbursementRequest & { profiles?: Profile }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children?: React.ReactNode;
}

const HISTORY_ACTION_LABELS: Record<string, string> = {
  'approved_by_manager': 'Aprovada pelo Gerente',
  'rejected_by_manager': 'Reprovada pelo Gerente',
  'adjustment_requested': 'Ajuste Solicitado',
  'approved_by_finance': 'Aprovada pelo Financeiro',
  'rejected_by_finance': 'Reprovada pelo Financeiro',
  'marked_as_paid': 'Marcada como Paga',
  'Solicitação criada como rascunho': 'Criada como Rascunho',
  'Solicitação enviada para aprovação': 'Enviada para Aprovação',
  'resubmitted_after_adjustment': 'Reenviada após Ajuste',
};

export function RequestDetailDialog({
  request,
  open,
  onOpenChange,
  children,
}: RequestDetailDialogProps) {
  const { getRequestAlerts } = useReimbursementPolicy();

  const { data: history = [], isLoading: historyLoading } = useQuery({
    queryKey: ['request-history', request?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_history')
        .select('*')
        .eq('request_id', request!.id)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const userIds = [...new Set((data || []).map(h => h.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p.full_name]));

      return (data || []).map(h => ({
        ...h,
        profiles: { full_name: profileMap.get(h.user_id) || 'Sistema' } as Profile,
      })) as ReimbursementHistory[];
    },
    enabled: !!request?.id && open,
  });

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  if (!request) return null;

  const receiptUrls = request.receipt_urls || [];

  // Policy alerts
  const policyAlerts = getRequestAlerts({
    expenseType: request.expense_type,
    amount: Number(request.amount),
    expenseDate: request.expense_date,
    receiptCount: receiptUrls.length,
  });

  // Calculate processing times
  const createdAt = new Date(request.created_at);
  const submittedAt = request.submitted_at ? new Date(request.submitted_at) : null;
  const approvedAt = request.approved_at ? new Date(request.approved_at) : null;
  const paidAt = request.paid_at ? new Date(request.paid_at) : null;

  const getProcessingTime = () => {
    if (paidAt && submittedAt) {
      const days = differenceInDays(paidAt, submittedAt);
      return `${days} dia(s) do envio ao pagamento`;
    }
    if (approvedAt && submittedAt) {
      const days = differenceInDays(approvedAt, submittedAt);
      return `${days} dia(s) do envio à aprovação`;
    }
    if (submittedAt) {
      const days = differenceInDays(new Date(), submittedAt);
      return `${days} dia(s) em processamento`;
    }
    return null;
  };

  const processingTime = getProcessingTime();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <span className="truncate">{request.title}</span>
            <StatusBadge status={request.status} />
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-6">
            {/* Policy Alerts */}
            {policyAlerts.length > 0 && (
              <PolicyAlerts violations={policyAlerts} />
            )}

            {/* Basic Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-start gap-2">
                <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Solicitante</p>
                  <p className="text-sm font-medium">{request.profiles?.full_name || '—'}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Valor</p>
                  <p className="text-sm font-semibold">{formatCurrency(Number(request.amount))}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Tipo de Despesa</p>
                  <p className="text-sm">{EXPENSE_TYPE_LABELS[request.expense_type]}</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Data da Despesa</p>
                  <p className="text-sm">{format(new Date(request.expense_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                </div>
              </div>
            </div>

            {/* Key Dates */}
            <Separator />
            <div className="space-y-2">
              <p className="text-sm font-medium flex items-center gap-2">
                <Timer className="h-4 w-4 text-muted-foreground" />
                Datas do Processo
              </p>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-muted-foreground">Criada:</span>
                  <span>{format(createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                </div>
                {submittedAt && (
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Enviada:</span>
                    <span>{format(submittedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
                {approvedAt && (
                  <div className="flex items-center gap-2">
                    <CalendarCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Aprovada:</span>
                    <span>{format(approvedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
                {paidAt && (
                  <div className="flex items-center gap-2">
                    <CreditCard className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">Paga:</span>
                    <span>{format(paidAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                  </div>
                )}
              </div>
              {processingTime && (
                <p className="text-xs text-muted-foreground italic mt-1">⏱ {processingTime}</p>
              )}
            </div>

            {/* Description */}
            {request.description && (
              <>
                <Separator />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Descrição / Justificativa</p>
                  <p className="text-sm bg-muted rounded-lg p-3">{request.description}</p>
                </div>
              </>
            )}

            {/* Manager Comment */}
            {request.manager_comment && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Comentário do Gerente</p>
                <p className="text-sm bg-muted rounded-lg p-3">{request.manager_comment}</p>
              </div>
            )}

            {/* Finance Comment */}
            {request.finance_comment && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Comentário do Financeiro</p>
                <p className="text-sm bg-muted rounded-lg p-3">{request.finance_comment}</p>
              </div>
            )}

            {/* Payment Info */}
            {request.payment_method && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">Dados do Pagamento</p>
                <div className="text-sm bg-muted rounded-lg p-3 space-y-1">
                  <p><span className="text-muted-foreground">Método:</span> {request.payment_method}</p>
                  {request.payment_date && (
                    <p><span className="text-muted-foreground">Data:</span> {format(new Date(request.payment_date), 'dd/MM/yyyy', { locale: ptBR })}</p>
                  )}
                </div>
              </div>
            )}

            {/* Receipts */}
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Comprovantes ({receiptUrls.length})</p>
              </div>
              {receiptUrls.length > 0 ? (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {receiptUrls.map((path, index) => (
                    <ReceiptPreviewItem
                      key={index}
                      receiptPath={path}
                      index={index}
                      disabled
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum comprovante anexado.</p>
              )}
            </div>

            {/* History Timeline */}
            <Separator />
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm font-medium">Histórico de Movimentações</p>
              </div>
              {historyLoading ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : history.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum registro no histórico.</p>
              ) : (
                <div className="space-y-0">
                  {history.map((entry, i) => (
                    <div key={entry.id} className="relative pl-6 pb-4 last:pb-0">
                      {i < history.length - 1 && (
                        <div className="absolute left-[9px] top-3 bottom-0 w-px bg-border" />
                      )}
                      <div className="absolute left-0 top-1 h-[18px] w-[18px] rounded-full border-2 border-primary bg-background" />
                      <div>
                        <p className="text-sm font-medium">
                          {HISTORY_ACTION_LABELS[entry.action] || entry.action}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground mt-0.5">
                          <span>{entry.profiles?.full_name || 'Sistema'}</span>
                          <span>{format(new Date(entry.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                          {entry.old_status && entry.new_status && (
                            <span>
                              {STATUS_LABELS[entry.old_status as ReimbursementStatus] || entry.old_status}
                              {' → '}
                              {STATUS_LABELS[entry.new_status as ReimbursementStatus] || entry.new_status}
                            </span>
                          )}
                        </div>
                        {entry.comment && (
                          <div className="mt-1 flex items-start gap-1.5">
                            <MessageSquare className="h-3 w-3 mt-0.5 text-muted-foreground" />
                            <p className="text-xs text-muted-foreground italic">"{entry.comment}"</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {children}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
