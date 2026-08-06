-- Schema PostgreSQL pour EHE ERP
-- Version 1.0 : MVP gestion commandes, photos, notifications et suivi fabrication

CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('revendeur', 'cordonnier', 'admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE clients (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(255) NOT NULL,
  telephone VARCHAR(50),
  email VARCHAR(255),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE commandes (
  id SERIAL PRIMARY KEY,
  numero_commande VARCHAR(50) UNIQUE NOT NULL,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  revendeur_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  cordonnier_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  modele VARCHAR(255) NOT NULL,
  pointure VARCHAR(20) NOT NULL,
  couleur VARCHAR(100) NOT NULL,
  matiere VARCHAR(100) NOT NULL,
  semelle VARCHAR(100) NOT NULL,
  quantite INTEGER NOT NULL DEFAULT 1 CHECK (quantite > 0),
  statut VARCHAR(20) NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_fabrication', 'prete', 'livree', 'annulee')),
  date_souhaitee DATE,
  date_creation TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  date_debut_fabrication TIMESTAMPTZ,
  date_fin TIMESTAMPTZ,
  observations TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE photos (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  type_photo VARCHAR(30) NOT NULL CHECK (type_photo IN ('modele', 'pied_gauche', 'pied_droit', 'autre')),
  storage_path TEXT NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  commande_id INTEGER REFERENCES commandes(id) ON DELETE CASCADE,
  message TEXT NOT NULL,
  lu BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE commande_statuts (
  id SERIAL PRIMARY KEY,
  commande_id INTEGER NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  statut VARCHAR(20) NOT NULL CHECK (statut IN ('en_attente', 'en_fabrication', 'prete', 'livree', 'annulee')),
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_clients_updated_at
BEFORE UPDATE ON clients
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_commandes_updated_at
BEFORE UPDATE ON commandes
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE INDEX idx_commandes_client_id ON commandes(client_id);
CREATE INDEX idx_commandes_revendeur_id ON commandes(revendeur_id);
CREATE INDEX idx_commandes_cordonnier_id ON commandes(cordonnier_id);
CREATE INDEX idx_commandes_statut ON commandes(statut);
CREATE INDEX idx_photos_commande_id ON photos(commande_id);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_lu ON notifications(lu);
CREATE INDEX idx_commande_statuts_commande_id ON commande_statuts(commande_id);
