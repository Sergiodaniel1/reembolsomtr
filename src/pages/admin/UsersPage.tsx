import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
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
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  Users, 
  Plus,
  Pencil,
  Loader2,
  Save,
  Mail,
  Shield,
  Search,
  UserCheck,
  UserX,
  Copy,
  CheckCircle,
  Link2,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { Profile, AppRole, ROLE_LABELS, Department } from '@/types/reimbursement';

interface UserWithRoles extends Profile {
  roles: AppRole[];
  department?: Department;
  managerProfile?: Profile;
}

export default function UsersPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [managers, setManagers] = useState<Profile[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserWithRoles | null>(null);
  const [saving, setSaving] = useState(false);
  
  // State for activation link dialog
  const [activationLinkDialogOpen, setActivationLinkDialogOpen] = useState(false);
  const [activationLink, setActivationLink] = useState<string | null>(null);
  const [createdUserEmail, setCreatedUserEmail] = useState<string>('');
  const [emailWasSent, setEmailWasSent] = useState(false);
  
  // State for delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<UserWithRoles | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [userForm, setUserForm] = useState({
    full_name: '',
    email: '',
    department_id: '',
    manager_id: '',
    active: true,
    roles: [] as AppRole[],
  });

  const allRoles: AppRole[] = ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'];

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    try {
      // Fetch profiles
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (profilesError) throw profilesError;

      // Fetch all user roles
      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) throw rolesError;

      // Fetch departments
      const { data: deptData } = await supabase
        .from('departments')
        .select('*')
        .order('name');
      
      if (deptData) setDepartments(deptData);

      // Combine profiles with roles
      const usersWithRoles: UserWithRoles[] = (profilesData || []).map((profile) => {
        const userRoles = (rolesData || [])
          .filter(r => r.user_id === profile.user_id)
          .map(r => r.role as AppRole);
        
        const department = deptData?.find(d => d.id === profile.department_id);
        const managerProfile = profilesData?.find(p => p.id === profile.manager_id);
        
        return {
          ...profile,
          roles: userRoles,
          department,
          managerProfile,
        };
      });

      setUsers(usersWithRoles);
      
      // Set managers (users with gerente role)
      const managerProfiles = usersWithRoles
        .filter(u => u.roles.includes('gerente') || u.roles.includes('admin'))
        .map(u => ({ ...u } as Profile));
      setManagers(managerProfiles);

    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveUser() {
    setSaving(true);
    try {
      if (editingUser) {
        // Update existing user profile
        const { error: profileError } = await supabase
          .from('profiles')
          .update({
            full_name: userForm.full_name,
            department_id: userForm.department_id || null,
            manager_id: userForm.manager_id || null,
            active: userForm.active,
          })
          .eq('id', editingUser.id);

        if (profileError) throw profileError;

        // Update roles - delete existing and insert new ones
        await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', editingUser.user_id);

        if (userForm.roles.length > 0) {
          const { error: rolesError } = await supabase
            .from('user_roles')
            .insert(userForm.roles.map(role => ({
              user_id: editingUser.user_id,
              role,
            })));
          
          if (rolesError) throw rolesError;
        }

        toast({ title: 'Usuário atualizado com sucesso' });
      } else {
        // Create new user via secure edge function (no password required)
        if (!userForm.email || !userForm.full_name) {
          toast({
            title: 'Erro',
            description: 'Preencha todos os campos obrigatórios',
            variant: 'destructive',
          });
          setSaving(false);
          return;
        }

        if (userForm.roles.length === 0) {
          toast({
            title: 'Erro',
            description: 'Selecione ao menos um cargo para o usuário',
            variant: 'destructive',
          });
          setSaving(false);
          return;
        }

        // Call secure edge function to invite user
        const { data, error: inviteError } = await supabase.functions.invoke('invite-user', {
          body: {
            email: userForm.email,
            full_name: userForm.full_name,
            department_id: userForm.department_id || undefined,
            manager_id: userForm.manager_id || undefined,
            roles: userForm.roles,
          },
        });

        if (inviteError) throw inviteError;

        if (!data?.success) {
          throw new Error(data?.error || 'Erro ao criar usuário');
        }

        // Show activation link dialog if link was generated
        if (data.activationLink) {
          setActivationLink(data.activationLink);
          setCreatedUserEmail(userForm.email);
          setDialogOpen(false);
          setActivationLinkDialogOpen(true);
        } else {
          toast({
            title: 'Usuário criado',
            description: 'O usuário deverá usar "Esqueci minha senha" para definir sua senha.',
          });
        }
      }

      setDialogOpen(false);
      setEditingUser(null);
      resetForm();
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  function resetForm() {
    setUserForm({
      full_name: '',
      email: '',
      department_id: '',
      manager_id: '',
      active: true,
      roles: ['usuario'],
    });
  }

  function openEditDialog(user: UserWithRoles) {
    setEditingUser(user);
    setUserForm({
      full_name: user.full_name,
      email: user.email,
      department_id: user.department_id || '',
      manager_id: user.manager_id || '',
      active: user.active,
      roles: user.roles.length > 0 ? user.roles : ['usuario'],
    });
    setDialogOpen(true);
  }

  function openCreateDialog() {
    setEditingUser(null);
    resetForm();
    setDialogOpen(true);
  }

  function toggleRole(role: AppRole) {
    const newRoles = userForm.roles.includes(role)
      ? userForm.roles.filter(r => r !== role)
      : [...userForm.roles, role];
    setUserForm({ ...userForm, roles: newRoles });
  }

  function openDeleteDialog(user: UserWithRoles) {
    setUserToDelete(user);
    setDeleteDialogOpen(true);
  }

  async function handleDeleteUser() {
    if (!userToDelete) return;
    
    setDeleting(true);
    try {
      const { data, error } = await supabase.functions.invoke('delete-user', {
        body: { user_id: userToDelete.user_id },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Erro ao excluir usuário');

      toast({ title: 'Usuário excluído com sucesso' });
      setDeleteDialogOpen(false);
      setUserToDelete(null);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  const filteredUsers = users.filter(user => {
    const matchesSearch = user.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          user.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || user.roles.includes(filterRole as AppRole);
    const matchesStatus = filterStatus === 'all' || 
                          (filterStatus === 'active' && user.active) ||
                          (filterStatus === 'inactive' && !user.active);
    return matchesSearch && matchesRole && matchesStatus;
  });

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
        title="Gestão de Usuários"
        description="Gerencie os usuários e seus cargos no sistema"
        icon={Users}
      />

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <CardTitle>Usuários</CardTitle>
            <CardDescription>{users.length} usuários cadastrados</CardDescription>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou e-mail..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filtrar por cargo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os cargos</SelectItem>
                {allRoles.map(role => (
                  <SelectItem key={role} value={role}>{ROLE_LABELS[role]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Users Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Cargos</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Gerente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[80px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-medium">
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{user.full_name}</p>
                          <p className="text-sm text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {user.roles.length > 0 ? (
                          user.roles.map(role => (
                            <Badge key={role} variant="secondary" className="text-xs">
                              {ROLE_LABELS[role]}
                            </Badge>
                          ))
                        ) : (
                          <Badge variant="outline" className="text-xs">Usuário</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.department?.name || '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {user.managerProfile?.full_name || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={user.active ? 'default' : 'secondary'} className="gap-1">
                        {user.active ? (
                          <>
                            <UserCheck className="h-3 w-3" />
                            Ativo
                          </>
                        ) : (
                          <>
                            <UserX className="h-3 w-3" />
                            Inativo
                          </>
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(user)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => openDeleteDialog(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filteredUsers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum usuário encontrado
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* User Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingUser ? 'Editar Usuário' : 'Novo Usuário'}
            </DialogTitle>
            <DialogDescription>
              {editingUser 
                ? 'Atualize as informações do usuário' 
                : 'Preencha os dados para criar um novo usuário'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                placeholder="Nome do usuário"
              />
            </div>

            <div className="space-y-2">
              <Label>E-mail *</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  value={userForm.email}
                  onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                  placeholder="email@empresa.com"
                  className="pl-10"
                  disabled={!!editingUser}
                />
              </div>
            </div>

            {!editingUser && (
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-sm text-muted-foreground">
                  <strong>Nota:</strong> O usuário receberá um e-mail de convite para definir sua própria senha de forma segura.
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Departamento</Label>
                <Select
                  value={userForm.department_id || "none"}
                  onValueChange={(value) => setUserForm({ ...userForm, department_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Gerente Responsável</Label>
                <Select
                  value={userForm.manager_id || "none"}
                  onValueChange={(value) => setUserForm({ ...userForm, manager_id: value === "none" ? "" : value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {managers.filter(m => m.id !== editingUser?.id).map(manager => (
                      <SelectItem key={manager.id} value={manager.id}>{manager.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-3">
              <Label className="flex items-center gap-2">
                <Shield className="h-4 w-4" />
                Cargos
              </Label>
              <div className="grid grid-cols-2 gap-2">
                {allRoles.map(role => (
                  <div
                    key={role}
                    className="flex items-center space-x-2 rounded-lg border p-3 cursor-pointer hover:bg-muted/50"
                    onClick={() => toggleRole(role)}
                  >
                    <Checkbox
                      checked={userForm.roles.includes(role)}
                      onCheckedChange={() => toggleRole(role)}
                    />
                    <Label className="cursor-pointer">{ROLE_LABELS[role]}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label>Status do usuário</Label>
                <p className="text-sm text-muted-foreground">
                  Usuários inativos não podem acessar o sistema
                </p>
              </div>
              <Switch
                checked={userForm.active}
                onCheckedChange={(checked) => setUserForm({ ...userForm, active: checked })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveUser} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Salvando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Salvar
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Activation Link Dialog */}
      <Dialog open={activationLinkDialogOpen} onOpenChange={(open) => {
        setActivationLinkDialogOpen(open);
        if (!open) {
          setActivationLink(null);
          setCreatedUserEmail('');
          resetForm();
          fetchData();
        }
      }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle className="h-8 w-8 text-primary" />
              </div>
            </div>
            <DialogTitle className="text-center">Usuário Criado com Sucesso!</DialogTitle>
            <DialogDescription className="text-center">
              O usuário <strong>{createdUserEmail}</strong> foi criado. Envie o link abaixo para que o usuário defina sua senha.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Link de Ativação
              </Label>
              <div className="flex gap-2">
                <Input
                  value={activationLink || ''}
                  readOnly
                  className="font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (activationLink) {
                      navigator.clipboard.writeText(activationLink);
                      toast({
                        title: 'Link copiado!',
                        description: 'O link foi copiado para a área de transferência.',
                      });
                    }
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Este link expira em 24 horas. Após esse período, o usuário deverá usar "Esqueci minha senha" para obter um novo link.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => {
              setActivationLinkDialogOpen(false);
              setActivationLink(null);
              setCreatedUserEmail('');
              resetForm();
              fetchData();
            }}>
              Concluir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex justify-center mb-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-8 w-8 text-destructive" />
              </div>
            </div>
            <DialogTitle className="text-center">Excluir Usuário</DialogTitle>
            <DialogDescription className="text-center">
              Tem certeza que deseja excluir o usuário <strong>{userToDelete?.full_name}</strong>?
              <br />
              <span className="text-destructive">Esta ação não pode ser desfeita.</span>
            </DialogDescription>
          </DialogHeader>
          
          <div className="rounded-lg bg-muted/50 p-3">
            <p className="text-sm text-muted-foreground">
              Ao excluir este usuário:
            </p>
            <ul className="text-sm text-muted-foreground mt-2 space-y-1 list-disc list-inside">
              <li>Todos os dados do perfil serão removidos</li>
              <li>Os cargos atribuídos serão removidos</li>
              <li>O usuário não poderá mais acessar o sistema</li>
            </ul>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleDeleteUser}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir Usuário
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
