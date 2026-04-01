import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { transitionWithNotification } from '@/lib/reimbursement-actions';
import { PageHeader } from '@/components/ui/page-header';
import { PolicyAlerts } from '@/components/policy/PolicyAlerts';
import { useReimbursementPolicy } from '@/hooks/useReimbursementPolicy';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { StatusBadge } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { RequestDetailDialog } from '@/components/requests/RequestDetailDialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle, XCircle, MessageSquare, Loader2, Clock, Search, Eye, Paperclip,
} from 'lucide-react';
import { ReimbursementRequest, EXPENSE_TYPE_LABELS, Profile, ReimbursementStatus } from '@/types/reimbursement';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface RequestWithProfile extends ReimbursementRequest {
  profiles: Profile;
}

export default function ManagerApprovalPage() {
  const { user, profile, isAdmin } = useAuth();
  const { getRequestAlerts } = useReimbursementPolicy();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [selectedRequest, setSelectedRequest] = useState<RequestWithProfile | null>(null);
  const [detailRequest, setDetailRequest] = useState<RequestWithProfile | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | 'adjust' | null>(null);
  const [comment, setComment] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['manager-approval-requests', profile?.id],
    queryFn: async () => {
      // Get subordinates
      const { data: subordinates, error: subError } = await supabase
        .from('profiles')
        .select('user_id')
        .eq('manager_id', profile?.id);
      if (subError) throw subError;

      const subordinateIds = subordinates?.map(s => s.user_id) || [];
      if (subordinateIds.length === 0 && !isAdmin) return [];

      let query = supabase
        .from('reimbursement_requests')
        .select('*, cost_centers(*)')
        .in('status', ['enviado', 'em_aprovacao_gerente'])
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.in('user_id', subordinateIds);
      }

      const { data, error } = await query;
      if (error) throw error;

      const userIds = [...new Set((data || []).map(r => r.user_id))];
      if (userIds.length === 0) return [];
      
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
      requestId, action, comment,
    }: {
      requestId: string; action: 'approve' | 'reject' | 'adjust'; comment: string; oldStatus: ReimbursementStatus;
    }) => {
      const rpcActionMap = {
        approve: 'manager_approve' as const,
        reject: 'manager_reject' as const,
        adjust: 'manager_adjust' as const,
      };

      const request = requests.find(r => r.id === requestId);
      await transitionWithNotification({
        requestId,
        action: rpcActionMap[action],
        comment: comment || undefined,
        recipientEmail: request?.profiles?.email,
        recipientName: request?.profiles?.full_name,
        requestTitle: request?.title,
        requestAmount: request ? Number(request.amount) : undefined,
      });
    },
    onSuccess: (_, variables) => {
      const label = variables.action === 'approve' ? 'aprovada' :
                    variables.action === 'reject' ? 'reprovada' : 'devolvida para ajuste';
      toast({ title: '✅ Ação realizada', description: `Solicitação ${label} com sucesso.` });
      queryClient.invalidateQueries({ queryKey: ['manager-approval-requests'] });
      setDialogOpen(false);
      setConfirmOpen(false);
      setSelectedRequest(null);
      setComment('');
      setActionType(null);
    },
    onError: (error: any) => {
      toast({ title: '❌ Erro', description: error.message, variant: 'destructive' });
    },
  });

  const openActionDialog = (request: RequestWithProfile, action: 'approve' | 'reject' | 'adjust') => {
    setSelectedRequest(request);
    setActionType(action);
    setComment('');
    setDialogOpen(true);
  };

  const handleConfirmAction = () => {
    if (!selectedRequest || !actionType) return;
    if ((actionType === 'reject' || actionType === 'adjust') && !comment.trim()) {
      toast({ title: 'Justificativa obrigatória', description: 'Informe o motivo para esta ação.', variant: 'destructive' });
      return;
    }
    setConfirmOpen(true);
  };

  const executeAction = () => {
    if (!selectedRequest || !actionType) return;
    actionMutation.mutate({
      requestId: selectedRequest.id,
      action: actionType,
      comment: comment.trim(),
      oldStatus: selectedRequest.status,
    });
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const filteredRequests = requests
    .filter(r => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        r.title.toLowerCase().includes(q) ||
        r.profiles?.full_name?.toLowerCase().includes(q) ||
        r.profiles?.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
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

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por colaborador ou título..."
                className="pl-10"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Select value={sortOrder} onValueChange={(v) => setSortOrder(v as 'asc' | 'desc')}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">Mais recentes</SelectItem>
                <SelectItem value="asc">Mais antigas</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Requests */}
      <Card>
        <CardHeader>
          <CardTitle>Solicitações Pendentes</CardTitle>
          <CardDescription>
            {filteredRequests.length} solicitação(ões) aguardando sua análise
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          {filteredRequests.length === 0 ? (
            <div className="px-6 pb-6 sm:px-0 sm:pb-0">
              <EmptyState
                icon={Clock}
                title="Nenhuma solicitação pendente"
                description="Não há solicitações aguardando sua aprovação no momento."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Solicitante</TableHead>
                    <TableHead>Título</TableHead>
                    <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead className="hidden md:table-cell">Data</TableHead>
                    <TableHead className="hidden lg:table-cell">Anexos</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-medium text-xs shrink-0">
                            {request.profiles?.full_name?.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{request.profiles?.full_name}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium max-w-[140px] truncate">{request.title}</TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="text-xs">
                          {EXPENSE_TYPE_LABELS[request.expense_type]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-semibold whitespace-nowrap">
                        {formatCurrency(Number(request.amount))}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground">
                        {format(new Date(request.expense_date), 'dd/MM/yyyy', { locale: ptBR })}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <Paperclip className="h-3.5 w-3.5" />
                          <span className="text-sm">{(request.receipt_urls || []).length}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={request.status} />
                        <PolicyAlerts
                          compact
                          violations={getRequestAlerts({
                            expenseType: request.expense_type,
                            amount: Number(request.amount),
                            expenseDate: request.expense_date,
                            receiptCount: (request.receipt_urls || []).length,
                          })}
                          className="mt-1"
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Button size="sm" variant="ghost" onClick={() => { setDetailRequest(request); setDetailOpen(true); }}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-success hover:text-success hover:bg-success/10"
                            onClick={() => openActionDialog(request, 'approve')}>
                            <CheckCircle className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-warning hover:text-warning hover:bg-warning/10"
                            onClick={() => openActionDialog(request, 'adjust')}>
                            <MessageSquare className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => openActionDialog(request, 'reject')}>
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

      {/* Detail Dialog */}
      <RequestDetailDialog
        request={detailRequest}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' && '✅ Aprovar Solicitação'}
              {actionType === 'reject' && '❌ Reprovar Solicitação'}
              {actionType === 'adjust' && '🔄 Solicitar Ajuste'}
            </DialogTitle>
            <DialogDescription>
              {selectedRequest && `${selectedRequest.title} — ${formatCurrency(Number(selectedRequest.amount))}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {selectedRequest && (
              <div className="rounded-lg bg-muted p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Solicitante:</span><span className="font-medium">{selectedRequest.profiles?.full_name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Tipo:</span><span>{EXPENSE_TYPE_LABELS[selectedRequest.expense_type]}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Valor:</span><span className="font-semibold">{formatCurrency(Number(selectedRequest.amount))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Anexos:</span><span>{(selectedRequest.receipt_urls || []).length} comprovante(s)</span></div>
                {selectedRequest.description && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground">Justificativa:</p>
                    <p>{selectedRequest.description}</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label>
                {actionType === 'approve' ? 'Comentário (opcional)' : 'Justificativa *'}
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder={actionType === 'approve' ? 'Comentário opcional...' : 'Informe o motivo...'}
                rows={3}
              />
              {actionType !== 'approve' && (
                <p className="text-xs text-muted-foreground">A justificativa é obrigatória para esta ação.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleConfirmAction}
              disabled={actionMutation.isPending}
              variant={actionType === 'reject' ? 'destructive' : 'default'}
            >
              {actionType === 'approve' && 'Aprovar'}
              {actionType === 'reject' && 'Reprovar'}
              {actionType === 'adjust' && 'Solicitar Ajuste'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmation Alert */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ação</AlertDialogTitle>
            <AlertDialogDescription>
              {actionType === 'approve' && 'Tem certeza que deseja aprovar esta solicitação? Ela será encaminhada para análise financeira.'}
              {actionType === 'reject' && 'Tem certeza que deseja reprovar esta solicitação? Esta ação não pode ser desfeita.'}
              {actionType === 'adjust' && 'Tem certeza que deseja solicitar ajuste? O colaborador será notificado para corrigir a solicitação.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={actionMutation.isPending}
              className={actionType === 'reject' ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
            >
              {actionMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
