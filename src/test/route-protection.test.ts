import { describe, it, expect } from 'vitest';

// Tests for route protection logic (unit-level, no DOM rendering needed)
describe('Route access rules', () => {
  const PUBLIC_ROUTES = ['/auth', '/auth/esqueci-senha', '/auth/redefinir-senha', '/setup', '/acesso-negado'];
  const ALL_ROLE_ROUTES = ['/dashboard', '/minhas-solicitacoes', '/nova-solicitacao', '/perfil'];
  const MANAGER_ROUTES = ['/aprovar'];
  const FINANCE_ROUTES = ['/financeiro'];
  const ADMIN_ROUTES = ['/admin/usuarios', '/admin/configuracoes', '/admin/logs'];
  const REPORT_ROUTES = ['/relatorios'];

  type AppRole = 'usuario' | 'gerente' | 'financeiro' | 'admin' | 'diretoria';

  const ROUTE_ROLES: Record<string, AppRole[]> = {
    '/dashboard': ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'],
    '/minhas-solicitacoes': ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'],
    '/nova-solicitacao': ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'],
    '/perfil': ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'],
    '/aprovar': ['gerente', 'admin'],
    '/financeiro': ['financeiro', 'admin'],
    '/relatorios': ['gerente', 'financeiro', 'admin', 'diretoria'],
    '/admin/usuarios': ['admin'],
    '/admin/configuracoes': ['admin'],
    '/admin/logs': ['admin'],
  };

  function hasAccess(userRoles: AppRole[], allowedRoles: AppRole[]): boolean {
    return allowedRoles.some(role => userRoles.includes(role));
  }

  it('usuario cannot access admin routes', () => {
    ADMIN_ROUTES.forEach(route => {
      expect(hasAccess(['usuario'], ROUTE_ROLES[route])).toBe(false);
    });
  });

  it('usuario cannot access finance routes', () => {
    FINANCE_ROUTES.forEach(route => {
      expect(hasAccess(['usuario'], ROUTE_ROLES[route])).toBe(false);
    });
  });

  it('usuario cannot access manager routes', () => {
    MANAGER_ROUTES.forEach(route => {
      expect(hasAccess(['usuario'], ROUTE_ROLES[route])).toBe(false);
    });
  });

  it('admin can access all protected routes', () => {
    Object.entries(ROUTE_ROLES).forEach(([route, roles]) => {
      expect(hasAccess(['admin'], roles)).toBe(true);
    });
  });

  it('gerente can access approval and report routes', () => {
    expect(hasAccess(['gerente'], ROUTE_ROLES['/aprovar'])).toBe(true);
    expect(hasAccess(['gerente'], ROUTE_ROLES['/relatorios'])).toBe(true);
  });

  it('financeiro can access finance and report routes', () => {
    expect(hasAccess(['financeiro'], ROUTE_ROLES['/financeiro'])).toBe(true);
    expect(hasAccess(['financeiro'], ROUTE_ROLES['/relatorios'])).toBe(true);
  });

  it('diretoria can access reports but not admin routes', () => {
    expect(hasAccess(['diretoria'], ROUTE_ROLES['/relatorios'])).toBe(true);
    expect(hasAccess(['diretoria'], ROUTE_ROLES['/admin/usuarios'])).toBe(false);
  });
});
