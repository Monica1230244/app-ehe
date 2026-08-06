const express = require('express');
const { authMiddleware, requireRoles } = require('./auth');
const { findCommandeById } = require('./commandes');
const pool = require('../db');
const { useMemoryStore } = require('../config');

const router = express.Router();
const photoTypes = ['modele', 'pied_gauche', 'pied_droit', 'autre'];
const memoryPhotos = [];
let memoryPhotoId = 1;

router.use(authMiddleware);

router.post('/', requireRoles('revendeur', 'admin'), async (req, res) => {
  const { commande_id: commandeId, type_photo: typePhoto, storage_path: storagePath, file_name: fileName } = req.body;
  if (!commandeId || !photoTypes.includes(typePhoto) || !storagePath || !fileName) {
    return res.status(400).json({ error: 'La commande, le type et le fichier sont requis.' });
  }

  try {
    const commande = await findCommandeById(commandeId, req.user);
    if (!commande) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }

    if (useMemoryStore) {
      const photo = {
        id: memoryPhotoId++,
        commande_id: Number(commandeId),
        type_photo: typePhoto,
        storage_path: storagePath,
        file_name: fileName,
        created_at: new Date().toISOString()
      };
      memoryPhotos.push(photo);
      return res.status(201).json({ photo });
    }

    const result = await pool.query(
      `INSERT INTO photos (commande_id, type_photo, storage_path, file_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [commande.id, typePhoto, storagePath, fileName]
    );
    return res.status(201).json({ photo: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible d’ajouter la photo.' });
  }
});

router.get('/', async (req, res) => {
  const commandeId = Number(req.query.commande_id);
  if (!Number.isInteger(commandeId)) {
    return res.status(400).json({ error: 'commande_id est requis.' });
  }

  try {
    const commande = await findCommandeById(commandeId, req.user);
    if (!commande) {
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    if (useMemoryStore) {
      return res.json({ photos: memoryPhotos.filter((photo) => photo.commande_id === commande.id) });
    }

    const result = await pool.query(
      'SELECT * FROM photos WHERE commande_id = $1 ORDER BY created_at ASC',
      [commande.id]
    );
    return res.json({ photos: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les photos.' });
  }
});

module.exports = router;
