import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

const STATUS_LABELS: Record<string, string> = {
  rascunho: 'Rascunho',
  enviado: 'Enviado',
  em_aprovacao_gerente: 'Em aprovação (Gerente)',
  ajuste_solicitado: 'Ajuste solicitado',
  em_aprovacao_financeiro: 'Em aprovação (Financeiro)',
  aprovado: 'Aprovado',
  reprovado: 'Reprovado',
  pago: 'Pago',
};

interface Notification {
  id: string;
  message: string;
  timestamp: Date;
  read: boolean;
  requestId: string;
}

interface TrackedRequest {
  id: string;
  status: string;
  title: string;
}

const POLL_INTERVAL = 30000; // 30 seconds

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const previousRequests = useRef<Map<string, TrackedRequest>>(new Map());
  const initialized = useRef(false);

  const markAllRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  }, []);

  useEffect(() => {
    if (!user) return;

    const checkForUpdates = async () => {
      const { data, error } = await supabase
        .from('reimbursement_requests')
        .select('id, status, title')
        .eq('user_id', user.id);

      if (error || !data) return;

      const currentMap = new Map<string, TrackedRequest>();
      for (const req of data) {
        currentMap.set(req.id, { id: req.id, status: req.status, title: req.title });
      }

      // Only detect changes after first load
      if (initialized.current) {
        for (const [id, current] of currentMap) {
          const prev = previousRequests.current.get(id);
          if (prev && prev.status !== current.status) {
            const statusLabel = STATUS_LABELS[current.status] || current.status;
            const message = `"${current.title}" mudou para: ${statusLabel}`;

            const notification: Notification = {
              id: crypto.randomUUID(),
              message,
              timestamp: new Date(),
              read: false,
              requestId: id,
            };

            setNotifications(prev => [notification, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);

            toast({
              title: '📋 Atualização de Solicitação',
              description: message,
            });
          }
        }
      }

      previousRequests.current = currentMap;
      initialized.current = true;
    };

    checkForUpdates();
    const interval = setInterval(checkForUpdates, POLL_INTERVAL);

    return () => clearInterval(interval);
  }, [user, toast]);

  return { notifications, unreadCount, markAllRead, markRead };
}
