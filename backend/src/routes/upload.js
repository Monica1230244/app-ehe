const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { authMiddleware, requireRoles } = require('./auth');
const { findCommandeById } = require('./commandes');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');
const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination(req, file, callback) {
    callback(null, uploadDir);
  },
  filename(req, file, callback) {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, callback) {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(new Error('Seules les images JPEG, PNG et WebP sont acceptées.'));
    }
    return callback(null, true);
  }
});

router.use(authMiddleware, requireRoles('revendeur', 'admin'));

router.post('/', upload.single('file'), async (req, res) => {
  const commandeId = Number(req.body.commande_id);
  if (!req.file || !Number.isInteger(commandeId)) {
    return res.status(400).json({ error: 'Une photo et son identifiant de commande sont requis.' });
  }

  try {
    const commande = await findCommandeById(commandeId, req.user);
    if (!commande) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Commande introuvable.' });
    }
    const url = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
    return res.status(201).json({ file: { url, filename: req.file.filename } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de téléverser la photo.' });
  }
});

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'La photo ne doit pas dépasser 5 Mo.' });
  }
  if (error) {
    return res.status(400).json({ error: error.message || 'Téléversement invalide.' });
  }
  return next();
});

module.exports = router;
