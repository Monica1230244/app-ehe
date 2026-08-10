import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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

    const { userId, nom, email, password, role, is_active: isActive } = await request.json();
    const normalizedName = String(nom || '').trim();
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!userId || !normalizedName || !normalizedEmail || !['revendeur', 'cordonnier'].includes(role)) {
      throw new Error('Nom, email et rôle valides sont requis.');
    }
    if (password && password.length < 8) {
      throw new Error('Le nouveau mot de passe doit contenir au moins 8 caractères.');
    }
    if (userId === authData.user.id && isActive === false) {
      throw new Error('Vous ne pouvez pas désactiver votre propre compte.');
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: targetProfile, error: targetError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    if (targetError || !targetProfile) throw new Error('Compte introuvable.');
    if (targetProfile.role === 'admin') throw new Error('Un compte administrateur ne peut pas être modifié ici.');
    if (userId === authData.user.id && role !== targetProfile.role) {
      throw new Error('Vous ne pouvez pas modifier votre propre rôle.');
    }

    const authChanges: Record<string, unknown> = {
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: { nom: normalizedName }
    };
    if (password) authChanges.password = password;

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(userId, authChanges);
    if (updateAuthError) throw updateAuthError;

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .update({
        nom: normalizedName,
        email: normalizedEmail,
        role,
        is_active: Boolean(isActive)
      })
      .eq('id', userId)
      .select('id, nom, email, role, is_active, created_at')
      .single();

    if (profileError) throw profileError;

    return new Response(JSON.stringify({ user: profile }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erreur interne.';
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
