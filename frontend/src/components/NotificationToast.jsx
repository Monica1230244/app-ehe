import { useEffect, useState } from 'react';

const displayDuration = 5000;

export default function NotificationToast({ notification }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notification) {
      setVisible(false);
      return undefined;
    }

    setVisible(true);
    const timeoutId = window.setTimeout(() => setVisible(false), displayDuration);
    return () => window.clearTimeout(timeoutId);
  }, [notification?.id]);

  if (!notification || !visible) return null;

  return (
    <div className="notification-toast fixed bottom-4 right-4 max-w-xs rounded border bg-white p-3 shadow-lg" role="status">
      <button type="button" onClick={() => setVisible(false)} aria-label="Fermer la notification">×</button>
      <div className="text-sm font-semibold">Nouvelle notification</div>
      <div className="text-sm mt-1">{notification.message}</div>
    </div>
  );
}
