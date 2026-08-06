import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentification requise.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const callerClient = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });

    const { data: authData, error: authError } = await callerClient.auth.getUser();
    if (authError || !authData.user) throw new Error('Session invalide.');

    const { data: caller, error: callerError } = await callerClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', authData.user.id)
      .single();

    if (callerError || !caller?.is_active || !['revendeur', 'admin'].includes(caller.role)) {
      throw new Error('Accès réservé au revendeur.');
    }

    const { nom, email, password, role } = await request.json();
    if (!nom || !email || !password || !['revendeur', 'cordonnier'].includes(role)) {
      throw new Error('Nom, email, mot de passe et rôle valides sont requis.');
    }
    if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nom }
    });
    if (createError) throw createError;

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({ nom, role, is_active: true })
      .eq('id', created.user.id)
      .select('id, nom, email, role, is_active, created_at')
      .single();

    if (profileError) {
      await adminClient.auth.admin.deleteUser(created.user.id);
      throw profileError;
    }

    return new Response(JSON.stringify({ user: profile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || 'Erreur interne.' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
