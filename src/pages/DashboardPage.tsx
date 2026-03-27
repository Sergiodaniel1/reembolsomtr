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
  CreditCard,
  Users,
} from 'lucide-react';
import { ReimbursementRequest, EXPENSE_TYPE_LABELS } from '@/types/reimbursement';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, profile, hasAnyRole, isAdmin, isManager, isFinance } = useAuth();

  const isOperational = isAdmin || isFinance || isManager;

  // Fetch user's own requests
  const { data: myRequests = [], isLoading } = useQuery({
    queryKey: ['my-requests-dashboard', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('*, cost_centers(*)')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as ReimbursementRequest[];
    },
    enabled: !!user,
  });

  // Fetch all requests for operational users (admin/finance)
  const { data: allRequests = [] } = useQuery({
    queryKey: ['all-requests-dashboard', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('id, status, amount, created_at, paid_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user && isOperational,
  });

  // My stats
  const myStats = React.useMemo(() => {
    const total = myRequests.length;
    const pending = myRequests.filter(r => 
      ['enviado', 'em_aprovacao_gerente', 'em_aprovacao_financeiro', 'ajuste_solicitado'].includes(r.status)
    ).length;
    const approved = myRequests.filter(r => r.status === 'aprovado').length;
    const rejected = myRequests.filter(r => r.status === 'reprovado').length;
    const paidAmount = myRequests
      .filter(r => r.status === 'pago')
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const pendingAmount = myRequests
      .filter(r => ['enviado', 'em_aprovacao_gerente', 'em_aprovacao_financeiro', 'aprovado'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return { total, pending, approved, rejected, paidAmount, pendingAmount };
  }, [myRequests]);

  // Operational stats (current month)
  const opStats = React.useMemo(() => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthEnd = endOfMonth(now);

    const thisMonth = allRequests.filter(r => {
      const d = new Date(r.created_at);
      return d >= monthStart && d <= monthEnd;
    });

    const awaitingManager = allRequests.filter(r => r.status === 'em_aprovacao_gerente').length;
    const awaitingFinance = allRequests.filter(r => r.status === 'em_aprovacao_financeiro').length;
    const approvedPending = allRequests.filter(r => r.status === 'aprovado').length;
    
    const paidThisMonth = allRequests.filter(r => {
      if (r.status !== 'pago' || !r.paid_at) return false;
      const d = new Date(r.paid_at);
      return d >= monthStart && d <= monthEnd;
    });
    const paidThisMonthAmount = paidThisMonth.reduce((sum, r) => sum + Number(r.amount), 0);
    
    const rejectedThisMonth = thisMonth.filter(r => r.status === 'reprovado').length;
    const totalMonthAmount = thisMonth.reduce((sum, r) => sum + Number(r.amount), 0);

    return { 
      awaitingManager, awaitingFinance, approvedPending,
      paidThisMonth: paidThisMonth.length, paidThisMonthAmount,
      rejectedThisMonth, totalMonthAmount,
    };
  }, [allRequests]);

  // Monthly chart data (last 6 months)
  const monthlyChartData = React.useMemo(() => {
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
      });
    }
    return months;
  }, [myRequests]);

  const COLORS = ['#94a3b8', '#3b82f6', '#f59e0b', '#f97316', '#22c55e', '#ef4444', '#a855f7', '#06b6d4'];

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-4 sm:space-y-6">
      <PageHeader
        title={`Olá, ${profile?.full_name?.split(' ')[0] || 'Usuário'}!`}
        description="Acompanhe suas solicitações de reembolso"
      >
        <Button onClick={() => navigate('/nova-solicitacao')} size="sm">
          <PlusCircle className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Nova Solicitação</span>
          <span className="sm:hidden">Nova</span>
        </Button>
      </PageHeader>

      {/* My Stats */}
      <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Solicitações"
          value={myStats.total}
          icon={FileText}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatCard
          title="Em Andamento"
          value={myStats.pending}
          icon={Clock}
          iconClassName="bg-warning/10 text-warning"
        />
        <StatCard
          title="Valor Pago"
          value={formatCurrency(myStats.paidAmount)}
          icon={DollarSign}
          iconClassName="bg-success/10 text-success"
        />
        <StatCard
          title="Valor Pendente"
          value={formatCurrency(myStats.pendingAmount)}
          icon={Wallet}
          iconClassName="bg-muted text-muted-foreground"
        />
      </div>

      {/* Operational Dashboard for Admin/Finance/Manager */}
      {isOperational && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base sm:text-lg">Painel Operacional</CardTitle>
            <CardDescription>Indicadores do mês atual</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
              {(isManager || isAdmin) && (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate('/aprovar')}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-warning/10">
                    <AlertCircle className="h-5 w-5 text-warning" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{opStats.awaitingManager}</p>
                    <p className="text-xs text-muted-foreground">Aguard. Gerente</p>
                  </div>
                </div>
              )}
              {(isFinance || isAdmin) && (
                <div
                  className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate('/financeiro')}
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <DollarSign className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{opStats.awaitingFinance}</p>
                    <p className="text-xs text-muted-foreground">Aguard. Financeiro</p>
                  </div>
                </div>
              )}
              {(isFinance || isAdmin) && (
                <div className="flex items-center gap-3 p-3 rounded-lg border">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-success/10">
                    <CreditCard className="h-5 w-5 text-success" />
                  </div>
                  <div>
                    <p className="text-xl font-bold">{opStats.paidThisMonth}</p>
                    <p className="text-xs text-muted-foreground">Pagos no mês</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xl font-bold">{opStats.rejectedThisMonth}</p>
                  <p className="text-xs text-muted-foreground">Rejeitadas no mês</p>
                </div>
              </div>
            </div>
            {(isFinance || isAdmin) && (
              <div className="mt-4 flex items-center gap-6 text-sm border-t pt-4">
                <div>
                  <span className="text-muted-foreground">Valor movimentado no mês: </span>
                  <span className="font-semibold">{formatCurrency(opStats.totalMonthAmount)}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Valor pago no mês: </span>
                  <span className="font-semibold text-success">{formatCurrency(opStats.paidThisMonthAmount)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Charts Row */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2 sm:pb-4">
            <CardTitle className="text-base sm:text-lg">Evolução Mensal</CardTitle>
            <CardDescription>Seus valores nos últimos 6 meses</CardDescription>
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

        {/* Recent Requests */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 sm:pb-4">
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
            ) : myRequests.length === 0 ? (
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
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden md:table-cell">Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {myRequests.slice(0, 5).map((request) => (
                      <TableRow
                        key={request.id}
                        className="table-row-hover cursor-pointer"
                        onClick={() => navigate('/minhas-solicitacoes')}
                      >
                        <TableCell className="font-medium max-w-[150px] truncate">{request.title}</TableCell>
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
