import React from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import { EXPENSE_TYPE_LABELS, ExpenseType } from '@/types/reimbursement';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

interface CategoryLimit {
  category: ExpenseType;
  maxAmount: number;
  requiresSpecialApproval: number;
}

interface PolicyFormData {
  maxSubmissionDays: number;
  specialApprovalThreshold: number;
  categoryLimits: Record<string, CategoryLimit>;
  allowedCategories: ExpenseType[];
}

export function PolicySettingsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState<PolicyFormData>({
    maxSubmissionDays: 30,
    specialApprovalThreshold: 5000,
    categoryLimits: {},
    allowedCategories: Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[],
  });
  const [newCategory, setNewCategory] = React.useState<ExpenseType | ''>('');

  React.useEffect(() => {
    loadPolicy();
  }, []);

  async function loadPolicy() {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'reimbursement_policy')
        .single();

      if (data?.value) {
        const val = data.value as Record<string, unknown>;
        const policy = val.value ?? val;
        if (typeof policy === 'object' && policy !== null) {
          const p = policy as any;
          setForm({
            maxSubmissionDays: p.maxSubmissionDays ?? 30,
            specialApprovalThreshold: p.specialApprovalThreshold ?? 5000,
            categoryLimits: p.categoryLimits ?? {},
            allowedCategories: p.allowedCategories ?? Object.keys(EXPENSE_TYPE_LABELS),
          });
        }
      }
    } catch {
      // No policy yet, use defaults
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('system_settings')
        .upsert({
          key: 'reimbursement_policy',
          value: { value: form },
          description: 'Política de reembolso configurável',
        }, { onConflict: 'key' });
      if (error) throw error;
      toast({ title: '✅ Política salva com sucesso!' });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function addCategoryLimit() {
    if (!newCategory) return;
    setForm(prev => ({
      ...prev,
      categoryLimits: {
        ...prev.categoryLimits,
        [newCategory]: { category: newCategory, maxAmount: 1000, requiresSpecialApproval: 500 },
      },
    }));
    setNewCategory('');
  }

  function removeCategoryLimit(cat: string) {
    setForm(prev => {
      const newLimits = { ...prev.categoryLimits };
      delete newLimits[cat];
      return { ...prev, categoryLimits: newLimits };
    });
  }

  function updateCategoryLimit(cat: string, field: 'maxAmount' | 'requiresSpecialApproval', value: number) {
    setForm(prev => ({
      ...prev,
      categoryLimits: {
        ...prev.categoryLimits,
        [cat]: { ...prev.categoryLimits[cat], [field]: value },
      },
    }));
  }

  function toggleCategory(cat: ExpenseType) {
    setForm(prev => {
      const isAllowed = prev.allowedCategories.includes(cat);
      return {
        ...prev,
        allowedCategories: isAllowed
          ? prev.allowedCategories.filter(c => c !== cat)
          : [...prev.allowedCategories, cat],
      };
    });
  }

  if (loading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  const categoriesWithoutLimits = (Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[])
    .filter(cat => !form.categoryLimits[cat]);

  return (
    <div className="space-y-6">
      {/* General Policy */}
      <Card>
        <CardHeader>
          <CardTitle>Regras Gerais</CardTitle>
          <CardDescription>Defina as regras gerais da política de reembolso</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Prazo máximo para envio (dias)</Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={form.maxSubmissionDays}
                onChange={(e) => setForm({ ...form, maxSubmissionDays: parseInt(e.target.value) || 30 })}
              />
              <p className="text-xs text-muted-foreground">Dias após a data da despesa para envio do reembolso</p>
            </div>
            <div className="space-y-2">
              <Label>Aprovação especial acima de (R$)</Label>
              <Input
                type="number"
                min="0"
                step="100"
                value={form.specialApprovalThreshold}
                onChange={(e) => setForm({ ...form, specialApprovalThreshold: parseFloat(e.target.value) || 0 })}
              />
              <p className="text-xs text-muted-foreground">Solicitações acima deste valor serão sinalizadas</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Allowed Categories */}
      <Card>
        <CardHeader>
          <CardTitle>Categorias Permitidas</CardTitle>
          <CardDescription>Ative ou desative categorias de despesa</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
            {(Object.entries(EXPENSE_TYPE_LABELS) as [ExpenseType, string][]).map(([cat, label]) => (
              <div key={cat} className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium">{label}</span>
                <Switch
                  checked={form.allowedCategories.includes(cat)}
                  onCheckedChange={() => toggleCategory(cat)}
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Category Limits */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Limites por Categoria</CardTitle>
            <CardDescription>Defina limites máximos e limiares de atenção por tipo de despesa</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {Object.keys(form.categoryLimits).length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Limite Máximo (R$)</TableHead>
                  <TableHead>Atenção Especial (R$)</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {Object.entries(form.categoryLimits).map(([cat, limit]) => (
                  <TableRow key={cat}>
                    <TableCell>
                      <Badge variant="outline">{EXPENSE_TYPE_LABELS[cat as ExpenseType] || cat}</Badge>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={limit.maxAmount}
                        onChange={(e) => updateCategoryLimit(cat, 'maxAmount', parseFloat(e.target.value) || 0)}
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="100"
                        value={limit.requiresSpecialApproval}
                        onChange={(e) => updateCategoryLimit(cat, 'requiresSpecialApproval', parseFloat(e.target.value) || 0)}
                        className="w-32"
                      />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => removeCategoryLimit(cat)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {categoriesWithoutLimits.length > 0 && (
            <div className="flex items-center gap-2">
              <Select value={newCategory} onValueChange={(v) => setNewCategory(v as ExpenseType)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Selecione categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categoriesWithoutLimits.map(cat => (
                    <SelectItem key={cat} value={cat}>{EXPENSE_TYPE_LABELS[cat]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={addCategoryLimit} disabled={!newCategory}>
                <Plus className="h-4 w-4 mr-1" /> Adicionar Limite
              </Button>
            </div>
          )}

          {Object.keys(form.categoryLimits).length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Nenhum limite por categoria configurado. Adicione limites para controlar valores por tipo de despesa.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Política
        </Button>
      </div>
    </div>
  );
}
