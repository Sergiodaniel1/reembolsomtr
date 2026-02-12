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
  AlertCircle,
  Wallet,
} from 'lucide-react';
import { ReimbursementRequest, EXPENSE_TYPE_LABELS } from '@/types/reimbursement';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid,
} from 'recharts';

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
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as ReimbursementRequest[];
    },
    enabled: !!user,
  });

  // Fetch pending approvals count for managers
  const { data: pendingApprovals = 0 } = useQuery({
    queryKey: ['pending-approvals-count', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('id', { count: 'exact' })
        .eq('status', 'em_aprovacao_gerente');
      
      if (error) throw error;
      return data?.length || 0;
    },
    enabled: !!user && (isManager || isAdmin),
  });

  // Fetch pending finance count
  const { data: pendingFinance = 0 } = useQuery({
    queryKey: ['pending-finance-count', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('id', { count: 'exact' })
        .eq('status', 'em_aprovacao_financeiro');
      
      if (error) throw error;
      return data?.length || 0;
    },
    enabled: !!user && (isFinance || isAdmin),
  });

  // Calculate stats
  const stats = React.useMemo(() => {
    const myRequests = requests.filter(r => r.user_id === user?.id);
    const total = myRequests.length;
    const pending = myRequests.filter(r => 
      ['enviado', 'em_aprovacao_gerente', 'em_aprovacao_financeiro', 'ajuste_solicitado'].includes(r.status)
    ).length;
    const approved = myRequests.filter(r => r.status === 'aprovado').length;
    const rejected = myRequests.filter(r => r.status === 'reprovado').length;
    const paid = myRequests.filter(r => r.status === 'pago').length;
    const totalAmount = myRequests.reduce((sum, r) => sum + Number(r.amount), 0);
    const paidAmount = myRequests
      .filter(r => r.status === 'pago')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const pendingAmount = myRequests
      .filter(r => ['enviado', 'em_aprovacao_gerente', 'em_aprovacao_financeiro', 'aprovado'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return { total, pending, approved, rejected, paid, totalAmount, paidAmount, pendingAmount };
  }, [requests, user?.id]);

  // Monthly chart data (last 6 months)
  const monthlyChartData = React.useMemo(() => {
    const myRequests = requests.filter(r => r.user_id === user?.id);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const date = subMonths(new Date(), i);
      const start = startOfMonth(date);
      const end = endOfMonth(date);
      const monthRequests = myRequests.filter(r => {
        const d = new Date(r.created_at);
        return d >= start && d <= end;
      });
      months.push({
        name: format(date, 'MMM', { locale: ptBR }),
        total: monthRequests.reduce((sum, r) => sum + Number(r.amount), 0),
        count: monthRequests.length,
      });
    }
    return months;
  }, [requests, user?.id]);

  // Expense type chart data
  const expenseTypeData = React.useMemo(() => {
    const myRequests = requests.filter(r => r.user_id === user?.id);
    const typeCount: Record<string, number> = {};
    myRequests.forEach(r => {
      const label = EXPENSE_TYPE_LABELS[r.expense_type] || r.expense_type;
      typeCount[label] = (typeCount[label] || 0) + Number(r.amount);
    });
    return Object.entries(typeCount).map(([name, value]) => ({ name, value }));
  }, [requests, user?.id]);

  // Status chart data
  const statusChartData = React.useMemo(() => {
    const statusCount: Record<string, number> = {};
    requests.filter(r => r.user_id === user?.id).forEach(r => {
      statusCount[r.status] = (statusCount[r.status] || 0) + 1;
    });
    return Object.entries(statusCount).map(([name, value]) => ({ name, value }));
  }, [requests, user?.id]);

  const COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#06b6d4'];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`}
        description="Acompanhe suas solicitações de reembolso"
      >
        <Button onClick={() => navigate('/nova-solicitacao')} size="sm" className="sm:size-default">
          <PlusCircle className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nova Solicitação</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </PageHeader>

      {/* Stats Grid */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
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
          title="Valor Pago"
          value={formatCurrency(stats.paidAmount)}
          icon={DollarSign}
          iconClassName="bg-success/10 text-success"
        />
        <StatCard
          title="Valor Pendente"
          value={formatCurrency(stats.pendingAmount)}
          icon={Wallet}
          iconClassName="bg-info/10 text-info"
        />
      </div>

      {/* Manager/Finance Quick Stats */}
      {(isManager || isFinance || isAdmin) && (
        <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {(isManager || isAdmin) && (
            <Card className="card-interactive cursor-pointer" onClick={() => navigate('/aprovar')}>
              <CardContent className="flex items-center gap-4 p-4 sm:p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
                  <AlertCircle className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingApprovals}</p>
                  <p className="text-sm text-muted-foreground">Aguardando aprovação</p>
                </div>
              </CardContent>
            </Card>
          )}
          {(isFinance || isAdmin) && (
            <Card className="card-interactive cursor-pointer" onClick={() => navigate('/financeiro')}>
              <CardContent className="flex items-center gap-4 p-4 sm:p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-info/10">
                  <DollarSign className="h-6 w-6 text-info" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingFinance}</p>
                  <p className="text-sm text-muted-foreground">Análise financeira</p>
                </div>
              </CardContent>
            </Card>
          )}
          {isAdmin && (
            <Card className="card-interactive cursor-pointer" onClick={() => navigate('/relatorios')}>
              <CardContent className="flex items-center gap-4 p-4 sm:p-6">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stats.rejected}</p>
                  <p className="text-sm text-muted-foreground">Reprovadas (suas)</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        {/* Monthly Trend */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Evolução Mensal</CardTitle>
            <CardDescription>Valores nos últimos 6 meses</CardDescription>
          </CardHeader>
          <CardContent>
            {monthlyChartData.some(m => m.total > 0) ? (
              <div className="h-[200px] sm:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthlyChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="name" className="text-xs" />
                    <YAxis
                      tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`}
                      className="text-xs"
                      width={60}
                    />
                    <Tooltip
                      formatter={(value: number) => [formatCurrency(value), 'Valor']}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        borderColor: 'hsl(var(--border))',
                        borderRadius: '8px',
                        color: 'hsl(var(--foreground))',
                      }}
                    />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[200px] items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        {/* Status Pie */}
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Por Status</CardTitle>
            <CardDescription>Distribuição atual</CardDescription>
          </CardHeader>
          <CardContent>
            {statusChartData.length > 0 ? (
              <div className="h-[200px] sm:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
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
      </div>

      {/* Expense Type + Recent Requests */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-3">
        {/* By Type */}
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Por Tipo de Despesa</CardTitle>
            <CardDescription>Valores por categoria</CardDescription>
          </CardHeader>
          <CardContent>
            {expenseTypeData.length > 0 ? (
              <div className="h-[200px] sm:h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseTypeData}
                      cx="50%"
                      cy="50%"
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name }) => name}
                    >
                      {expenseTypeData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Valor']} />
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
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base sm:text-lg">Solicitações Recentes</CardTitle>
              <CardDescription>Suas últimas solicitações</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/minhas-solicitacoes')}>
              Ver todas
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="spinner h-8 w-8 text-primary" />
              </div>
            ) : requests.filter(r => r.user_id === user?.id).length === 0 ? (
              <div className="px-6 pb-6 sm:px-0 sm:pb-0">
                <EmptyState
                  title="Nenhuma solicitação"
                  description="Você ainda não criou nenhuma solicitação de reembolso."
                  action={{
                    label: 'Criar primeira solicitação',
                    onClick: () => navigate('/nova-solicitacao'),
                  }}
                />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Título</TableHead>
                      <TableHead className="hidden sm:table-cell">Tipo</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Data</TableHead>
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
                          onClick={() => navigate(`/minhas-solicitacoes`)}
                        >
                          <TableCell className="font-medium max-w-[120px] sm:max-w-none truncate">{request.title}</TableCell>
                          <TableCell className="hidden sm:table-cell">{EXPENSE_TYPE_LABELS[request.expense_type]}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(Number(request.amount))}</TableCell>
                          <TableCell>
                            <StatusBadge status={request.status} />
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-muted-foreground">
                            {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
