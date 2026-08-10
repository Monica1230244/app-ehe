import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import { disablePushNotifications, enablePushNotifications, getPushState } from '../services/pushNotifications';

export default function Notifications({ realtimeNotifications }) {
  const [notifications, setNotifications] = useState([]);
  const [pushState, setPushState] = useState(null);
  const [pushMessage, setPushMessage] = useState('');
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    api.get('/notifications').then((response) => setNotifications(response.data.notifications));
    getPushState().then(setPushState).catch(() => setPushState({ supported: false, permission: 'unsupported', subscribed: false }));
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
        ? 'Notifications activées sur cet appareil, même lorsque l’application est fermée.'
        : 'Notifications désactivées sur cet appareil.');
    } catch (error) {
      setPushMessage(error.message || 'Impossible de modifier les notifications push.');
    } finally {
      setPushBusy(false);
    }
  }

  return (
    <div className="page-shell max-w-2xl">
      <div className="page-header"><div><h1>Notifications</h1><p>Les dernières informations importantes de votre atelier.</p></div></div>
      <section className="push-settings-card">
        <div className="push-settings-icon" aria-hidden="true">●</div>
        <div>
          <h2>Notifications sur cet appareil</h2>
          <p>
            {pushState?.supported
              ? 'Recevez les nouvelles commandes, changements de statut et messages même lorsque l’application est fermée.'
              : 'Installez l’application sur l’écran d’accueil et utilisez un navigateur compatible pour recevoir les alertes.'}
          </p>
          {pushMessage && <small role="status">{pushMessage}</small>}
        </div>
        {pushState?.supported && (
          <button type="button" className={pushState.subscribed ? 'secondary-button' : 'primary-button compact'} onClick={togglePush} disabled={pushBusy || pushState.permission === 'denied'}>
            {pushBusy ? 'Veuillez patienter…' : pushState.subscribed ? 'Désactiver' : 'Activer les notifications'}
          </button>
        )}
      </section>
      <div className="space-y-2">
        {notifications.length === 0 && <div>Aucune notification.</div>}
        {notifications.map((notification) => (
          <div key={`${notification.id}-${notification.created_at}`} className={`notification-card${notification.lu ? '' : ' unread'}`}>
            <div className="text-sm">{notification.message}</div>
            <div className="text-xs text-gray-500">{notification.created_at}</div>
            {notification.commande_id && <Link className="mt-2 inline-block text-xs font-medium text-blue-700" to={`/orders/${notification.commande_id}`}>Ouvrir la commande →</Link>}
            {!notification.lu && <button type="button" onClick={() => markAsRead(notification.id)} className="mt-2 text-xs font-medium text-blue-700">Marquer comme lue</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
