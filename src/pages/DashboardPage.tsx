import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { StatCard } from '@/components/ui/stat-card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import {
  FileText,
  Clock,
  CheckCircle,
  XCircle,
  DollarSign,
  TrendingUp,
  PlusCircle,
  ArrowRight,
} from 'lucide-react';
import { ReimbursementRequest, ReimbursementStatus, EXPENSE_TYPE_LABELS } from '@/types/reimbursement';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, hasAnyRole, isAdmin, isManager, isFinance } = useAuth();

  // Fetch user's requests
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['reimbursement-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('*, cost_centers(*)')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data as ReimbursementRequest[];
    },
    enabled: !!user,
  });

  // Calculate stats
  const stats = React.useMemo(() => {
    const myRequests = requests.filter(r => r.user_id === user?.id);
    const total = myRequests.length;
    const pending = myRequests.filter(r => 
      ['enviado', 'em_aprovacao_gerente', 'em_aprovacao_financeiro', 'ajuste_solicitado'].includes(r.status)
    ).length;
    const approved = myRequests.filter(r => r.status === 'aprovado').length;
    const paid = myRequests.filter(r => r.status === 'pago').length;
    const totalAmount = myRequests.reduce((sum, r) => sum + Number(r.amount), 0);
    const paidAmount = myRequests
      .filter(r => r.status === 'pago')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return { total, pending, approved, paid, totalAmount, paidAmount };
  }, [requests, user?.id]);

  // Chart data
  const statusChartData = React.useMemo(() => {
    const statusCount: Record<string, number> = {};
    requests.filter(r => r.user_id === user?.id).forEach(r => {
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
    });
    return Object.entries(statusCount).map(([name, value]) => ({ name, value }));
  }, [requests, user?.id]);

  const COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#a855f7'];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`}
        description="Acompanhe suas solicitações de reembolso"
      >
        <Button onClick={() => navigate('/nova-solicitacao')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Nova Solicitação
        </Button>
      </PageHeader>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Solicitações"
          value={stats.total}
          icon={FileText}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatCard
          title="Em Andamento"
          value={stats.pending}
          icon={Clock}
          iconClassName="bg-warning/10 text-warning"
        />
        <StatCard
          title="Aprovadas"
          value={stats.approved}
          icon={CheckCircle}
          iconClassName="bg-success/10 text-success"
        />
        <StatCard
          title="Valor Total Pago"
          value={formatCurrency(stats.paidAmount)}
          icon={DollarSign}
          iconClassName="bg-purple-500/10 text-purple-500"
        />
      </div>

      {/* Charts and Recent Requests */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Status Chart */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-lg">Por Status</CardTitle>
            <CardDescription>Distribuição das suas solicitações</CardDescription>
          </CardHeader>
          <CardContent>
            {statusChartData.length > 0 ? (
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {statusChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Requests */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Solicitações Recentes</CardTitle>
              <CardDescription>Suas últimas solicitações de reembolso</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/minhas-solicitacoes')}>
              Ver todas
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="spinner h-8 w-8 text-primary" />
              </div>
            ) : requests.filter(r => r.user_id === user?.id).length === 0 ? (
              <EmptyState
                title="Nenhuma solicitação"
                description="Você ainda não criou nenhuma solicitação de reembolso."
                action={{
                  label: 'Criar primeira solicitação',
                  onClick: () => navigate('/nova-solicitacao'),
                }}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Data</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests
                    .filter(r => r.user_id === user?.id)
                    .slice(0, 5)
                    .map((request) => (
                      <TableRow
                        key={request.id}
                        className="table-row-hover cursor-pointer"
                        onClick={() => navigate(`/solicitacao/${request.id}`)}
                      >
                        <TableCell className="font-medium">{request.title}</TableCell>
                        <TableCell>{EXPENSE_TYPE_LABELS[request.expense_type]}</TableCell>
                        <TableCell>{formatCurrency(Number(request.amount))}</TableCell>
                        <TableCell>
                          <StatusBadge status={request.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manager/Finance Section */}
      {(isManager || isFinance || isAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Ações Pendentes</CardTitle>
            <CardDescription>
              {isManager && 'Solicitações aguardando sua aprovação'}
              {isFinance && 'Solicitações aguardando análise financeira'}
              {isAdmin && 'Visão geral do sistema'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {isManager && (
                <Button variant="outline" onClick={() => navigate('/aprovar')}>
                  <Clock className="mr-2 h-4 w-4" />
                  Aprovar Solicitações
                </Button>
              )}
              {isFinance && (
                <Button variant="outline" onClick={() => navigate('/financeiro')}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Painel Financeiro
                </Button>
              )}
              {isAdmin && (
                <>
                  <Button variant="outline" onClick={() => navigate('/admin/usuarios')}>
                    Gerenciar Usuários
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/relatorios')}>
                    <TrendingUp className="mr-2 h-4 w-4" />
                    Relatórios
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
