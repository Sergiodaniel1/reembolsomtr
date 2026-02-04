import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: data.email,
    });

    let activationLink = null;
    if (linkError) {
      console.error("Error generating recovery link:", linkError);
      // User was created but link generation failed - they can use forgot password flow
    } else if (linkData?.properties?.action_link) {
      activationLink = linkData.properties.action_link;
    }

    console.log("User invited successfully:", newUser.user.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: activationLink 
          ? 'Usuário criado com sucesso. Copie o link de ativação e envie ao usuário.' 
          : 'Usuário criado. O usuário deverá usar "Esqueci minha senha" para definir sua senha.',
        userId: newUser.user.id,
        activationLink,
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
