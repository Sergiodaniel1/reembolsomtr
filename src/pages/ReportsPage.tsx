import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
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
import { StatusBadge } from '@/components/ui/status-badge';
import { Badge } from '@/components/ui/badge';
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { 
  ReimbursementRequest, 
  EXPENSE_TYPE_LABELS, 
  STATUS_LABELS, 
  Profile,
  ReimbursementStatus 
} from '@/types/reimbursement';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface RequestWithProfile extends ReimbursementRequest {
  profiles: Profile;
}

export default function ReportsPage() {
  const { isAdmin, isFinance, isManager } = useAuth();

  const [startDate, setStartDate] = useState(
    format(startOfMonth(subMonths(new Date(), 2)), 'yyyy-MM-dd')
  );
  const [endDate, setEndDate] = useState(
    format(endOfMonth(new Date()), 'yyyy-MM-dd')
  );
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');

  // Fetch all requests for reports
  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['reports-requests', startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('*, cost_centers(*)')
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
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
  });

  // Filter requests
  const filteredRequests = useMemo(() => {
    return requests.filter(r => {
      const statusMatch = filterStatus === 'all' || r.status === filterStatus;
      const typeMatch = filterType === 'all' || r.expense_type === filterType;
      return statusMatch && typeMatch;
    });
  }, [requests, filterStatus, filterType]);

  // Calculate statistics
  const stats = useMemo(() => {
    const total = filteredRequests.reduce((sum, r) => sum + Number(r.amount), 0);
    const approved = filteredRequests
      .filter(r => ['aprovado', 'pago'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const pending = filteredRequests
      .filter(r => ['enviado', 'em_aprovacao_gerente', 'em_aprovacao_financeiro'].includes(r.status))
      .reduce((sum, r) => sum + Number(r.amount), 0);
    const paid = filteredRequests
      .filter(r => r.status === 'pago')
      .reduce((sum, r) => sum + Number(r.amount), 0);

    return {
      count: filteredRequests.length,
      total,
      approved,
      pending,
      paid,
    };
  }, [filteredRequests]);

  // Chart data - by status
  const statusChartData = useMemo(() => {
    const statusCount: Record<string, { count: number; amount: number }> = {};
    filteredRequests.forEach(r => {
      if (!statusCount[r.status]) {
        statusCount[r.status] = { count: 0, amount: 0 };
      }
      statusCount[r.status].count++;
      statusCount[r.status].amount += Number(r.amount);
    });

    return Object.entries(statusCount).map(([status, data]) => ({
      name: STATUS_LABELS[status as ReimbursementStatus] || status,
      quantidade: data.count,
      valor: data.amount,
    }));
  }, [filteredRequests]);

  // Chart data - by expense type
  const typeChartData = useMemo(() => {
    const typeCount: Record<string, number> = {};
    filteredRequests.forEach(r => {
      const label = EXPENSE_TYPE_LABELS[r.expense_type] || r.expense_type;
      typeCount[label] = (typeCount[label] || 0) + Number(r.amount);
    });

    return Object.entries(typeCount).map(([name, value]) => ({
      name,
      value,
    }));
  }, [filteredRequests]);

  const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316'];

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const handleExportExcel = () => {
    // Create CSV content
    const headers = ['Título', 'Solicitante', 'Tipo', 'Valor', 'Status', 'Data Despesa', 'Data Criação'];
    const rows = filteredRequests.map(r => [
      r.title,
      r.profiles?.full_name || '',
      EXPENSE_TYPE_LABELS[r.expense_type],
      Number(r.amount).toFixed(2),
      STATUS_LABELS[r.status],
      format(new Date(r.expense_date), 'dd/MM/yyyy'),
      format(new Date(r.created_at), 'dd/MM/yyyy'),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-reembolsos-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    link.click();
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
        title="Relatórios"
        description="Análise e exportação de dados de reembolsos"
        icon={BarChart3}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportExcel}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </PageHeader>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
              <Label>Status</Label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de Despesa</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(EXPENSE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total de Solicitações"
          value={stats.count}
          subtitle={formatCurrency(stats.total)}
          icon={FileText}
          iconClassName="bg-primary/10 text-primary"
        />
        <StatCard
          title="Valor Pendente"
          value={formatCurrency(stats.pending)}
          icon={Clock}
          iconClassName="bg-warning/10 text-warning"
        />
        <StatCard
          title="Valor Aprovado"
          value={formatCurrency(stats.approved)}
          icon={CheckCircle}
          iconClassName="bg-success/10 text-success"
        />
        <StatCard
          title="Valor Pago"
          value={formatCurrency(stats.paid)}
          icon={DollarSign}
          iconClassName="bg-purple-500/10 text-purple-500"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Por Status</CardTitle>
            <CardDescription>Distribuição por status das solicitações</CardDescription>
          </CardHeader>
          <CardContent>
            {statusChartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={statusChartData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis />
                    <Tooltip 
                      formatter={(value: number, name: string) => 
                        name === 'valor' ? formatCurrency(value) : value
                      }
                    />
                    <Legend />
                    <Bar dataKey="quantidade" name="Quantidade" fill="hsl(var(--primary))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Por Tipo de Despesa</CardTitle>
            <CardDescription>Distribuição do valor por categoria</CardDescription>
          </CardHeader>
          <CardContent>
            {typeChartData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={typeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    >
                      {typeChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="flex h-[300px] items-center justify-center text-muted-foreground">
                Nenhum dado disponível
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Detalhamento</CardTitle>
          <CardDescription>
            {filteredRequests.length} solicitação(ões) encontrada(s)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data Despesa</TableHead>
                  <TableHead>Data Criação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.slice(0, 50).map((request) => (
                  <TableRow key={request.id}>
                    <TableCell className="font-medium">{request.title}</TableCell>
                    <TableCell>{request.profiles?.full_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {EXPENSE_TYPE_LABELS[request.expense_type]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-semibold">
                      {formatCurrency(Number(request.amount))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={request.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(request.expense_date), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(new Date(request.created_at), 'dd/MM/yyyy', { locale: ptBR })}
                    </TableCell>
                  </TableRow>
                ))}
                {filteredRequests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      Nenhuma solicitação encontrada com os filtros aplicados
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
          {filteredRequests.length > 50 && (
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Exibindo 50 de {filteredRequests.length} registros. Exporte para ver todos.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
