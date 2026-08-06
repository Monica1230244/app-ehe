const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const memoryUsers = [];
let memoryUserId = 1;

async function findUserByEmail(email) {
  try {
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    return { source: 'db', user: result.rows[0] };
  } catch (error) {
    const fallbackUser = memoryUsers.find((user) => user.email === email);
    return { source: 'memory', user: fallbackUser || null };
  }
}

async function createUserInStore(userData) {
  try {
    const result = await pool.query(
      `INSERT INTO users (nom, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, true)
       RETURNING id, nom, email, role, created_at`,
      [userData.nom, userData.email, userData.passwordHash, userData.role]
    );
    return { source: 'db', user: result.rows[0] };
  } catch (error) {
    const user = {
      id: memoryUserId++,
      nom: userData.nom,
      email: userData.email,
      password_hash: userData.passwordHash,
      role: userData.role,
      created_at: new Date().toISOString()
    };
    memoryUsers.push(user);
    return { source: 'memory', user: { id: user.id, nom: user.nom, email: user.email, role: user.role, created_at: user.created_at } };
  }
}

async function getUserById(id) {
  try {
    const result = await pool.query('SELECT id, nom, email, role, created_at FROM users WHERE id = $1', [id]);
    return { source: 'db', user: result.rows[0] };
  } catch (error) {
    const fallbackUser = memoryUsers.find((user) => user.id === id);
    return { source: 'memory', user: fallbackUser ? { id: fallbackUser.id, nom: fallbackUser.nom, email: fallbackUser.email, role: fallbackUser.role, created_at: fallbackUser.created_at } : null };
  }
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '8h' });
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Token manquant' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide' });
  }
}

router.post('/register', async (req, res) => {
  try {
    const { nom, email, password, role = 'revendeur' } = req.body;

    if (!nom || !email || !password) {
      return res.status(400).json({ error: 'Nom, email et mot de passe requis' });
    }

    const existing = await findUserByEmail(email);
    if (existing.user) {
      return res.status(409).json({ error: 'Email déjà utilisé' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const created = await createUserInStore({ nom, email, passwordHash, role });
    const user = created.user;
    return res.status(201).json({ user, token: signToken(user) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de l’enregistrement' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const existing = await findUserByEmail(email);
    const user = existing.user;
    if (!user) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const valid = await bcrypt.compare(password, user.password_hash || user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    return res.json({ token: signToken(user), user: { id: user.id, nom: user.nom, email: user.email, role: user.role } });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const fetched = await getUserById(req.user.id);
    if (!fetched.user) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    return res.json({ user: fetched.user });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Erreur lors de la récupération du profil' });
  }
});

module.exports = router;
module.exports.authMiddleware = authMiddleware;
