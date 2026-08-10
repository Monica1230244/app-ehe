import { useEffect, useState } from 'react';
import api from '../api/client';

const emptyForm = { nom: '', email: '', password: '', role: 'cordonnier' };
const emptyEditForm = { nom: '', email: '', password: '', role: 'cordonnier', is_active: true };

export default function Users({ currentUser }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [saving, setSaving] = useState(false);

  async function loadUsers() {
    try {
      const response = await api.get('/auth/users');
      setUsers(response.data.users);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de charger les utilisateurs.');
    }
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function submitUser(event) {
    event.preventDefault();
    try {
      const response = await api.post('/auth/users', form);
      setUsers((current) => [...current, response.data.user].sort((first, second) => first.nom.localeCompare(second.nom)));
      setForm(emptyForm);
      setMessage('Compte créé.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de créer le compte.');
    }
  }

  function startEditing(user) {
    setEditingUserId(user.id);
    setEditForm({
      nom: user.nom,
      email: user.email,
      password: '',
      role: user.role,
      is_active: user.is_active
    });
    setMessage('');
  }

  async function saveUser(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await api.patch(`/auth/users/${editingUserId}`, editForm);
      setUsers((current) => current
        .map((user) => user.id === editingUserId ? response.data.user : user)
        .sort((first, second) => first.nom.localeCompare(second.nom)));
      setEditingUserId(null);
      setMessage('Compte de l’équipe mis à jour.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de modifier ce compte.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell max-w-4xl space-y-6">
      <div className="page-header"><div><h1>Équipe</h1><p>Créez les accès des cordonniers et des revendeurs autorisés.</p></div></div>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Ajouter un utilisateur</h2>
        <p className="mt-1 text-sm text-slate-600">Créez ici les comptes cordonnier ou revendeur autorisés.</p>
        <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={submitUser}>
          <input className="rounded border px-3 py-2" placeholder="Nom" value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} required />
          <input className="rounded border px-3 py-2" type="email" placeholder="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          <input className="rounded border px-3 py-2" type="password" minLength="8" placeholder="Mot de passe (8 caractères min.)" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <select className="rounded border px-3 py-2" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
            <option value="cordonnier">Cordonnier</option>
            <option value="revendeur">Revendeur</option>
          </select>
          <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white md:col-span-2">Créer le compte</button>
        </form>
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="team-list">
          {users.map((user) => (
            <article key={user.id} className={`team-member${user.is_active ? '' : ' inactive'}`}>
              {editingUserId === user.id ? (
                <form className="team-edit-form" onSubmit={saveUser}>
                  <input aria-label="Nom du membre" value={editForm.nom} onChange={(event) => setEditForm({ ...editForm, nom: event.target.value })} required />
                  <input aria-label="Email du membre" type="email" value={editForm.email} onChange={(event) => setEditForm({ ...editForm, email: event.target.value })} required />
                  <input aria-label="Nouveau mot de passe" type="password" minLength="8" value={editForm.password} onChange={(event) => setEditForm({ ...editForm, password: event.target.value })} placeholder="Nouveau mot de passe (facultatif)" />
                  <select aria-label="Rôle du membre" value={editForm.role} onChange={(event) => setEditForm({ ...editForm, role: event.target.value })} disabled={editingUserId === currentUser.id}>
                    <option value="cordonnier">Cordonnier</option>
                    <option value="revendeur">Revendeur</option>
                  </select>
                  <label className="toggle-field">
                    <input type="checkbox" checked={editForm.is_active} onChange={(event) => setEditForm({ ...editForm, is_active: event.target.checked })} disabled={editingUserId === currentUser.id} />
                    <span>Compte actif</span>
                  </label>
                  <div className="record-actions">
                    <button type="submit" className="primary-button compact" disabled={saving}>Enregistrer</button>
                    <button type="button" className="secondary-button" onClick={() => setEditingUserId(null)}>Annuler</button>
                  </div>
                </form>
              ) : (
                <>
                  <span className="team-avatar">{user.nom.slice(0, 1).toUpperCase()}</span>
                  <span className="team-identity"><strong>{user.nom}</strong><small>{user.email}</small></span>
                  <span className={`team-status${user.is_active ? '' : ' inactive'}`}>{user.is_active ? 'Actif' : 'Désactivé'}</span>
                  <strong className="capitalize text-slate-700">{user.role}</strong>
                  {user.role !== 'admin' && <button type="button" className="secondary-button" onClick={() => startEditing(user)}>Corriger</button>}
                </>
              )}
            </article>
          ))}
        </div>
      </section>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
