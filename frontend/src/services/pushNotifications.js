import { supabase } from '../api/supabase';

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const serviceWorkerTimeout = 12000;

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function deviceContext() {
  const userAgent = navigator.userAgent || '';
  const isIos = /iPad|iPhone|iPod/.test(userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.navigator.standalone === true;

  return { isIos, isAndroid, isStandalone };
}

function unsupportedState(reason, context = deviceContext()) {
  return {
    ...context,
    supported: false,
    permission: 'unsupported',
    subscribed: false,
    browserSubscribed: false,
    reason
  };
}

function supportState() {
  const context = deviceContext();
  if (!vapidPublicKey) return unsupportedState('configuration-missing', context);
  if (!window.isSecureContext) return unsupportedState('secure-context-required', context);
  if (context.isIos && !context.isStandalone) return unsupportedState('ios-install-required', context);
  if (!('serviceWorker' in navigator)) return unsupportedState('service-worker-unsupported', context);
  if (!('PushManager' in window) || !('Notification' in window)) return unsupportedState('browser-unsupported', context);

  return {
    ...context,
    supported: true,
    permission: Notification.permission,
    subscribed: false,
    browserSubscribed: false,
    reason: Notification.permission === 'denied' ? 'permission-denied' : 'ready'
  };
}

function timeoutError() {
  const error = new Error('Le service de notifications ne répond pas. Fermez puis rouvrez l’application et réessayez.');
  error.code = 'service-worker-timeout';
  return error;
}

async function serviceWorkerRegistration() {
  const registration = await Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => window.setTimeout(() => reject(timeoutError()), serviceWorkerTimeout))
  ]);
  registration.update().catch(() => undefined);
  return registration;
}

function activationError(error) {
  if (error?.code === 'service-worker-timeout') return error;
  if (error?.name === 'NotAllowedError') {
    return new Error('La permission est bloquée. Autorisez les notifications pour EHE dans les réglages du téléphone, puis revenez ici.');
  }
  if (error?.name === 'AbortError') {
    return new Error('Le service de notifications du téléphone est momentanément indisponible. Vérifiez Internet, puis réessayez.');
  }
  return error instanceof Error ? error : new Error('Impossible d’activer les notifications sur cet appareil.');
}

export function pushIsSupported() {
  return supportState().supported;
}

export async function getPushState() {
  const initialState = supportState();
  if (!initialState.supported) return initialState;

  try {
    const registration = await serviceWorkerRegistration();
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return initialState;

    const { data, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint')
      .eq('endpoint', subscription.endpoint)
      .maybeSingle();

    return {
      ...initialState,
      browserSubscribed: true,
      subscribed: !error && Boolean(data),
      reason: error || !data ? 'server-registration-missing' : 'subscribed'
    };
  } catch (error) {
    return {
      ...initialState,
      reason: error?.code || 'service-worker-unavailable',
      error: error?.message
    };
  }
}

export async function enablePushNotifications() {
  const state = supportState();
  if (!state.supported) {
    if (state.reason === 'ios-install-required') {
      throw new Error('Sur iPhone, ouvrez ce lien avec Safari, touchez Partager puis « Sur l’écran d’accueil ». Ouvrez ensuite EHE depuis son icône.');
    }
    throw new Error('Les notifications push ne sont pas disponibles dans ce navigateur. Utilisez l’application installée avec Safari sur iPhone ou Chrome sur Android.');
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      throw new DOMException('Permission refusée', 'NotAllowedError');
    }

    const registration = await serviceWorkerRegistration();
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey(vapidPublicKey)
    });
    const serialized = subscription.toJSON();
    if (!serialized.keys?.p256dh || !serialized.keys?.auth) {
      if (!existing) await subscription.unsubscribe().catch(() => undefined);
      throw new Error('Le téléphone a créé un abonnement incomplet. Redémarrez-le puis réessayez.');
    }

    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: subscription.endpoint,
      p_p256dh: serialized.keys.p256dh,
      p_auth: serialized.keys.auth,
      p_user_agent: navigator.userAgent
    });
    if (error) {
      if (!existing) await subscription.unsubscribe().catch(() => undefined);
      throw new Error(`L’autorisation est accordée, mais l’enregistrement a échoué : ${error.message}`);
    }

    return {
      ...state,
      permission: 'granted',
      browserSubscribed: true,
      subscribed: true,
      reason: 'subscribed'
    };
  } catch (error) {
    throw activationError(error);
  }
}

export async function testPushNotifications() {
  const state = await getPushState();
  if (!state.subscribed) throw new Error('Activez d’abord les notifications sur cet appareil.');

  const registration = await serviceWorkerRegistration();
  await registration.showNotification('Notifications EHE activées', {
    body: 'Ce téléphone peut maintenant recevoir les alertes EHE.',
    icon: `${import.meta.env.BASE_URL}pwa-192x192.png`,
    badge: `${import.meta.env.BASE_URL}pwa-192x192.png`,
    tag: 'ehe-notification-test',
    data: { url: import.meta.env.BASE_URL }
  });
}

export async function disablePushNotifications() {
  if (!pushIsSupported()) return getPushState();
  const registration = await serviceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    const { error } = await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
    if (error) throw error;
    await subscription.unsubscribe();
  }
  return getPushState();
}

export async function sendPushForOrder(commandeId, event) {
  try {
    const { error } = await supabase.functions.invoke('send-push', { body: { commandeId, event } });
    return !error;
  } catch {
    return false;
  }
}
