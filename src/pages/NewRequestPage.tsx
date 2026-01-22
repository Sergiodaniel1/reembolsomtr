import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Send } from 'lucide-react';
import { ExpenseType, EXPENSE_TYPE_LABELS, CostCenter } from '@/types/reimbursement';
import { z } from 'zod';

const schema = z.object({
  title: z.string().min(3, 'Título deve ter pelo menos 3 caracteres'),
  expense_type: z.string().min(1, 'Selecione o tipo de despesa'),
  amount: z.number().min(0.01, 'Valor deve ser maior que zero'),
  expense_date: z.string().min(1, 'Data é obrigatória'),
  description: z.string().optional(),
  cost_center_id: z.string().optional(),
});

export default function NewRequestPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [loading, setLoading] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [form, setForm] = React.useState({
    title: '', expense_type: '', amount: '', expense_date: '', description: '', cost_center_id: '',
  });

  const { data: costCenters = [] } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const { data } = await supabase.from('cost_centers').select('*').eq('active', true);
      return (data || []) as CostCenter[];
    },
  });

  const handleSubmit = async (asDraft: boolean) => {
    setErrors({});
    const parsed = schema.safeParse({ ...form, amount: parseFloat(form.amount) || 0 });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach(e => { if (e.path[0]) fieldErrors[e.path[0] as string] = e.message; });
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.from('reimbursement_requests').insert({
        user_id: user!.id,
        title: form.title,
        expense_type: form.expense_type as ExpenseType,
        amount: parseFloat(form.amount),
        expense_date: form.expense_date,
        description: form.description || null,
        cost_center_id: form.cost_center_id || null,
        status: asDraft ? 'rascunho' : 'enviado',
        submitted_at: asDraft ? null : new Date().toISOString(),
      });
      if (error) throw error;
      
      queryClient.invalidateQueries({ queryKey: ['my-requests'] });
      toast({ title: asDraft ? 'Rascunho salvo!' : 'Solicitação enviada!', description: asDraft ? 'Você pode continuar editando depois.' : 'Aguarde a aprovação do seu gerente.' });
      navigate('/minhas-solicitacoes');
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader title="Nova Solicitação" description="Preencha os dados da sua solicitação de reembolso" />

      <Card>
        <CardHeader><CardTitle>Dados da Despesa</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Título *</Label>
            <Input placeholder="Ex: Almoço com cliente" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            {errors.title && <p className="text-sm text-destructive">{errors.title}</p>}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tipo de Despesa *</Label>
              <Select value={form.expense_type} onValueChange={(v) => setForm({ ...form, expense_type: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_TYPE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.expense_type && <p className="text-sm text-destructive">{errors.expense_type}</p>}
            </div>

            <div className="space-y-2">
              <Label>Valor (R$) *</Label>
              <Input type="number" step="0.01" min="0" placeholder="0,00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              {errors.amount && <p className="text-sm text-destructive">{errors.amount}</p>}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Data da Despesa *</Label>
              <Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
              {errors.expense_date && <p className="text-sm text-destructive">{errors.expense_date}</p>}
            </div>

            <div className="space-y-2">
              <Label>Centro de Custo</Label>
              <Select value={form.cost_center_id} onValueChange={(v) => setForm({ ...form, cost_center_id: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {costCenters.map((cc) => (
                    <SelectItem key={cc.id} value={cc.id}>{cc.code} - {cc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Descrição</Label>
            <Textarea placeholder="Descreva os detalhes da despesa..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => handleSubmit(true)} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Salvar Rascunho
            </Button>
            <Button onClick={() => handleSubmit(false)} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar para Aprovação
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
