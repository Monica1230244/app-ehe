const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { jwtSecret, useMemoryStore } = require('../config');

const router = express.Router();
const managerRoles = ['revendeur', 'admin'];
const creatableRoles = ['revendeur', 'cordonnier'];
const memoryUsers = [];
let memoryUserId = 1;

function isManager(user) {
  return managerRoles.includes(user.role);
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    nom: user.nom,
    email: user.email,
    role: user.role,
    created_at: user.created_at
  };
}

async function findUserByEmail(email) {
  if (useMemoryStore) {
    return memoryUsers.find((user) => user.email === email) || null;
  }

  const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] || null;
}

async function getUserById(id) {
  if (useMemoryStore) {
    return memoryUsers.find((user) => user.id === Number(id)) || null;
  }

  const result = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] || null;
}

async function createUser({ nom, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, 10);

  if (useMemoryStore) {
    const user = {
      id: memoryUserId++,
      nom,
      email,
      password_hash: passwordHash,
      role,
      is_active: true,
      created_at: new Date().toISOString()
    };
    memoryUsers.push(user);
    return publicUser(user);
  }

  const result = await pool.query(
    `INSERT INTO users (nom, email, password_hash, role, is_active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, nom, email, role, created_at`,
    [nom, email, passwordHash, role]
  );
  return result.rows[0];
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, jwtSecret, { expiresIn: '8h' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token manquant.' });
  }

  try {
    req.user = jwt.verify(token, jwtSecret);
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide ou expiré.' });
  }
}

function requireRoles(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès non autorisé pour ce rôle.' });
    }
    return next();
  };
}

async function registerUser(userData, role) {
  const { nom, email, password } = userData;

  if (!nom?.trim() || !email?.trim() || !password || password.length < 8) {
    const error = new Error('Nom, email et mot de passe de 8 caractères minimum requis.');
    error.statusCode = 400;
    throw error;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await findUserByEmail(normalizedEmail);
  if (existing) {
    const error = new Error('Cet email est déjà utilisé.');
    error.statusCode = 409;
    throw error;
  }

  const user = await createUser({ nom: nom.trim(), email: normalizedEmail, password, role });
  return user;
}

router.post('/register', async (req, res) => {
  try {
    const user = await registerUser(req.body, 'revendeur');
    return res.status(201).json({ user, token: signToken(user) });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Impossible de créer le compte.' });
  }
});

router.post('/users', authMiddleware, requireRoles('revendeur', 'admin'), async (req, res) => {
  try {
    const role = req.body.role || 'cordonnier';
    if (!creatableRoles.includes(role)) {
      return res.status(400).json({ error: 'Le rôle demandé est invalide.' });
    }

    const user = await registerUser(req.body, role);
    return res.status(201).json({ user });
  } catch (error) {
    console.error(error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Impossible de créer le compte.' });
  }
});

router.get('/users', authMiddleware, requireRoles('revendeur', 'admin'), async (req, res) => {
  try {
    if (useMemoryStore) {
      return res.json({ users: memoryUsers.map(publicUser) });
    }

    const result = await pool.query(
      'SELECT id, nom, email, role, created_at FROM users WHERE is_active = true ORDER BY nom ASC'
    );
    return res.json({ users: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les utilisateurs.' });
  }
});

router.get('/cordonniers', authMiddleware, requireRoles('revendeur', 'admin'), async (req, res) => {
  try {
    if (useMemoryStore) {
      return res.json({ cordonniers: memoryUsers.filter((user) => user.role === 'cordonnier').map(publicUser) });
    }

    const result = await pool.query(
      `SELECT id, nom, email, role, created_at
       FROM users
       WHERE is_active = true AND role = 'cordonnier'
       ORDER BY nom ASC`
    );
    return res.json({ cordonniers: result.rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les cordonniers.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const { password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis.' });
    }

    const user = await findUserByEmail(email);
    if (!user || user.is_active === false) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants invalides.' });
    }

    return res.json({ token: signToken(user), user: publicUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de vous connecter.' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await getUserById(req.user.id);
    if (!user || user.is_active === false) {
      return res.status(404).json({ error: 'Utilisateur introuvable.' });
    }
    return res.json({ user: publicUser(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer le profil.' });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
module.exports.getUserById = getUserById;
module.exports.isManager = isManager;
module.exports.requireRoles = requireRoles;
