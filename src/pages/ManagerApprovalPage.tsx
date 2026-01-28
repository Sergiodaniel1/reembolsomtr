import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
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
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle,
  XCircle,
  MessageSquare,
  Loader2,
  Eye,
  Clock,
  FileText,
  Filter,
} from 'lucide-react';
import { ReimbursementRequest, EXPENSE_TYPE_LABELS, Profile } from '@/types/reimbursement';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RequestWithProfile extends ReimbursementRequest {
  profiles: Profile;
}

export default function ManagerApprovalPage() {
  const { user, profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRequest, setSelectedRequest] = useState<RequestWithProfile | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'adjust' | null>(null);
  const [comment, setComment] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Fetch requests pending manager approval (from subordinates)
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['manager-approval-requests', profile?.id],
    queryFn: async () => {
      // First get all profiles where this user is the manager
      const { data: subordinates, error: subError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('manager_id', profile?.id);

      if (subError) throw subError;

      const subordinateIds = subordinates?.map(s => s.user_id) || [];

      if (subordinateIds.length === 0) {
        return [];
      }

      // Then get requests from those subordinates
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('*, cost_centers(*)')
        .in('user_id', subordinateIds)
        .in('status', ['enviado', 'em_aprovacao_gerente'])
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch profiles
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
    enabled: !!profile?.id,
  });

  const actionMutation = useMutation({
    mutationFn: async ({ 
      requestId, 
      action, 
      comment 
    }: { 
      requestId: string; 
      action: 'approve' | 'reject' | 'adjust'; 
      comment: string;
    }) => {
      const statusMap = {
        approve: 'em_aprovacao_financeiro',
        reject: 'reprovado',
        adjust: 'ajuste_solicitado',
      } as const;
      
      const newStatus = statusMap[action];

      // Update the request
      const { error: updateError } = await supabase
        .from('reimbursement_requests')
        .update({
          status: newStatus,
          manager_comment: comment,
          ...(action === 'approve' && { approved_at: new Date().toISOString() }),
        })
        .eq('id', requestId);

      if (updateError) throw updateError;

      // Add to history
      const historyData = {
        request_id: requestId,
        user_id: user!.id,
        action: action === 'approve' ? 'approved_by_manager' : 
                action === 'reject' ? 'rejected_by_manager' : 'adjustment_requested',
        old_status: 'em_aprovacao_gerente' as const,
        new_status: newStatus,
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
        variables.action === 'reject' ? 'reprovada' : 'devolvida para ajuste';
      
      toast({
        title: 'Ação realizada',
        description: `Solicitação ${actionLabel} com sucesso.`,
      });
      
      queryClient.invalidateQueries({ queryKey: ['manager-approval-requests'] });
      setDialogOpen(false);
      setSelectedRequest(null);
      setComment('');
      setActionType(null);
    },
    onError: (error: any) => {
      toast({
        title: 'Erro',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const openActionDialog = (request: RequestWithProfile, action: 'approve' | 'reject' | 'adjust') => {
    setSelectedRequest(request);
    setActionType(action);
    setComment('');
    setDialogOpen(true);
  };

  const handleAction = () => {
    if (!selectedRequest || !actionType) return;
    
    if ((actionType === 'reject' || actionType === 'adjust') && !comment.trim()) {
      toast({
        title: 'Comentário obrigatório',
        description: 'Por favor, informe o motivo da ação.',
        variant: 'destructive',
      });
      return;
    }

    actionMutation.mutate({
      requestId: selectedRequest.id,
      action: actionType,
      comment: comment.trim(),
    });
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const filteredRequests = requests.filter(r => {
    if (filterStatus === 'pending') {
      return ['enviado', 'em_aprovacao_gerente'].includes(r.status);
    }
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
        title="Aprovar Solicitações"
        description="Gerencie as solicitações de reembolso da sua equipe"
        icon={CheckCircle}
      />

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Solicitações Pendentes</CardTitle>
            <CardDescription>
              {filteredRequests.length} solicitação(ões) aguardando sua análise
            </CardDescription>
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Filtrar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {filteredRequests.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="Nenhuma solicitação pendente"
              description="Não há solicitações aguardando sua aprovação no momento."
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
                    <TableHead>Data Despesa</TableHead>
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
                            className="text-warning hover:text-warning hover:bg-warning/10"
                            onClick={() => openActionDialog(request, 'adjust')}
                          >
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openActionDialog(request, 'reject')}
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && 'Aprovar Solicitação'}
              {actionType === 'reject' && 'Reprovar Solicitação'}
              {actionType === 'adjust' && 'Solicitar Ajuste'}
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
                  <span className="text-muted-foreground">Tipo:</span>
                  <span>{EXPENSE_TYPE_LABELS[selectedRequest.expense_type]}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Valor:</span>
                  <span className="font-semibold">{formatCurrency(Number(selectedRequest.amount))}</span>
                </div>
                {selectedRequest.description && (
                  <div className="pt-2 border-t">
                    <p className="text-sm text-muted-foreground">Descrição:</p>
                    <p className="text-sm">{selectedRequest.description}</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>
                Comentário {(actionType === 'reject' || actionType === 'adjust') && '*'}
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={
                  actionType === 'approve' 
                    ? 'Comentário opcional...' 
                    : 'Informe o motivo da ação...'
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
                <MessageSquare className="h-4 w-4 mr-2" />
              )}
              {actionType === 'approve' && 'Aprovar'}
              {actionType === 'reject' && 'Reprovar'}
              {actionType === 'adjust' && 'Solicitar Ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
