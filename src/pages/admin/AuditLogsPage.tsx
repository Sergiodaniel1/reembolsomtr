import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Shield,
  Loader2,
  Search,
  Eye,
  User,
  Clock,
} from 'lucide-react';
import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Button } from '@/components/ui/button';

interface AuditLog {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  old_data: Record<string, any> | null;
  new_data: Record<string, any> | null;
  ip_address: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  user_created: { label: 'Usuário Criado', variant: 'default' },
  user_updated: { label: 'Usuário Atualizado', variant: 'secondary' },
  user_deactivated: { label: 'Usuário Desativado', variant: 'destructive' },
  role_assigned: { label: 'Cargo Atribuído', variant: 'default' },
  role_removed: { label: 'Cargo Removido', variant: 'destructive' },
  login: { label: 'Login', variant: 'outline' },
  logout: { label: 'Logout', variant: 'outline' },
  reimbursement_created: { label: 'Reembolso Criado', variant: 'default' },
  reimbursement_status_change: { label: 'Status Alterado', variant: 'secondary' },
  approved_by_manager: { label: 'Aprovado (Gerente)', variant: 'default' },
  rejected_by_manager: { label: 'Reprovado (Gerente)', variant: 'destructive' },
  approved_by_finance: { label: 'Aprovado (Financeiro)', variant: 'default' },
  rejected_by_finance: { label: 'Reprovado (Financeiro)', variant: 'destructive' },
  marked_as_paid: { label: 'Marcado como Pago', variant: 'default' },
  adjustment_requested: { label: 'Ajuste Solicitado', variant: 'secondary' },
  config_updated: { label: 'Configuração Atualizada', variant: 'secondary' },
};

export default function AuditLogsPage() {
  const [startDate, setStartDate] = useState(
    format(subDays(new Date(), 30), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterAction, setFilterAction] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['audit-logs', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;
      return (data || []) as AuditLog[];
    },
  });

  const filteredLogs = logs.filter(log => {
    const actionMatch = filterAction === 'all' || log.action === filterAction;
    const searchMatch = !searchTerm || 
      log.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.action.toLowerCase().includes(searchTerm.toLowerCase());
    return actionMatch && searchMatch;
  });

  const uniqueActions = [...new Set(logs.map(l => l.action))];

  const getActionBadge = (action: string) => {
    const config = ACTION_LABELS[action] || { label: action, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

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
        title="Logs de Auditoria"
        description="Histórico de ações do sistema"
        icon={Shield}
      />

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label>Buscar</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="E-mail ou ação..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Data Início</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Data Fim</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Ação</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {uniqueActions.map(action => (
                    <SelectItem key={action} value={action}>
                      {ACTION_LABELS[action]?.label || action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Registros</CardTitle>
          <CardDescription>
            {filteredLogs.length} registro(s) encontrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredLogs.length === 0 ? (
            <EmptyState
              icon={Shield}
              title="Nenhum registro encontrado"
              description="Não há logs de auditoria para os filtros selecionados."
            />
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data/Hora</TableHead>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Ação</TableHead>
                    <TableHead>Entidade</TableHead>
                    <TableHead className="w-[80px]">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLogs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-muted-foreground">
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4" />
                          {format(new Date(log.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          {log.user_email || 'Sistema'}
                        </div>
                      </TableCell>
                      <TableCell>
                        {log.user_role ? (
                          <Badge variant="outline">{log.user_role}</Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {getActionBadge(log.action)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {log.entity_type || '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalhes do Registro</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label className="text-muted-foreground">Data/Hora</Label>
                  <p className="font-medium">
                    {format(new Date(selectedLog.created_at), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Usuário</Label>
                  <p className="font-medium">{selectedLog.user_email || 'Sistema'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Cargo</Label>
                  <p className="font-medium">{selectedLog.user_role || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Ação</Label>
                  <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Tipo de Entidade</Label>
                  <p className="font-medium">{selectedLog.entity_type || '-'}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">ID da Entidade</Label>
                  <p className="font-medium text-xs">{selectedLog.entity_id || '-'}</p>
                </div>
              </div>

              {(selectedLog.old_data || selectedLog.new_data) && (
                <div className="space-y-4 pt-4 border-t">
                  {selectedLog.old_data && (
                    <div>
                      <Label className="text-muted-foreground">Dados Anteriores</Label>
                      <ScrollArea className="h-32 mt-2 rounded-md border bg-muted p-3">
                        <pre className="text-xs">
                          {JSON.stringify(selectedLog.old_data, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                  {selectedLog.new_data && (
                    <div>
                      <Label className="text-muted-foreground">Novos Dados</Label>
                      <ScrollArea className="h-32 mt-2 rounded-md border bg-muted p-3">
                        <pre className="text-xs">
                          {JSON.stringify(selectedLog.new_data, null, 2)}
                        </pre>
                      </ScrollArea>
                    </div>
                  )}
                </div>
              )}

              {selectedLog.ip_address && (
                <div>
                  <Label className="text-muted-foreground">Endereço IP</Label>
                  <p className="font-medium">{selectedLog.ip_address}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
