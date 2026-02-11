import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authenticate
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 2. Check admin role
    const { data: userRoles } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    const isAdmin = userRoles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 3. Parse input
    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== 'string' || !UUID_REGEX.test(user_id)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid user_id' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 4. Get user info
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('email, full_name')
      .eq('user_id', user_id)
      .single();

    if (!profile) {
      return new Response(
        JSON.stringify({ success: false, error: 'User not found' }),
        { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 5. Generate recovery link
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/+$/, '') || '';
    const redirectTo = origin ? `${origin}/auth/redefinir-senha` : undefined;

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo },
    });

    if (linkError || !linkData?.properties?.action_link) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to generate activation link' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const activationLink = linkData.properties.action_link;
    let emailSent = false;

    // 6. Send email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      try {
        const resend = new Resend(resendApiKey);

        const emailHtml = `
          <!DOCTYPE html>
          <html>
          <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
          <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
            <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
              <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
                <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
                  🔐 Ativação de Conta
                </h1>
              </div>
              <div style="padding: 32px;">
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  Olá <strong>${profile.full_name}</strong>,
                </p>
                <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                  O administrador reenviou o link de ativação da sua conta. Clique no botão abaixo para definir sua senha:
                </p>
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${activationLink}" 
                     style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
                    Definir Minha Senha
                  </a>
                </div>
                <p style="color: #6b7280; font-size: 14px; line-height: 1.6; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                  Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
                </p>
                <p style="color: #3b82f6; font-size: 12px; word-break: break-all;">${activationLink}</p>
                <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">
                  Este link expira em 24 horas.
                </p>
              </div>
              <div style="background-color: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                <p style="color: #9ca3af; font-size: 12px; margin: 0;">
                  Sistema de Reembolso Corporativo © ${new Date().getFullYear()}
                </p>
              </div>
            </div>
          </body>
          </html>
        `;

        await resend.emails.send({
          from: 'Sistema de Reembolso <noreply@resend.dev>',
          to: [profile.email],
          subject: '🔐 Ative sua conta - Sistema de Reembolso',
          html: emailHtml,
        });

        emailSent = true;
      } catch (err) {
        console.error("Error sending email:", err);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        activationLink,
        emailSent,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in resend-activation:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
