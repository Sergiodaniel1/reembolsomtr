import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/empty-state';
import { PlusCircle, Search, Eye } from 'lucide-react';
import { ReimbursementRequest, STATUS_LABELS, EXPENSE_TYPE_LABELS, ReimbursementStatus } from '@/types/reimbursement';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function MyRequestsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [search, setSearch] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<string>('all');

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ['my-requests', user?.id],
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

  const filteredRequests = requests.filter(r => {
    const matchesSearch = r.title.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <PageHeader title="Minhas Solicitações" description="Acompanhe todas as suas solicitações de reembolso">
        <Button onClick={() => navigate('/nova-solicitacao')}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Nova Solicitação
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Buscar por título..." className="pl-10" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Filtrar por status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                {Object.entries(STATUS_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-12"><div className="spinner h-8 w-8 text-primary" /></div>
          ) : filteredRequests.length === 0 ? (
            <EmptyState title="Nenhuma solicitação encontrada" description="Crie sua primeira solicitação de reembolso." action={{ label: 'Nova Solicitação', onClick: () => navigate('/nova-solicitacao') }} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRequests.map((request) => (
                  <TableRow key={request.id} className="table-row-hover cursor-pointer" onClick={() => navigate(`/solicitacao/${request.id}`)}>
                    <TableCell className="font-medium">{request.title}</TableCell>
                    <TableCell>{EXPENSE_TYPE_LABELS[request.expense_type]}</TableCell>
                    <TableCell>{formatCurrency(Number(request.amount))}</TableCell>
                    <TableCell><StatusBadge status={request.status} /></TableCell>
                    <TableCell className="text-muted-foreground">{format(new Date(request.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                    <TableCell><Button variant="ghost" size="icon"><Eye className="h-4 w-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
