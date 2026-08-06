const express = require('express');
const { authMiddleware } = require('./auth');
const pool = require('../db');
const router = express.Router();

let memoryPhotos = [];
let memoryPhotoId = 1;

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const { commande_id, type_photo, storage_path, file_name } = req.body;

  if (!commande_id || !type_photo || !storage_path || !file_name) {
    return res.status(400).json({ error: 'Champs requis manquants.' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO photos (commande_id, type_photo, storage_path, file_name)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [commande_id, type_photo, storage_path, file_name]
    );
    return res.status(201).json({ photo: result.rows[0] });
  } catch (error) {
    const photo = {
      id: memoryPhotoId++,
      commande_id,
      type_photo,
      storage_path,
      file_name,
      created_at: new Date().toISOString()
    };
    memoryPhotos.push(photo);
    return res.status(201).json({ photo });
  }
});

router.get('/', async (req, res) => {
  try {
    const commande_id = req.query.commande_id ? Number(req.query.commande_id) : null;
    if (!commande_id) {
      return res.status(400).json({ error: 'commande_id est requis.' });
    }
    const result = await pool.query('SELECT * FROM photos WHERE commande_id = $1 ORDER BY created_at DESC', [commande_id]);
    return res.json({ photos: result.rows });
  } catch (error) {
    const photos = memoryPhotos.filter((photo) => photo.commande_id === Number(req.query.commande_id));
    return res.json({ photos });
  }
});

module.exports = router;
