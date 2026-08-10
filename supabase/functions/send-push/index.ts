import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

const statusLabels: Record<string, string> = {
  en_attente: 'en attente',
  en_fabrication: 'en fabrication',
  prete: 'prête',
  livree: 'livrée',
  annulee: 'annulée'
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) throw new Error('Authentification requise.');

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const publishableKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY');
    if (!vapidPublicKey || !vapidPrivateKey) throw new Error('Les clés de notification ne sont pas configurées.');

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
    if (callerError || !caller?.is_active) throw new Error('Compte inactif.');

    const { commandeId, event } = await request.json();
    if (!commandeId || !['order_created', 'status_changed', 'message'].includes(event)) {
      throw new Error('Notification invalide.');
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: order, error: orderError } = await adminClient
      .from('commandes')
      .select('id, numero_commande, statut, revendeur_id, cordonnier_id')
      .eq('id', Number(commandeId))
      .single();
    if (orderError || !order) throw new Error('Commande introuvable.');

    const isAdmin = caller.role === 'admin';
    const isReseller = order.revendeur_id === authData.user.id;
    const isShoemaker = order.cordonnier_id === authData.user.id;
    if (!isAdmin && !isReseller && !isShoemaker) throw new Error('Accès refusé.');

    let targetUserId: string;
    let title: string;
    let body: string;

    if (event === 'order_created') {
      if (!isAdmin && !isReseller) throw new Error('Accès refusé.');
      targetUserId = order.cordonnier_id;
      title = 'Nouvelle commande';
      body = `La commande ${order.numero_commande} vous a été attribuée.`;
    } else if (event === 'message') {
      targetUserId = isShoemaker ? order.revendeur_id : order.cordonnier_id;
      title = 'Nouveau message';
      body = `Un nouveau message concerne la commande ${order.numero_commande}.`;
    } else {
      targetUserId = isShoemaker ? order.revendeur_id : order.cordonnier_id;
      title = 'Commande mise à jour';
      body = `La commande ${order.numero_commande} est maintenant ${statusLabels[order.statut] || order.statut}.`;
    }

    const { data: subscriptions, error: subscriptionError } = await adminClient
      .from('push_subscriptions')
      .select('id, endpoint, p256dh, auth_key')
      .eq('user_id', targetUserId);
    if (subscriptionError) throw subscriptionError;

    webpush.setVapidDetails(
      'https://monica1230244.github.io/app-ehe/',
      vapidPublicKey,
      vapidPrivateKey
    );

    const appUrl = Deno.env.get('APP_URL') || 'https://monica1230244.github.io/app-ehe/';
    const payload = JSON.stringify({
      title,
      body,
      url: `${appUrl.replace(/\/$/, '')}/#/orders/${order.id}`,
      tag: `ehe-order-${order.id}`
    });

    const results = await Promise.allSettled((subscriptions || []).map(async (subscription) => {
      try {
        await webpush.sendNotification({
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth_key }
        }, payload);
      } catch (error) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await adminClient.from('push_subscriptions').delete().eq('id', subscription.id);
          return;
        }
        throw error;
      }
    }));

    const sent = results.filter((result) => result.status === 'fulfilled').length;
    return new Response(JSON.stringify({ sent }), {
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
