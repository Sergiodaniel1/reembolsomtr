import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import MyRequestsPage from "./pages/MyRequestsPage";
import NewRequestPage from "./pages/NewRequestPage";
import ProfilePage from "./pages/ProfilePage";
import ManagerApprovalPage from "./pages/ManagerApprovalPage";
import FinancePage from "./pages/FinancePage";
import ReportsPage from "./pages/ReportsPage";
import SettingsPage from "./pages/admin/SettingsPage";
import UsersPage from "./pages/admin/UsersPage";
import AuditLogsPage from "./pages/admin/AuditLogsPage";
import AccessDeniedPage from "./pages/AccessDeniedPage";
import SetupPage from "./pages/SetupPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/setup" element={<SetupPage />} />
            <Route path="/acesso-negado" element={<AccessDeniedPage />} />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/minhas-solicitacoes" element={<MyRequestsPage />} />
              <Route path="/nova-solicitacao" element={<NewRequestPage />} />
              <Route path="/perfil" element={<ProfilePage />} />
              
              {/* Manager Routes */}
              <Route 
                path="/aprovar" 
                element={
                  <ProtectedRoute allowedRoles={['gerente', 'admin']}>
                    <ManagerApprovalPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Finance Routes */}
              <Route 
                path="/financeiro" 
                element={
                  <ProtectedRoute allowedRoles={['financeiro', 'admin']}>
                    <FinancePage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Reports Routes */}
              <Route 
                path="/relatorios" 
                element={
                  <ProtectedRoute allowedRoles={['gerente', 'financeiro', 'admin', 'diretoria']}>
                    <ReportsPage />
                  </ProtectedRoute>
                } 
              />
              
              {/* Admin Routes */}
              <Route 
                path="/admin/usuarios" 
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <UsersPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/configuracoes" 
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <SettingsPage />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/admin/logs" 
                element={
                  <ProtectedRoute allowedRoles={['admin']}>
                    <AuditLogsPage />
                  </ProtectedRoute>
                } 
              />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
