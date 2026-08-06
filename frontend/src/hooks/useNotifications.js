import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_API_BASE ? import.meta.env.VITE_API_BASE.replace('/api', '') : 'http://localhost:4000';

export default function useNotifications() {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    const token = localStorage.getItem('ehe_token');
    if (!token) {
      return;
    }

    const socket = io(SOCKET_URL, {
      auth: { token }
    });

    socket.on('connect', () => {
      console.log('Socket connected', socket.id);
    });

    socket.on('notification', (payload) => {
      setNotifications((current) => [payload.notification, ...current]);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  return notifications;
}
