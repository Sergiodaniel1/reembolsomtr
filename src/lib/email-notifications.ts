import { supabase } from '@/integrations/supabase/client';

interface SendNotificationParams {
  recipientEmail: string;
  recipientName: string;
  templateType: string;
  requestTitle: string;
  requestAmount: number;
  requestId: string;
  comment?: string;
}

export async function sendEmailNotification(params: SendNotificationParams) {
  try {
    const { data, error } = await supabase.functions.invoke('send-notification-email', {
      body: params,
    });

    if (error) {
      console.error('Erro ao enviar email:', error);
      return { success: false, error };
    }

    console.log('Email enviado com sucesso:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Erro ao enviar email:', error);
    return { success: false, error };
  }
}
