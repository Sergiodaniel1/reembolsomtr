import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Input validation
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_REGEX = /^[\p{L}\p{M}\s'.-]{1,200}$/u;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VALID_ROLES = ['usuario', 'gerente', 'financeiro', 'admin', 'diretoria'] as const;

interface InviteUserRequest {
  email: string;
  full_name: string;
  department_id?: string;
  manager_id?: string;
  roles: string[];
}

interface ValidationError {
  field: string;
  message: string;
}

function validateInput(data: unknown): { valid: true; data: InviteUserRequest } | { valid: false; errors: ValidationError[] } {
  const errors: ValidationError[] = [];
  
  if (!data || typeof data !== 'object') {
    return { valid: false, errors: [{ field: 'body', message: 'Invalid request body' }] };
  }
  
  const input = data as Record<string, unknown>;
  
  // email - required, valid format
  if (!input.email || typeof input.email !== 'string') {
    errors.push({ field: 'email', message: 'Email is required' });
  } else if (!EMAIL_REGEX.test(input.email)) {
    errors.push({ field: 'email', message: 'Invalid email format' });
  } else if (input.email.length > 255) {
    errors.push({ field: 'email', message: 'Email too long (max 255 characters)' });
  }
  
  // full_name - required, valid characters
  if (!input.full_name || typeof input.full_name !== 'string') {
    errors.push({ field: 'full_name', message: 'Full name is required' });
  } else if (!NAME_REGEX.test(input.full_name)) {
    errors.push({ field: 'full_name', message: 'Invalid name format' });
  }
  
  // department_id - optional, valid UUID
  if (input.department_id !== undefined && input.department_id !== null && input.department_id !== '') {
    if (typeof input.department_id !== 'string' || !UUID_REGEX.test(input.department_id)) {
      errors.push({ field: 'department_id', message: 'Invalid department ID format' });
    }
  }
  
  // manager_id - optional, valid UUID
  if (input.manager_id !== undefined && input.manager_id !== null && input.manager_id !== '') {
    if (typeof input.manager_id !== 'string' || !UUID_REGEX.test(input.manager_id)) {
      errors.push({ field: 'manager_id', message: 'Invalid manager ID format' });
    }
  }
  
  // roles - required, non-empty array of valid roles
  if (!input.roles || !Array.isArray(input.roles)) {
    errors.push({ field: 'roles', message: 'Roles must be an array' });
  } else if (input.roles.length === 0) {
    errors.push({ field: 'roles', message: 'At least one role is required' });
  } else {
    for (const role of input.roles) {
      if (!VALID_ROLES.includes(role as any)) {
        errors.push({ field: 'roles', message: `Invalid role: ${role}` });
      }
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return {
    valid: true,
    data: {
      email: input.email as string,
      full_name: input.full_name as string,
      department_id: (input.department_id as string) || undefined,
      manager_id: (input.manager_id as string) || undefined,
      roles: input.roles as string[],
    }
  };
}

const handler = async (req: Request): Promise<Response> => {
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

    // 2. Check if user has admin role
    const { data: userRoles, error: rolesError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error("Error fetching user roles:", rolesError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error verifying permissions' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const isAdmin = userRoles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Insufficient permissions. Only admins can invite users.' }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 3. Parse and validate input
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

    // 4. Create user using Admin API (requires service role)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Create the user with email_confirm = false so they get the confirmation email
    const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      email_confirm: false, // User will need to confirm email
      user_metadata: {
        full_name: data.full_name,
      },
    });

    if (createError) {
      console.error("Error creating user:", createError);
      
      // Check for duplicate email error
      if (createError.message?.includes('already been registered') || createError.message?.includes('already exists')) {
        return new Response(
          JSON.stringify({ success: false, error: 'Este e-mail já está cadastrado no sistema.' }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      return new Response(
        JSON.stringify({ success: false, error: 'Error creating user: ' + createError.message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!newUser.user) {
      return new Response(
        JSON.stringify({ success: false, error: 'User creation failed' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // 5. Update profile with additional data
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        department_id: data.department_id || null,
        manager_id: data.manager_id || null,
      })
      .eq('user_id', newUser.user.id);

    if (profileError) {
      console.error("Error updating profile:", profileError);
      // Don't fail the entire operation for this
    }

    // 6. Set up roles (remove default 'usuario' role first if needed)
    await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', newUser.user.id);

    const { error: rolesInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert(data.roles.map(role => ({
        user_id: newUser.user!.id,
        role,
      })));

    if (rolesInsertError) {
      console.error("Error setting roles:", rolesInsertError);
      // Don't fail the entire operation for this
    }

    // 7. Generate password reset link so user can set their own password
    const siteUrl = Deno.env.get('SUPABASE_URL')?.replace('.supabase.co', '.supabase.co') || '';
    // Get the app URL from the request origin or fallback
    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/+$/, '') || '';
    const redirectTo = origin ? `${origin}/auth/redefinir-senha` : undefined;
    
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: data.email,
      options: {
        redirectTo,
      },
    });

    let activationLink = null;
    let emailSent = false;
    let emailError = null;

    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      // User was created but link generation failed - they can use forgot password flow
    } else if (linkData?.properties?.action_link) {
      activationLink = linkData.properties.action_link;

      // 8. Send activation email using Resend
      const resendApiKey = Deno.env.get('RESEND_API_KEY');
      if (resendApiKey) {
        try {
          const resend = new Resend(resendApiKey);
          
          const emailHtml = `
            <!DOCTYPE html>
            <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f5; margin: 0; padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                <div style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); padding: 32px; text-align: center;">
                  <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 600;">
                    🎉 Bem-vindo ao Sistema de Reembolso!
                  </h1>
                </div>
                
                <div style="padding: 32px;">
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 16px;">
                    Olá <strong>${data.full_name}</strong>,
                  </p>
                  
                  <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
                    Sua conta foi criada com sucesso! Para acessar o sistema, você precisa definir sua senha clicando no botão abaixo:
                  </p>
                  
                  <div style="text-align: center; margin: 32px 0;">
                    <a href="${activationLink}" 
                       style="display: inline-block; background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);">
                      Definir Minha Senha
                    </a>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 24px 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb;">
                    Se o botão não funcionar, copie e cole o link abaixo no seu navegador:
                  </p>
                  <p style="color: #3b82f6; font-size: 12px; word-break: break-all; margin: 8px 0 0;">
                    ${activationLink}
                  </p>
                  
                  <p style="color: #9ca3af; font-size: 12px; margin: 24px 0 0;">
                    Este link expira em 24 horas. Se você não solicitou esta conta, ignore este e-mail.
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

          const emailResponse = await resend.emails.send({
            from: 'Sistema de Reembolso <noreply@resend.dev>',
            to: [data.email],
            subject: '🔐 Ative sua conta - Sistema de Reembolso',
            html: emailHtml,
          });

          console.log("Email sent successfully:", emailResponse);
          emailSent = true;
        } catch (err) {
          console.error("Error sending email:", err);
          emailError = err instanceof Error ? err.message : 'Unknown error';
        }
      } else {
        console.warn("RESEND_API_KEY not configured - email not sent");
      }
    }

    console.log("User invited successfully:", newUser.user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: emailSent 
          ? 'Usuário criado e e-mail de ativação enviado com sucesso!' 
          : activationLink 
            ? 'Usuário criado. E-mail não pôde ser enviado - copie o link de ativação abaixo.' 
            : 'Usuário criado. O usuário deverá usar "Esqueci minha senha" para definir sua senha.',
        userId: newUser.user.id,
        activationLink,
        emailSent,
        emailError,
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("Error in invite-user function:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
