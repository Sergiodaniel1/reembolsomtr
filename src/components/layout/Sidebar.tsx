import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  FileText,
  PlusCircle,
  CheckCircle,
  DollarSign,
  Users,
  Settings,
  Building2,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  Receipt,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SidebarProps {
  open: boolean;
  onToggle: () => void;
}

export function Sidebar({ open, onToggle }: SidebarProps) {
  const { hasRole, hasAnyRole, profile } = useAuth();
  const location = useLocation();

  const menuItems = [
    {
      title: 'Dashboard',
      icon: LayoutDashboard,
      href: '/dashboard',
      roles: ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'] as const,
    },
    {
      title: 'Minhas Solicitações',
      icon: FileText,
      href: '/minhas-solicitacoes',
      roles: ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'] as const,
    },
    {
      title: 'Nova Solicitação',
      icon: PlusCircle,
      href: '/nova-solicitacao',
      roles: ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'] as const,
    },
    {
      title: 'Aprovar Solicitações',
      icon: CheckCircle,
      href: '/aprovar',
      roles: ['gerente'] as const,
    },
    {
      title: 'Financeiro',
      icon: DollarSign,
      href: '/financeiro',
      roles: ['financeiro'] as const,
    },
    {
      title: 'Relatórios',
      icon: BarChart3,
      href: '/relatorios',
      roles: ['gerente', 'financeiro', 'admin', 'diretoria'] as const,
    },
    {
      title: 'Meu Perfil',
      icon: Users,
      href: '/perfil',
      roles: ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'] as const,
    },
    {
      title: 'Usuários',
      icon: Users,
      href: '/admin/usuarios',
      roles: ['admin'] as const,
    },
    {
      title: 'Configurações',
      icon: Settings,
      href: '/admin/configuracoes',
      roles: ['admin'] as const,
    },
  ];

  const visibleItems = menuItems.filter(item => hasAnyRole([...item.roles]));

  return (
    <>
      {/* Overlay for mobile */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-screen bg-sidebar transition-all duration-300 flex flex-col",
          open ? "w-64" : "w-20",
          "max-md:translate-x-[-100%]",
          open && "max-md:translate-x-0"
        )}
        style={{ background: 'var(--gradient-sidebar)' }}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
          {open ? (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-ring">
                <Receipt className="h-5 w-5 text-sidebar" />
              </div>
              <span className="font-semibold text-sidebar-foreground">Reembolso</span>
            </div>
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-sidebar-ring mx-auto">
              <Receipt className="h-5 w-5 text-sidebar" />
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto custom-scrollbar p-3">
          <ul className="space-y-1">
            {visibleItems.map((item) => {
              const isActive = location.pathname === item.href || 
                              location.pathname.startsWith(item.href + '/');
              
              const linkContent = (
                <NavLink
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200",
                    "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground",
                    isActive && "sidebar-link-active bg-sidebar-accent text-sidebar-foreground"
                  )}
                >
                  <item.icon className={cn("h-5 w-5 flex-shrink-0", !open && "mx-auto")} />
                  {open && <span>{item.title}</span>}
                </NavLink>
              );

              if (!open) {
                return (
                  <li key={item.href}>
                    <Tooltip delayDuration={0}>
                      <TooltipTrigger asChild>
                        {linkContent}
                      </TooltipTrigger>
                      <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground border-sidebar-border">
                        {item.title}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              }

              return <li key={item.href}>{linkContent}</li>;
            })}
          </ul>
        </nav>

        {/* User info */}
        {profile && open && (
          <div className="border-t border-sidebar-border p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-foreground font-medium text-sm">
                {profile.full_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 overflow-hidden">
                <p className="truncate text-sm font-medium text-sidebar-foreground">
                  {profile.full_name}
                </p>
                <p className="truncate text-xs text-sidebar-foreground/60">
                  {profile.email}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Toggle button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="absolute -right-3 top-20 h-6 w-6 rounded-full border bg-background shadow-md hover:bg-muted hidden md:flex"
        >
          {open ? (
            <ChevronLeft className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
        </Button>
      </aside>
    </>
  );
}
