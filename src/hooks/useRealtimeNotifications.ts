import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { ReimbursementStatus } from '@/types/reimbursement';

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

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

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

    const channel = supabase
      .channel('reimbursement-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'reimbursement_requests',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const oldStatus = (payload.old as any)?.status;
          const newStatus = (payload.new as any)?.status;
          const title = (payload.new as any)?.title || 'Solicitação';

          if (oldStatus !== newStatus && newStatus) {
            const statusLabel = STATUS_LABELS[newStatus] || newStatus;
            const message = `"${title}" mudou para: ${statusLabel}`;

            const notification: Notification = {
              id: crypto.randomUUID(),
              message,
              timestamp: new Date(),
              read: false,
              requestId: (payload.new as any)?.id,
            };

            setNotifications(prev => [notification, ...prev].slice(0, 50));
            setUnreadCount(prev => prev + 1);

            toast({
              title: '📋 Atualização de Solicitação',
              description: message,
            });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, toast]);

  return { notifications, unreadCount, markAllRead, markRead };
}
