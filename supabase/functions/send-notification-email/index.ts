import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Input validation regex patterns
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[\p{L}\p{M}\s'.-]{1,200}$/u;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_TEMPLATE_TYPES = [
  'enviado',
  'approved_by_manager',
  'approved_by_finance',
  'rejected_by_manager',
  'rejected_by_finance',
  'adjustment_requested',
  'marked_as_paid'
] as const;

interface EmailNotificationRequest {
  recipientEmail: string;
  recipientName: string;
  templateType: string;
  requestTitle: string;
  requestAmount: number;
  requestId: string;
  comment?: string;
  actionUserName?: string;
}

interface ValidationError {
  field: string;
  message: string;
}

function validateInput(data: unknown): { valid: true; data: EmailNotificationRequest } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: 'Invalid request body' }] };
  }
  
  const input = data as Record<string, unknown>;
  
  // recipientEmail - required, valid email format
  if (!input.recipientEmail || typeof input.recipientEmail !== 'string') {
    errors.push({ field: 'recipientEmail', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(input.recipientEmail)) {
    errors.push({ field: 'recipientEmail', message: 'Invalid email format' });
  } else if (input.recipientEmail.length > 255) {
    errors.push({ field: 'recipientEmail', message: 'Email too long (max 255 characters)' });
  }
  
  // recipientName - required, safe characters only
  if (!input.recipientName || typeof input.recipientName !== 'string') {
    errors.push({ field: 'recipientName', message: 'Recipient name is required' });
  } else if (!NAME_REGEX.test(input.recipientName)) {
    errors.push({ field: 'recipientName', message: 'Invalid name format' });
  }
  
  // templateType - required, must be one of valid types
  if (!input.templateType || typeof input.templateType !== 'string') {
    errors.push({ field: 'templateType', message: 'Template type is required' });
  } else if (!VALID_TEMPLATE_TYPES.includes(input.templateType as any)) {
    errors.push({ field: 'templateType', message: 'Invalid template type' });
  }
  
  // requestTitle - required, max 500 chars
  if (!input.requestTitle || typeof input.requestTitle !== 'string') {
    errors.push({ field: 'requestTitle', message: 'Request title is required' });
  } else if (input.requestTitle.length > 500) {
    errors.push({ field: 'requestTitle', message: 'Request title too long (max 500 characters)' });
  }
  
  // requestAmount - required, positive number
  if (input.requestAmount === undefined || input.requestAmount === null) {
    errors.push({ field: 'requestAmount', message: 'Request amount is required' });
  } else if (typeof input.requestAmount !== 'number' || isNaN(input.requestAmount)) {
    errors.push({ field: 'requestAmount', message: 'Request amount must be a number' });
  } else if (input.requestAmount <= 0) {
    errors.push({ field: 'requestAmount', message: 'Request amount must be positive' });
  } else if (input.requestAmount > 10000000) {
    errors.push({ field: 'requestAmount', message: 'Request amount exceeds maximum' });
  }
  
  // requestId - required, valid UUID
  if (!input.requestId || typeof input.requestId !== 'string') {
    errors.push({ field: 'requestId', message: 'Request ID is required' });
  } else if (!UUID_REGEX.test(input.requestId)) {
    errors.push({ field: 'requestId', message: 'Invalid request ID format' });
  }
  
  // comment - optional, max 2000 chars
  if (input.comment !== undefined && input.comment !== null) {
    if (typeof input.comment !== 'string') {
      errors.push({ field: 'comment', message: 'Comment must be a string' });
    } else if (input.comment.length > 2000) {
      errors.push({ field: 'comment', message: 'Comment too long (max 2000 characters)' });
    }
  }
  
  // actionUserName - optional, max 200 chars
  if (input.actionUserName !== undefined && input.actionUserName !== null) {
    if (typeof input.actionUserName !== 'string') {
      errors.push({ field: 'actionUserName', message: 'Action user name must be a string' });
    } else if (input.actionUserName.length > 200) {
      errors.push({ field: 'actionUserName', message: 'Action user name too long (max 200 characters)' });
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return {
    valid: true,
    data: {
      recipientEmail: input.recipientEmail as string,
      recipientName: input.recipientName as string,
      templateType: input.templateType as string,
      requestTitle: input.requestTitle as string,
      requestAmount: input.requestAmount as number,
      requestId: input.requestId as string,
      comment: input.comment as string | undefined,
      actionUserName: input.actionUserName as string | undefined,
    }
  };
}

// Sanitize HTML content to prevent XSS in emails
function sanitizeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const getEmailContent = (type: string, data: EmailNotificationRequest) => {
  const amountFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(data.requestAmount);

  // Sanitize user-provided content
  const safeName = sanitizeHtml(data.recipientName);
  const safeTitle = sanitizeHtml(data.requestTitle);
  const safeComment = data.comment ? sanitizeHtml(data.comment) : '';

  const templates: Record<string, { subject: string; html: string }> = {
    enviado: {
      subject: `Solicitação de Reembolso Enviada: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e40af;">Solicitação Enviada</h1>
          <p>Olá, ${safeName}!</p>
          <p>Sua solicitação de reembolso foi enviada com sucesso e está aguardando aprovação do seu gerente.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
          </div>
          <p>Você receberá uma notificação quando houver atualização sobre sua solicitação.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    approved_by_manager: {
      subject: `Solicitação Aprovada pelo Gerente: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">Aprovada pelo Gerente</h1>
          <p>Olá, ${safeName}!</p>
          <p>Sua solicitação de reembolso foi <strong>aprovada pelo gerente</strong> e agora está em análise pelo financeiro.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${safeComment ? `<p style="margin: 4px 0;"><strong>Comentário:</strong> ${safeComment}</p>` : ''}
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    approved_by_finance: {
      subject: `Solicitação Aprovada: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">✅ Solicitação Aprovada!</h1>
          <p>Olá, ${safeName}!</p>
          <p>Sua solicitação de reembolso foi <strong>aprovada pelo financeiro</strong>!</p>
          <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${safeComment ? `<p style="margin: 4px 0;"><strong>Comentário:</strong> ${safeComment}</p>` : ''}
          </div>
          <p>O pagamento será processado em breve.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    rejected_by_manager: {
      subject: `Solicitação Reprovada: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Solicitação Reprovada</h1>
          <p>Olá, ${safeName}!</p>
          <p>Infelizmente, sua solicitação de reembolso foi <strong>reprovada pelo gerente</strong>.</p>
          <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${safeComment ? `<p style="margin: 4px 0;"><strong>Motivo:</strong> ${safeComment}</p>` : ''}
          </div>
          <p>Se tiver dúvidas, entre em contato com seu gerente.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    rejected_by_finance: {
      subject: `Solicitação Reprovada pelo Financeiro: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Solicitação Reprovada</h1>
          <p>Olá, ${safeName}!</p>
          <p>Sua solicitação de reembolso foi <strong>reprovada pelo financeiro</strong>.</p>
          <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${safeComment ? `<p style="margin: 4px 0;"><strong>Motivo:</strong> ${safeComment}</p>` : ''}
          </div>
          <p>Se tiver dúvidas, entre em contato com o departamento financeiro.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    adjustment_requested: {
      subject: `Ajuste Solicitado: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Ajuste Solicitado</h1>
          <p>Olá, ${safeName}!</p>
          <p>Sua solicitação de reembolso precisa de <strong>ajustes</strong> antes de ser processada.</p>
          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${safeComment ? `<p style="margin: 4px 0;"><strong>Observação:</strong> ${safeComment}</p>` : ''}
          </div>
          <p>Por favor, acesse o sistema e faça os ajustes necessários.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    marked_as_paid: {
      subject: `Reembolso Pago: ${safeTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">💰 Reembolso Pago!</h1>
          <p>Olá, ${safeName}!</p>
          <p>Seu reembolso foi <strong>pago</strong>!</p>
          <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${safeTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
          </div>
          <p>Verifique sua conta bancária nos próximos dias úteis.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
  };

  return templates[type] || templates['enviado'];
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create Supabase client with the user's auth token
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    // Verify the user is authenticated
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error("Authentication error:", authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 2. Parse and validate input
    let rawData: unknown;
    try {
      rawData = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid JSON body' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const validation = validateInput(rawData);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ success: false, error: 'Validation failed', details: validation.errors }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const data = validation.data;

    // 3. Send email
    const emailContent = getEmailContent(data.templateType, data);

    const emailResponse = await resend.emails.send({
      from: "Sistema de Reembolso <onboarding@resend.dev>",
      to: [data.recipientEmail],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log("Email sent successfully by user:", user.id);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in send-notification-email function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
