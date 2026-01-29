import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

const getEmailContent = (type: string, data: EmailNotificationRequest) => {
  const amountFormatted = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(data.requestAmount);

  const templates: Record<string, { subject: string; html: string }> = {
    enviado: {
      subject: `Solicitação de Reembolso Enviada: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #1e40af;">Solicitação Enviada</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Sua solicitação de reembolso foi enviada com sucesso e está aguardando aprovação do seu gerente.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
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
      subject: `Solicitação Aprovada pelo Gerente: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">Aprovada pelo Gerente</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Sua solicitação de reembolso foi <strong>aprovada pelo gerente</strong> e agora está em análise pelo financeiro.</p>
          <div style="background: #f3f4f6; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${data.comment ? `<p style="margin: 4px 0;"><strong>Comentário:</strong> ${data.comment}</p>` : ''}
          </div>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    approved_by_finance: {
      subject: `Solicitação Aprovada: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">✅ Solicitação Aprovada!</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Sua solicitação de reembolso foi <strong>aprovada pelo financeiro</strong>!</p>
          <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${data.comment ? `<p style="margin: 4px 0;"><strong>Comentário:</strong> ${data.comment}</p>` : ''}
          </div>
          <p>O pagamento será processado em breve.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    rejected_by_manager: {
      subject: `Solicitação Reprovada: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Solicitação Reprovada</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Infelizmente, sua solicitação de reembolso foi <strong>reprovada pelo gerente</strong>.</p>
          <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${data.comment ? `<p style="margin: 4px 0;"><strong>Motivo:</strong> ${data.comment}</p>` : ''}
          </div>
          <p>Se tiver dúvidas, entre em contato com seu gerente.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    rejected_by_finance: {
      subject: `Solicitação Reprovada pelo Financeiro: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #dc2626;">Solicitação Reprovada</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Sua solicitação de reembolso foi <strong>reprovada pelo financeiro</strong>.</p>
          <div style="background: #fee2e2; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${data.comment ? `<p style="margin: 4px 0;"><strong>Motivo:</strong> ${data.comment}</p>` : ''}
          </div>
          <p>Se tiver dúvidas, entre em contato com o departamento financeiro.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    adjustment_requested: {
      subject: `Ajuste Solicitado: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #f59e0b;">Ajuste Solicitado</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Sua solicitação de reembolso precisa de <strong>ajustes</strong> antes de ser processada.</p>
          <div style="background: #fef3c7; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
            <p style="margin: 4px 0;"><strong>Valor:</strong> ${amountFormatted}</p>
            ${data.comment ? `<p style="margin: 4px 0;"><strong>Observação:</strong> ${data.comment}</p>` : ''}
          </div>
          <p>Por favor, acesse o sistema e faça os ajustes necessários.</p>
          <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
            Sistema de Reembolso Corporativo
          </p>
        </div>
      `,
    },
    marked_as_paid: {
      subject: `Reembolso Pago: ${data.requestTitle}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #059669;">💰 Reembolso Pago!</h1>
          <p>Olá, ${data.recipientName}!</p>
          <p>Seu reembolso foi <strong>pago</strong>!</p>
          <div style="background: #d1fae5; padding: 16px; border-radius: 8px; margin: 16px 0;">
            <p style="margin: 4px 0;"><strong>Título:</strong> ${data.requestTitle}</p>
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
    const data: EmailNotificationRequest = await req.json();

    // Validate required fields
    if (!data.recipientEmail || !data.templateType) {
      throw new Error("Missing required fields: recipientEmail and templateType");
    }

    const emailContent = getEmailContent(data.templateType, data);

    const emailResponse = await resend.emails.send({
      from: "Sistema de Reembolso <onboarding@resend.dev>",
      to: [data.recipientEmail],
      subject: emailContent.subject,
      html: emailContent.html,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
