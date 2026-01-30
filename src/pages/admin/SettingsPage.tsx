import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger 
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { 
  Settings, 
  Shield, 
  Mail, 
  Tags,
  Building2,
  Workflow,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Save,
  Sliders
} from 'lucide-react';
import { 
  CostCenter, 
  EmailTemplate, 
  EXPENSE_TYPE_LABELS, 
  STATUS_LABELS,
  ROLE_LABELS,
  ExpenseType,
  ReimbursementStatus,
  AppRole
} from '@/types/reimbursement';

interface Department {
  id: string;
  name: string;
  description: string | null;
}

interface SystemSetting {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  
  // Cost Centers
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | null>(null);
  const [costCenterForm, setCostCenterForm] = useState({ code: '', name: '', active: true });
  const [costCenterDialogOpen, setCostCenterDialogOpen] = useState(false);
  
  // Departments
  const [departments, setDepartments] = useState<Department[]>([]);
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [departmentForm, setDepartmentForm] = useState({ name: '', description: '' });
  const [departmentDialogOpen, setDepartmentDialogOpen] = useState(false);
  
  // Email Templates
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({ 
    trigger_status: 'enviado' as ReimbursementStatus, 
    subject: '', 
    body: '', 
    active: true 
  });
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);

  // System Settings
  const [systemSettings, setSystemSettings] = useState<SystemSetting[]>([]);
  const [settingsForm, setSettingsForm] = useState({
    max_reimbursement_amount: 10000,
    require_receipt: true,
    auto_approve_below: 0,
    session_timeout_minutes: 30,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      const [costCentersRes, departmentsRes, templatesRes, settingsRes] = await Promise.all([
        supabase.from('cost_centers').select('*').order('code'),
        supabase.from('departments').select('*').order('name'),
        supabase.from('email_templates').select('*').order('trigger_status'),
        supabase.from('system_settings').select('*').order('key'),
      ]);

      if (costCentersRes.data) setCostCenters(costCentersRes.data);
      if (departmentsRes.data) setDepartments(departmentsRes.data);
      if (templatesRes.data) setEmailTemplates(templatesRes.data as EmailTemplate[]);
      if (settingsRes.data) {
        const settingsData = settingsRes.data as Array<{
          id: string;
          key: string;
          value: Record<string, unknown>;
          description: string | null;
        }>;
        setSystemSettings(settingsData);
        // Parse settings into form
        const settings: Record<string, number | boolean> = {};
        settingsData.forEach(s => {
          const val = s.value as Record<string, unknown>;
          if (val && 'value' in val) {
            settings[s.key] = val.value as number | boolean;
          }
        });
        setSettingsForm({
          max_reimbursement_amount: (settings.max_reimbursement_amount as number) || 10000,
          require_receipt: (settings.require_receipt as boolean) ?? true,
          auto_approve_below: (settings.auto_approve_below as number) || 0,
          session_timeout_minutes: (settings.session_timeout_minutes as number) || 30,
        });
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  }

  // Cost Center functions
  async function handleSaveCostCenter() {
    setSaving(true);
    try {
      if (editingCostCenter) {
        const { error } = await supabase
          .from('cost_centers')
          .update(costCenterForm)
          .eq('id', editingCostCenter.id);
        if (error) throw error;
        toast({ title: 'Centro de custo atualizado' });
      } else {
        const { error } = await supabase
          .from('cost_centers')
          .insert(costCenterForm);
        if (error) throw error;
        toast({ title: 'Centro de custo criado' });
      }
      setCostCenterDialogOpen(false);
      setEditingCostCenter(null);
      setCostCenterForm({ code: '', name: '', active: true });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteCostCenter(id: string) {
    if (!confirm('Tem certeza que deseja excluir este centro de custo?')) return;
    try {
      const { error } = await supabase.from('cost_centers').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Centro de custo excluído' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  }

  // Department functions
  async function handleSaveDepartment() {
    setSaving(true);
    try {
      if (editingDepartment) {
        const { error } = await supabase
          .from('departments')
          .update(departmentForm)
          .eq('id', editingDepartment.id);
        if (error) throw error;
        toast({ title: 'Departamento atualizado' });
      } else {
        const { error } = await supabase
          .from('departments')
          .insert(departmentForm);
        if (error) throw error;
        toast({ title: 'Departamento criado' });
      }
      setDepartmentDialogOpen(false);
      setEditingDepartment(null);
      setDepartmentForm({ name: '', description: '' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDepartment(id: string) {
    if (!confirm('Tem certeza que deseja excluir este departamento?')) return;
    try {
      const { error } = await supabase.from('departments').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Departamento excluído' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  }

  // Email Template functions
  async function handleSaveTemplate() {
    setSaving(true);
    try {
      if (editingTemplate) {
        const { error } = await supabase
          .from('email_templates')
          .update(templateForm)
          .eq('id', editingTemplate.id);
        if (error) throw error;
        toast({ title: 'Template atualizado' });
      } else {
        const { error } = await supabase
          .from('email_templates')
          .insert(templateForm);
        if (error) throw error;
        toast({ title: 'Template criado' });
      }
      setTemplateDialogOpen(false);
      setEditingTemplate(null);
      setTemplateForm({ trigger_status: 'enviado', subject: '', body: '', active: true });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;
    try {
      const { error } = await supabase.from('email_templates').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Template excluído' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  }

  // System Settings functions
  async function handleSaveSystemSettings() {
    setSaving(true);
    try {
      const updates = [
        { key: 'max_reimbursement_amount', value: { value: settingsForm.max_reimbursement_amount } },
        { key: 'require_receipt', value: { value: settingsForm.require_receipt } },
        { key: 'auto_approve_below', value: { value: settingsForm.auto_approve_below } },
        { key: 'session_timeout_minutes', value: { value: settingsForm.session_timeout_minutes } },
      ];

      for (const update of updates) {
        const { error } = await supabase
          .from('system_settings')
          .update({ value: update.value })
          .eq('key', update.key);
        if (error) throw error;
      }

      toast({ title: 'Configurações salvas com sucesso!' });
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Gerencie as configurações do sistema"
        icon={Settings}
      />

      <Tabs defaultValue="system" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
          <TabsTrigger value="system" className="gap-2">
            <Sliders className="h-4 w-4" />
            <span className="hidden sm:inline">Sistema</span>
          </TabsTrigger>
          <TabsTrigger value="cost-centers" className="gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Centros de Custo</span>
          </TabsTrigger>
          <TabsTrigger value="departments" className="gap-2">
            <Tags className="h-4 w-4" />
            <span className="hidden sm:inline">Departamentos</span>
          </TabsTrigger>
          <TabsTrigger value="email-templates" className="gap-2">
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Templates de E-mail</span>
          </TabsTrigger>
          <TabsTrigger value="workflow" className="gap-2">
            <Workflow className="h-4 w-4" />
            <span className="hidden sm:inline">Fluxo</span>
          </TabsTrigger>
        </TabsList>

        {/* System Settings Tab */}
        <TabsContent value="system">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Sistema</CardTitle>
              <CardDescription>Defina os parâmetros gerais do sistema de reembolso</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="max_amount">Valor Máximo por Reembolso (R$)</Label>
                  <Input
                    id="max_amount"
                    type="number"
                    min="0"
                    step="100"
                    value={settingsForm.max_reimbursement_amount}
                    onChange={(e) => setSettingsForm({ ...settingsForm, max_reimbursement_amount: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">Limite máximo para cada solicitação de reembolso</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="auto_approve">Aprovação Automática até (R$)</Label>
                  <Input
                    id="auto_approve"
                    type="number"
                    min="0"
                    step="10"
                    value={settingsForm.auto_approve_below}
                    onChange={(e) => setSettingsForm({ ...settingsForm, auto_approve_below: parseFloat(e.target.value) || 0 })}
                  />
                  <p className="text-xs text-muted-foreground">Valores abaixo deste limite são aprovados automaticamente (0 = desativado)</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="timeout">Timeout de Sessão (minutos)</Label>
                  <Input
                    id="timeout"
                    type="number"
                    min="5"
                    max="480"
                    value={settingsForm.session_timeout_minutes}
                    onChange={(e) => setSettingsForm({ ...settingsForm, session_timeout_minutes: parseInt(e.target.value) || 30 })}
                  />
                  <p className="text-xs text-muted-foreground">Tempo de inatividade para logout automático</p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-lg border">
                  <div className="space-y-1">
                    <Label>Exigir Comprovante</Label>
                    <p className="text-xs text-muted-foreground">Solicitar upload de comprovante para todas as despesas</p>
                  </div>
                  <Switch
                    checked={settingsForm.require_receipt}
                    onCheckedChange={(checked) => setSettingsForm({ ...settingsForm, require_receipt: checked })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveSystemSettings} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                  Salvar Configurações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Cost Centers Tab */}
        <TabsContent value="cost-centers">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Centros de Custo</CardTitle>
                <CardDescription>Gerencie os centros de custo disponíveis</CardDescription>
              </div>
              <Dialog open={costCenterDialogOpen} onOpenChange={setCostCenterDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingCostCenter(null);
                    setCostCenterForm({ code: '', name: '', active: true });
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Centro
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingCostCenter ? 'Editar Centro de Custo' : 'Novo Centro de Custo'}
                    </DialogTitle>
                    <DialogDescription>
                      Preencha os dados do centro de custo
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Código</Label>
                      <Input
                        value={costCenterForm.code}
                        onChange={(e) => setCostCenterForm({ ...costCenterForm, code: e.target.value })}
                        placeholder="Ex: CC001"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input
                        value={costCenterForm.name}
                        onChange={(e) => setCostCenterForm({ ...costCenterForm, name: e.target.value })}
                        placeholder="Nome do centro de custo"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label>Ativo</Label>
                      <Switch
                        checked={costCenterForm.active}
                        onCheckedChange={(checked) => setCostCenterForm({ ...costCenterForm, active: checked })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setCostCenterDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveCostCenter} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {costCenters.map((cc) => (
                    <TableRow key={cc.id}>
                      <TableCell className="font-medium">{cc.code}</TableCell>
                      <TableCell>{cc.name}</TableCell>
                      <TableCell>
                        <Badge variant={cc.active ? 'default' : 'secondary'}>
                          {cc.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingCostCenter(cc);
                              setCostCenterForm({ code: cc.code, name: cc.name, active: cc.active });
                              setCostCenterDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDeleteCostCenter(cc.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {costCenters.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum centro de custo cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Departments Tab */}
        <TabsContent value="departments">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Departamentos</CardTitle>
                <CardDescription>Gerencie os departamentos da empresa</CardDescription>
              </div>
              <Dialog open={departmentDialogOpen} onOpenChange={setDepartmentDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingDepartment(null);
                    setDepartmentForm({ name: '', description: '' });
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Departamento
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {editingDepartment ? 'Editar Departamento' : 'Novo Departamento'}
                    </DialogTitle>
                    <DialogDescription>
                      Preencha os dados do departamento
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome</Label>
                      <Input
                        value={departmentForm.name}
                        onChange={(e) => setDepartmentForm({ ...departmentForm, name: e.target.value })}
                        placeholder="Nome do departamento"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea
                        value={departmentForm.description}
                        onChange={(e) => setDepartmentForm({ ...departmentForm, description: e.target.value })}
                        placeholder="Descrição opcional"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDepartmentDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveDepartment} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((dept) => (
                    <TableRow key={dept.id}>
                      <TableCell className="font-medium">{dept.name}</TableCell>
                      <TableCell className="text-muted-foreground">{dept.description || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingDepartment(dept);
                              setDepartmentForm({ name: dept.name, description: dept.description || '' });
                              setDepartmentDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDeleteDepartment(dept.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {departments.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground py-8">
                        Nenhum departamento cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Email Templates Tab */}
        <TabsContent value="email-templates">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Templates de E-mail</CardTitle>
                <CardDescription>Configure os e-mails automáticos do sistema</CardDescription>
              </div>
              <Dialog open={templateDialogOpen} onOpenChange={setTemplateDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => {
                    setEditingTemplate(null);
                    setTemplateForm({ trigger_status: 'enviado', subject: '', body: '', active: true });
                  }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Template
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>
                      {editingTemplate ? 'Editar Template' : 'Novo Template de E-mail'}
                    </DialogTitle>
                    <DialogDescription>
                      Configure o template de e-mail para um status específico
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Status de Disparo</Label>
                        <Select
                          value={templateForm.trigger_status}
                          onValueChange={(value) => setTemplateForm({ ...templateForm, trigger_status: value as ReimbursementStatus })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STATUS_LABELS).map(([value, label]) => (
                              <SelectItem key={value} value={value}>{label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center justify-between pt-6">
                        <Label>Ativo</Label>
                        <Switch
                          checked={templateForm.active}
                          onCheckedChange={(checked) => setTemplateForm({ ...templateForm, active: checked })}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Assunto</Label>
                      <Input
                        value={templateForm.subject}
                        onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
                        placeholder="Assunto do e-mail"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Corpo do E-mail</Label>
                      <Textarea
                        value={templateForm.body}
                        onChange={(e) => setTemplateForm({ ...templateForm, body: e.target.value })}
                        placeholder="Conteúdo do e-mail. Use {{nome}}, {{status}}, {{valor}} como variáveis."
                        rows={8}
                      />
                      <p className="text-xs text-muted-foreground">
                        Variáveis disponíveis: {'{{nome}}'}, {'{{email}}'}, {'{{titulo}}'}, {'{{valor}}'}, {'{{status}}'}
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setTemplateDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleSaveTemplate} disabled={saving}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                      Salvar
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status de Disparo</TableHead>
                    <TableHead>Assunto</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-[100px]">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {emailTemplates.map((template) => (
                    <TableRow key={template.id}>
                      <TableCell>
                        <Badge variant="outline">{STATUS_LABELS[template.trigger_status]}</Badge>
                      </TableCell>
                      <TableCell className="font-medium">{template.subject}</TableCell>
                      <TableCell>
                        <Badge variant={template.active ? 'default' : 'secondary'}>
                          {template.active ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setEditingTemplate(template);
                              setTemplateForm({
                                trigger_status: template.trigger_status,
                                subject: template.subject,
                                body: template.body,
                                active: template.active,
                              });
                              setTemplateDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            onClick={() => handleDeleteTemplate(template.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {emailTemplates.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        Nenhum template cadastrado
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workflow Tab */}
        <TabsContent value="workflow">
          <Card>
            <CardHeader>
              <CardTitle>Fluxo de Aprovação</CardTitle>
              <CardDescription>Visualize o fluxo de aprovação de reembolsos</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <Card className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Shield className="h-5 w-5 text-primary" />
                      Cargos do Sistema
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(ROLE_LABELS).map(([role, label]) => (
                        <div key={role} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <span className="font-medium">{label}</span>
                          <Badge variant="outline">{role}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Workflow className="h-5 w-5 text-primary" />
                      Status Disponíveis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {Object.entries(STATUS_LABELS).map(([status, label]) => (
                        <div key={status} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                          <span className="font-medium">{label}</span>
                          <Badge variant="outline">{status}</Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-2">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Tags className="h-5 w-5 text-primary" />
                    Tipos de Despesa
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                    {Object.entries(EXPENSE_TYPE_LABELS).map(([type, label]) => (
                      <div key={type} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                        <span className="font-medium">{label}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
