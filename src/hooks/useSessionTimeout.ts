import { useEffect, useCallback, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SystemSetting {
  key: string;
  value: { value: number };
}

export function useSessionTimeout() {
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(30);

  // Fetch timeout setting
  useEffect(() => {
    async function fetchTimeout() {
      const { data } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', 'session_timeout_minutes')
        .single();
      
      if (data?.value) {
        const val = data.value as { value?: number };
        if (val.value) {
          setTimeoutMinutes(val.value);
        }
      }
    }
    fetchTimeout();
  }, []);

  const handleLogout = useCallback(async () => {
    toast({
      title: 'Sessão expirada',
      description: 'Você foi desconectado por inatividade.',
      variant: 'destructive',
    });
    await signOut();
  }, [signOut, toast]);

  const resetTimers = useCallback(() => {
    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);
    setShowWarning(false);

    if (!user || timeoutMinutes <= 0) return;

    const timeoutMs = timeoutMinutes * 60 * 1000;
    const warningMs = (timeoutMinutes - 1) * 60 * 1000; // 1 minute before

    // Show warning 1 minute before timeout
    if (timeoutMinutes > 1) {
      warningRef.current = setTimeout(() => {
        setShowWarning(true);
        toast({
          title: 'Sessão expirando',
          description: 'Sua sessão expirará em 1 minuto por inatividade.',
          duration: 60000,
        });
      }, warningMs);
    }

    // Logout after timeout
    timeoutRef.current = setTimeout(handleLogout, timeoutMs);
  }, [user, timeoutMinutes, handleLogout, toast]);

  const extendSession = useCallback(() => {
    setShowWarning(false);
    resetTimers();
    toast({
      title: 'Sessão estendida',
      description: 'Sua sessão foi renovada.',
    });
  }, [resetTimers, toast]);

  useEffect(() => {
    if (!user) return;

    // Events that reset the timer
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
    
    const handleActivity = () => {
      if (!showWarning) {
        resetTimers();
      }
    };

    events.forEach(event => {
      document.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial timer setup
    resetTimers();

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleActivity);
      });
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetTimers, showWarning]);

  return { showWarning, extendSession, timeoutMinutes };
}
