const express = require('express');
const { authMiddleware } = require('./auth');
const { listNotifications, markAsRead, createNotification } = require('../services/notificationService');
const { getIo } = require('../socket');
const router = express.Router();

router.use(authMiddleware);

router.get('/', async (req, res) => {
  try {
    const notifications = await listNotifications(req.user.id);
    return res.json({ notifications });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les notifications.' });
  }
});

router.post('/', async (req, res) => {
  try {
    const { message, commande_id } = req.body;
    const notification = await createNotification(req.user.id, message, commande_id || null);
    const io = getIo();
    if (io) {
      io.emit('notification', { notification });
    }
    return res.status(201).json({ notification });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de créer la notification.' });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await markAsRead(req.user.id, req.params.id);
    if (!notification) {
      return res.status(404).json({ error: 'Notification non trouvée.' });
    }
    return res.json({ notification });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de mettre à jour la notification.' });
  }
});

module.exports = router;
