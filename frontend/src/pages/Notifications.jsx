import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Notifications({ realtimeNotifications }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    api.get('/notifications').then((response) => setNotifications(response.data.notifications));
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

  return (
    <div className="page-shell max-w-2xl">
      <div className="page-header"><div><h1>Notifications</h1><p>Les dernières informations importantes de votre atelier.</p></div></div>
      <div className="space-y-2">
        {notifications.length === 0 && <div>Aucune notification.</div>}
        {notifications.map((notification) => (
          <div key={`${notification.id}-${notification.created_at}`} className={`notification-card${notification.lu ? '' : ' unread'}`}>
            <div className="text-sm">{notification.message}</div>
            <div className="text-xs text-gray-500">{notification.created_at}</div>
            {!notification.lu && <button type="button" onClick={() => markAsRead(notification.id)} className="mt-2 text-xs font-medium text-blue-700">Marquer comme lue</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
