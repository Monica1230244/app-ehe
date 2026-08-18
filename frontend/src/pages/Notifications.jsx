import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushState,
  testPushNotifications
} from '../services/pushNotifications';

const notificationDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'medium',
  timeStyle: 'short'
});

function notificationDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : notificationDateFormatter.format(date);
}

function pushDescription(state) {
  if (!state) return 'Vérification de la compatibilité de cet appareil…';
  if (state.reason === 'ios-install-required') {
    return 'Sur iPhone : ouvrez ce lien dans Safari, touchez Partager, puis « Sur l’écran d’accueil ». Lancez ensuite EHE depuis son icône.';
  }
  if (state.reason === 'permission-denied') {
    return 'Android bloque les alertes. Touchez « Autorisations des notifications » dans les réglages EHE et activez la cloche.';
  }
  if (state.reason === 'server-registration-missing') {
    return 'Le téléphone avait une ancienne autorisation, mais elle n’était pas enregistrée par EHE. Touchez « Réparer l’activation ».';
  }
  if (state.reason === 'service-worker-timeout' || state.reason === 'service-worker-unavailable') {
    return 'Le service de notifications ne répond pas. Fermez complètement EHE, rouvrez l’application et relancez la vérification.';
  }
  if (!state.supported) {
    return 'Utilisez Safari sur iPhone ou Chrome sur Android, puis installez EHE sur l’écran d’accueil.';
  }
  if (state.subscribed) {
    return 'Ce téléphone est bien enregistré pour recevoir les nouvelles commandes, statuts et messages, même lorsque EHE est fermée.';
  }
  return 'Cet appareil est compatible. Activez les alertes puis acceptez la demande du téléphone.';
}

export default function Notifications({ realtimeNotifications }) {
  const [notifications, setNotifications] = useState([]);
  const [pushState, setPushState] = useState(null);
  const [pushMessage, setPushMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);

  async function refreshPushState() {
    setPushBusy(true);
    setPushMessage('');
    try {
      setPushState(await getPushState());
    } catch (error) {
      setPushMessage(error.message || 'Impossible de vérifier les notifications push.');
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    api.get('/notifications').then((response) => setNotifications(response.data.notifications));
    getPushState().then(setPushState).catch((error) => {
      setPushState({ supported: false, permission: 'unsupported', subscribed: false, reason: 'service-worker-unavailable' });
      setPushMessage(error.message || 'Impossible de vérifier les notifications push.');
    });
  }, []);

  useEffect(() => {
    function refreshAfterSettings() {
      if (document.visibilityState !== 'visible') return;
      getPushState().then(setPushState).catch(() => undefined);
    }

    window.addEventListener('focus', refreshAfterSettings);
    document.addEventListener('visibilitychange', refreshAfterSettings);
    return () => {
      window.removeEventListener('focus', refreshAfterSettings);
      document.removeEventListener('visibilitychange', refreshAfterSettings);
    };
  }, []);

  useEffect(() => {
    if (realtimeNotifications.length > 0) {
      setNotifications((current) => [...realtimeNotifications, ...current.filter((notification) => !realtimeNotifications.some((live) => live.id === notification.id))]);
    }
  }, [realtimeNotifications]);

  async function markAsRead(notificationId) {
    try {
      const response = await api.patch(`/notifications/${notificationId}/read`);
      setNotifications((current) => current.map((notification) => notification.id === notificationId ? response.data.notification : notification));
    } catch (error) {
      console.error(error);
    }
  }

  async function togglePush() {
    setPushBusy(true);
    setPushMessage('');
    try {
      const nextState = pushState?.subscribed
        ? await disablePushNotifications()
        : await enablePushNotifications();
      setPushState(nextState);
      setPushMessage(nextState.subscribed
        ? 'Activation réussie. Utilisez maintenant « Tester la notification ».'
        : 'Notifications désactivées sur cet appareil.');
    } catch (error) {
      setPushMessage(error.message || 'Impossible de modifier les notifications push.');
      setPushState(await getPushState().catch(() => pushState));
    } finally {
      setPushBusy(false);
    }
  }

  async function testPush() {
    setPushBusy(true);
    setPushMessage('');
    try {
      await testPushNotifications();
      setPushMessage('Test envoyé. Une notification EHE doit apparaître immédiatement sur ce téléphone.');
    } catch (error) {
      setPushMessage(error.message || 'Le test de notification a échoué.');
    } finally {
      setPushBusy(false);
    }
  }

  const permissionDenied = pushState?.permission === 'denied';

  return (
    <div className="page-shell max-w-2xl">
      <div className="page-header"><div><h1>Notifications</h1><p>Les dernières informations importantes de votre atelier.</p></div></div>
      <section className={`push-settings-card${pushState?.subscribed ? ' is-active' : ''}`}>
        <div className="push-settings-icon" aria-hidden="true">●</div>
        <div className="push-settings-copy">
          <div className="push-settings-title">
            <h2>Notifications sur cet appareil</h2>
            <span className={pushState?.subscribed ? 'push-status active' : 'push-status'}>
              {pushState?.subscribed ? 'Activées' : permissionDenied ? 'Bloquées' : 'Non activées'}
            </span>
          </div>
          <p>{pushDescription(pushState)}</p>
          {permissionDenied && (
            <ol className="push-help-steps">
              <li>Dans l’écran Android affiché sur votre capture, touchez la première ligne « Autorisations des notifications ».</li>
              <li>Activez la cloche : elle ne doit plus être barrée.</li>
              <li>Revenez dans EHE et touchez « Vérifier à nouveau ».</li>
            </ol>
          )}
          {pushMessage && <small className="push-feedback" role="status">{pushMessage}</small>}
        </div>
        <div className="push-settings-actions">
          {pushState?.supported && !permissionDenied && (
            <button type="button" className={pushState.subscribed ? 'secondary-button' : 'primary-button compact'} onClick={togglePush} disabled={pushBusy}>
              {pushBusy ? 'Veuillez patienter…' : pushState.subscribed ? 'Désactiver' : pushState.browserSubscribed ? 'Réparer l’activation' : 'Activer les notifications'}
            </button>
          )}
          {pushState?.subscribed && (
            <button type="button" className="primary-button compact" onClick={testPush} disabled={pushBusy}>Tester la notification</button>
          )}
          {(!pushState?.supported || permissionDenied) && (
            <button type="button" className="secondary-button" onClick={refreshPushState} disabled={pushBusy}>Vérifier à nouveau</button>
          )}
        </div>
      </section>
      <div className="space-y-2">
        {notifications.length === 0 && <div>Aucune notification.</div>}
        {notifications.map((notification) => (
          <div key={`${notification.id}-${notification.created_at}`} className={`notification-card${notification.lu ? '' : ' unread'}`}>
            <div className="text-sm">{notification.message}</div>
            <time className="text-xs text-gray-500" dateTime={notification.created_at}>{notificationDate(notification.created_at)}</time>
            {notification.commande_id && <Link className="mt-2 inline-block text-xs font-medium text-blue-700" to={`/orders/${notification.commande_id}`}>Ouvrir la commande →</Link>}
            {notification.demande_catalogue_id && <Link className="mt-2 inline-block text-xs font-medium text-blue-700" to="/catalog-requests">Voir la demande client →</Link>}
            {!notification.lu && <button type="button" onClick={() => markAsRead(notification.id)} className="mt-2 text-xs font-medium text-blue-700">Marquer comme lue</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
