import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  DollarSign,
  CheckCircle,
  XCircle,
  MessageSquare,
  Loader2,
  CreditCard,
  Clock,
  TrendingUp,
  Filter,
  Banknote,
} from 'lucide-react';
import { ReimbursementRequest, EXPENSE_TYPE_LABELS, Profile } from '@/types/reimbursement';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RequestWithProfile extends ReimbursementRequest {
  profiles: Profile;
}

export default function FinancePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRequest, setSelectedRequest] = useState<RequestWithProfile | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'pay' | null>(null);
  const [comment, setComment] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');

  // Fetch requests for finance
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['finance-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('*, cost_centers(*)')
        .in('status', ['em_aprovacao_financeiro', 'aprovado', 'pago'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles for each request
      const userIds = [...new Set((data || []).map(r => r.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .in('user_id', userIds);

      const profileMap = new Map((profiles || []).map(p => [p.user_id, p]));

      return (data || []).map(r => ({
        ...r,
        profiles: profileMap.get(r.user_id) || null,
      })) as RequestWithProfile[];
    },
  });

  // Calculate stats
  const stats = React.useMemo(() => {
    const pending = requests.filter(r => r.status === 'em_aprovacao_financeiro');
    const approved = requests.filter(r => r.status === 'aprovado');
    const paid = requests.filter(r => r.status === 'pago');

    return {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, r) => sum + Number(r.amount), 0),
      approvedCount: approved.length,
      approvedAmount: approved.reduce((sum, r) => sum + Number(r.amount), 0),
      paidCount: paid.length,
      paidAmount: paid.reduce((sum, r) => sum + Number(r.amount), 0),
    };
  }, [requests]);

  const actionMutation = useMutation({
    mutationFn: async ({ 
      requestId, 
      action, 
      comment,
      paymentMethod,
      paymentDate,
    }: { 
      requestId: string; 
      action: 'approve' | 'reject' | 'pay'; 
      comment: string;
      paymentMethod?: string;
      paymentDate?: string;
    }) => {
      let newStatus: string;
      
      if (action === 'approve') {
        newStatus = 'aprovado';
      } else if (action === 'reject') {
        newStatus = 'reprovado';
      } else {
        newStatus = 'pago';
      }

      const updateData: any = {
        status: newStatus,
        finance_comment: comment,
      };

      if (action === 'pay') {
        updateData.paid_at = new Date().toISOString();
        updateData.payment_method = paymentMethod;
        updateData.payment_date = paymentDate;
      }

      // Update the request
      const { error: updateError } = await supabase
        .from('reimbursement_requests')
        .update(updateData)
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Add to history
      const historyData = {
        request_id: requestId,
        user_id: user!.id,
        action: action === 'approve' ? 'approved_by_finance' :
                  action === 'reject' ? 'rejected_by_finance' : 'marked_as_paid',
        old_status: (action === 'pay' ? 'aprovado' : 'em_aprovacao_financeiro') as any,
        new_status: newStatus as any,
        comment,
      };

      const { error: historyError } = await supabase
        .from('reimbursement_history')
        .insert(historyData);

      if (historyError) throw historyError;
    },
    onSuccess: (_, variables) => {
      const actionLabel = 
        variables.action === 'approve' ? 'aprovada' :
        variables.action === 'reject' ? 'reprovada' : 'marcada como paga';
      
      toast({
        title: 'Ação realizada',
        description: `Solicitação ${actionLabel} com sucesso.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['finance-requests'] });
      setDialogOpen(false);
      setSelectedRequest(null);
      setComment('');
      setActionType(null);
      setPaymentMethod('');
      setPaymentDate('');
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const openActionDialog = (request: RequestWithProfile, action: 'approve' | 'reject' | 'pay') => {
    setSelectedRequest(request);
    setActionType(action);
    setComment('');
    setPaymentMethod('');
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'));
    setDialogOpen(true);
  };

  const handleAction = () => {
    if (!selectedRequest || !actionType) return;
    
    if (actionType === 'reject' && !comment.trim()) {
      toast({
        title: 'Comentário obrigatório',
        description: 'Por favor, informe o motivo da reprovação.',
        variant: 'destructive',
      });
      return;
    }

    if (actionType === 'pay' && (!paymentMethod || !paymentDate)) {
      toast({
        title: 'Dados obrigatórios',
        description: 'Informe a forma e data de pagamento.',
        variant: 'destructive',
      });
      return;
    }

    actionMutation.mutate({
      requestId: selectedRequest.id,
      action: actionType,
      comment: comment.trim(),
      paymentMethod,
      paymentDate,
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredRequests = requests.filter(r => {
    if (activeTab === 'pending') return r.status === 'em_aprovacao_financeiro';
    if (activeTab === 'approved') return r.status === 'aprovado';
    if (activeTab === 'paid') return r.status === 'pago';
    return true;
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel Financeiro"
        description="Gerencie aprovações e pagamentos de reembolsos"
        icon={DollarSign}
      />

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          title="Pendente de Aprovação"
          value={stats.pendingCount}
          subtitle={formatCurrency(stats.pendingAmount)}
          icon={Clock}
          iconClassName="bg-warning/10 text-warning"
        />
        <StatCard
          title="Aguardando Pagamento"
          value={stats.approvedCount}
          subtitle={formatCurrency(stats.approvedAmount)}
          icon={CreditCard}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatCard
          title="Pagos"
          value={stats.paidCount}
          subtitle={formatCurrency(stats.paidAmount)}
          icon={TrendingUp}
          iconClassName="bg-success/10 text-success"
        />
      </div>

      {/* Requests Table */}
      <Card>
        <CardHeader>
          <CardTitle>Solicitações</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="pending" className="gap-2">
                <Clock className="h-4 w-4" />
                Pendentes ({stats.pendingCount})
              </TabsTrigger>
              <TabsTrigger value="approved" className="gap-2">
                <CheckCircle className="h-4 w-4" />
                Aprovados ({stats.approvedCount})
              </TabsTrigger>
              <TabsTrigger value="paid" className="gap-2">
                <Banknote className="h-4 w-4" />
                Pagos ({stats.paidCount})
              </TabsTrigger>
            </TabsList>

            <TabsContent value={activeTab}>
              {filteredRequests.length === 0 ? (
                <EmptyState
                  icon={DollarSign}
                  title={`Nenhuma solicitação ${activeTab === 'pending' ? 'pendente' : activeTab === 'approved' ? 'aguardando pagamento' : 'paga'}`}
                  description="Não há solicitações nesta categoria no momento."
                />
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Solicitante</TableHead>
                        <TableHead>Título</TableHead>
                        <TableHead>Tipo</TableHead>
                        <TableHead>Valor</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRequests.map((request) => (
                        <TableRow key={request.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-sm">
                                {request.profiles?.full_name?.charAt(0).toUpperCase() || '?'}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{request.profiles?.full_name}</p>
                                <p className="text-xs text-muted-foreground">{request.profiles?.email}</p>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-medium">{request.title}</TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {EXPENSE_TYPE_LABELS[request.expense_type]}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-semibold">
                            {formatCurrency(Number(request.amount))}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {format(new Date(request.expense_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                          <TableCell>
                            <StatusBadge status={request.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              {request.status === 'em_aprovacao_financeiro' && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-success hover:text-success hover:bg-success/10"
                                    onClick={() => openActionDialog(request, 'approve')}
                                  >
                                    <CheckCircle className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => openActionDialog(request, 'reject')}
                                  >
                                    <XCircle className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                              {request.status === 'aprovado' && (
                                <Button
                                  size="sm"
                                  onClick={() => openActionDialog(request, 'pay')}
                                >
                                  <Banknote className="h-4 w-4 mr-2" />
                                  Pagar
                                </Button>
                              )}
                              {request.status === 'pago' && request.payment_date && (
                                <span className="text-sm text-muted-foreground">
                                  Pago em {format(new Date(request.payment_date), 'dd/MM/yyyy', { locale: ptBR })}
                                </span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Aprovar Solicitação'}
              {actionType === 'reject' && 'Reprovar Solicitação'}
              {actionType === 'pay' && 'Registrar Pagamento'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && (
                <span>
                  {selectedRequest.title} - {formatCurrency(Number(selectedRequest.amount))}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedRequest && (
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Solicitante:</span>
                  <span className="font-medium">{selectedRequest.profiles?.full_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-semibold">{formatCurrency(Number(selectedRequest.amount))}</span>
                </div>
                {selectedRequest.manager_comment && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Comentário do Gerente:</p>
                    <p className="text-sm">{selectedRequest.manager_comment}</p>
                  </div>
                )}
              </div>
            )}

            {actionType === 'pay' && (
              <>
                <div className="space-y-2">
                  <Label>Forma de Pagamento *</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pix">PIX</SelectItem>
                      <SelectItem value="transferencia">Transferência Bancária</SelectItem>
                      <SelectItem value="deposito">Depósito</SelectItem>
                      <SelectItem value="cheque">Cheque</SelectItem>
                      <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Data do Pagamento *</Label>
                  <Input
                    type="date"
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label>
                Comentário {actionType === 'reject' && '*'}
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  actionType === 'reject' 
                    ? 'Informe o motivo da reprovação...' 
                    : 'Comentário opcional...'
                }
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAction}
              disabled={actionMutation.isPending}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {actionMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : actionType === 'approve' ? (
                <CheckCircle className="h-4 w-4 mr-2" />
              ) : actionType === 'reject' ? (
                <XCircle className="h-4 w-4 mr-2" />
              ) : (
                <Banknote className="h-4 w-4 mr-2" />
              )}
              {actionType === 'approve' && 'Aprovar'}
              {actionType === 'reject' && 'Reprovar'}
              {actionType === 'pay' && 'Registrar Pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
