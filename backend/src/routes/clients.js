const express = require('express');
const { authMiddleware } = require('./auth');
const pool = require('../db');
const router = express.Router();

let memoryClients = [];
let memoryClientId = 1;

async function findClientById(id) {
  try {
    const result = await pool.query('SELECT * FROM clients WHERE id = $1', [id]);
    return result.rows[0] || null;
  } catch (error) {
    return memoryClients.find((client) => client.id === Number(id)) || null;
  }
}

async function searchClients(query) {
  try {
    const text = `SELECT * FROM clients WHERE LOWER(nom) LIKE LOWER($1) ORDER BY created_at DESC LIMIT 200`;
    const values = [`%${query}%`];
    const result = await pool.query(text, values);
    return result.rows;
  } catch (error) {
    return memoryClients.filter((client) => client.nom.toLowerCase().includes(query.toLowerCase()));
  }
}

async function listClients() {
  try {
    const result = await pool.query('SELECT * FROM clients ORDER BY created_at DESC LIMIT 200');
    return result.rows;
  } catch (error) {
    return memoryClients.slice().sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

router.use(authMiddleware);

router.post('/', async (req, res) => {
  const { nom, telephone, email, notes } = req.body;
  if (!nom) {
    return res.status(400).json({ error: 'Le nom du client est requis.' });
  }

  try {
    const clientData = { nom, telephone: telephone || null, email: email || null, notes: notes || null };

    try {
      const result = await pool.query(
        `INSERT INTO clients (nom, telephone, email, notes)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [clientData.nom, clientData.telephone, clientData.email, clientData.notes]
      );
      return res.status(201).json({ client: result.rows[0] });
    } catch (error) {
      const client = {
        id: memoryClientId++,
        nom: clientData.nom,
        telephone: clientData.telephone,
        email: clientData.email,
        notes: clientData.notes,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      memoryClients.push(client);
      return res.status(201).json({ client });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de créer le client.' });
  }
});

router.get('/', async (req, res) => {
  try {
    const search = req.query.q?.toString() || '';
    const clients = search ? await searchClients(search) : await listClients();
    return res.json({ clients });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer les clients.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await findClientById(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé.' });
    }
    return res.json({ client });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de récupérer le client.' });
  }
});

router.put('/:id', async (req, res) => {
  const { nom, telephone, email, notes } = req.body;
  try {
    const client = await findClientById(req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client non trouvé.' });
    }

    try {
      const result = await pool.query(
        `UPDATE clients SET nom = $1, telephone = $2, email = $3, notes = $4, updated_at = NOW() WHERE id = $5 RETURNING *`,
        [nom || client.nom, telephone || client.telephone, email || client.email, notes || client.notes, req.params.id]
      );
      return res.json({ client: result.rows[0] });
    } catch (error) {
      const index = memoryClients.findIndex((item) => item.id === client.id);
      if (index !== -1) {
        memoryClients[index] = {
          ...client,
          nom: nom || client.nom,
          telephone: telephone || client.telephone,
          email: email || client.email,
          notes: notes || client.notes,
          updated_at: new Date().toISOString()
        };
        return res.json({ client: memoryClients[index] });
      }
      throw error;
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Impossible de mettre à jour le client.' });
  }
});

module.exports = router;
