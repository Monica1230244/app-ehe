const pool = require('../db');
const { useMemoryStore } = require('../config');

let memoryNotifications = [];
let memoryNotificationId = 1;

async function createNotification(userId, message, commandeId = null) {
  if (!useMemoryStore) {
    const result = await pool.query(
      `INSERT INTO notifications (user_id, message, commande_id)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, message, commandeId]
    );
    return result.rows[0];
  }

  const notification = {
    id: memoryNotificationId++,
    user_id: userId,
    message,
    commande_id: commandeId,
    lu: false,
    created_at: new Date().toISOString()
  };
  memoryNotifications.push(notification);
  return notification;
}

async function listNotifications(userId) {
  if (!useMemoryStore) {
    const result = await pool.query('SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 200', [userId]);
    return result.rows;
  }

  return memoryNotifications.filter((item) => item.user_id === userId).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

async function markAsRead(userId, notificationId) {
  if (!useMemoryStore) {
    const result = await pool.query(
      'UPDATE notifications SET lu = TRUE WHERE id = $1 AND user_id = $2 RETURNING *',
      [notificationId, userId]
    );
    return result.rows[0] || null;
  }

  const notification = memoryNotifications.find((item) => item.id === Number(notificationId) && item.user_id === userId);
  if (notification) {
    notification.lu = true;
  }
  return notification || null;
}

module.exports = { createNotification, listNotifications, markAsRead };
