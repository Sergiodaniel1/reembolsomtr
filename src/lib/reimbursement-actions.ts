import { supabase } from '@/integrations/supabase/client';
import { sendEmailNotification } from '@/lib/email-notifications';

interface TransitionResult {
  success: boolean;
  old_status: string;
  new_status: string;
  request_id: string;
}

interface TransitionParams {
  requestId: string;
  action: 'submit' | 'manager_approve' | 'manager_reject' | 'manager_adjust' | 'finance_approve' | 'finance_reject' | 'mark_paid';
  comment?: string;
  paymentMethod?: string;
  paymentDate?: string;
}

export async function transitionRequestStatus(params: TransitionParams): Promise<TransitionResult> {
  const { data, error } = await supabase.rpc('transition_request_status', {
    _request_id: params.requestId,
    _action: params.action,
    _comment: params.comment || null,
    _payment_method: params.paymentMethod || null,
    _payment_date: params.paymentDate || null,
  });

  if (error) {
    // Extract human-readable message from Postgres error
    const message = error.message?.replace(/^.*?:\s*/, '') || 'Erro ao processar ação';
    throw new Error(message);
  }

  return data as unknown as TransitionResult;
}

// Convenience: send email notification after a transition
export async function transitionWithNotification(
  params: TransitionParams & {
    recipientEmail?: string;
    recipientName?: string;
    requestTitle?: string;
    requestAmount?: number;
  }
): Promise<TransitionResult> {
  const result = await transitionRequestStatus(params);

  // Best-effort email notification
  if (params.recipientEmail && params.requestTitle) {
    const emailActionMap: Record<string, string> = {
      manager_approve: 'approved_by_manager',
      manager_reject: 'rejected_by_manager',
      manager_adjust: 'adjustment_requested',
      finance_approve: 'approved_by_finance',
      finance_reject: 'rejected_by_finance',
      mark_paid: 'marked_as_paid',
    };

    const templateType = emailActionMap[params.action];
    if (templateType) {
      try {
        await sendEmailNotification({
          recipientEmail: params.recipientEmail,
          recipientName: params.recipientName || '',
          templateType,
          requestTitle: params.requestTitle,
          requestAmount: params.requestAmount || 0,
          requestId: params.requestId,
          comment: params.comment,
        });
      } catch (e) {
        console.warn('Email notification failed (non-blocking):', e);
      }
    }
  }

  return result;
}

export async function checkSetupCompleted(): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_setup_completed');
  if (error) {
    console.error('Error checking setup:', error);
    return true; // fail-safe: block setup
  }
  return data as boolean;
}
