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
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Notifications</h1>
      <div className="space-y-2">
        {notifications.length === 0 && <div>Aucune notification.</div>}
        {notifications.map((notification) => (
          <div key={`${notification.id}-${notification.created_at}`} className="rounded border p-3 bg-white shadow-sm">
            <div className="text-sm">{notification.message}</div>
            <div className="text-xs text-gray-500">{notification.created_at}</div>
            {!notification.lu && <button type="button" onClick={() => markAsRead(notification.id)} className="mt-2 text-xs font-medium text-blue-700">Marquer comme lue</button>}
          </div>
        ))}
      </div>
    </div>
  );
}
