import { supabase } from '../api/supabase';

const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function applicationServerKey(value) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function pushIsSupported() {
  return Boolean(vapidPublicKey && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window);
}

export async function getPushState() {
  if (!pushIsSupported()) return { supported: false, permission: 'unsupported', subscribed: false };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return { supported: true, permission: Notification.permission, subscribed: Boolean(subscription) };
}

export async function enablePushNotifications() {
  if (!pushIsSupported()) throw new Error('Les notifications push ne sont pas disponibles sur cet appareil.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Autorisez les notifications dans les réglages du navigateur.');

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(vapidPublicKey)
  });
  const serialized = subscription.toJSON();
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: subscription.endpoint,
    p_p256dh: serialized.keys?.p256dh,
    p_auth: serialized.keys?.auth,
    p_user_agent: navigator.userAgent
  });
  if (error) throw error;
  return getPushState();
}

export async function disablePushNotifications() {
  if (!pushIsSupported()) return getPushState();
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await supabase.rpc('remove_push_subscription', { p_endpoint: subscription.endpoint });
    await subscription.unsubscribe();
  }
  return getPushState();
}

export async function sendPushForOrder(commandeId, event) {
  try {
    await supabase.functions.invoke('send-push', { body: { commandeId, event } });
  } catch {
    return false;
  }
  return true;
}
