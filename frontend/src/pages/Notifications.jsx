import { useEffect, useState } from 'react';
import api from '../api/client';
import useNotifications from '../hooks/useNotifications';

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const realtimeNotifications = useNotifications();

  useEffect(() => {
    api.get('/notifications').then((response) => setNotifications(response.data.notifications));
  }, []);

  useEffect(() => {
    if (realtimeNotifications.length > 0) {
      setNotifications((current) => [...realtimeNotifications, ...current]);
    }
  }, [realtimeNotifications]);

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Notifications</h1>
      <div className="space-y-2">
        {notifications.length === 0 && <div>Aucune notification.</div>}
        {notifications.map((notification) => (
          <div key={`${notification.id}-${notification.created_at}`} className="rounded border p-3 bg-white shadow-sm">
            <div className="text-sm">{notification.message}</div>
            <div className="text-xs text-gray-500">{notification.created_at}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
