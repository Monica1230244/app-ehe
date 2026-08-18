import { useEffect, useState } from 'react';
import api from '../api/client';

const emptyForm = { civilite: '', nom: '', telephone: '' };

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState({ clientId: null, commandes: [] });
  const [editingClientId, setEditingClientId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);

  async function loadClients(query = search) {
    try {
      const response = await api.get('/clients', { params: query ? { q: query } : {} });
      setClients(response.data.clients);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de charger les clients.');
    }
  }

  useEffect(() => {
    loadClients('');
  }, []);

  async function copyClientCatalogLink(client) {
    try {
      const response = await api.post(`/clients/${client.id}/catalogue-link`, {});
      const { catalogue_token: catalogueToken, token: clientToken, expires_at: expiresAt } = response.data;
      const link = `${window.location.origin}${window.location.pathname}#/catalogue/${catalogueToken}?client=${clientToken}`;
      setClients((current) => current.map((item) => item.id === client.id
        ? { ...item, catalogue_token: clientToken, catalogue_token_expires_at: expiresAt }
        : item));
      const expiryLabel = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(expiresAt));
      try {
        await navigator.clipboard.writeText(link);
        setMessage(`Nouveau lien personnel de ${client.nom} copié. Il est valable jusqu’au ${expiryLabel}.`);
      } catch {
        setMessage(`Lien personnel valable jusqu’au ${expiryLabel} : ${link}`);
      }
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de copier le lien personnel.');
    }
  }

  async function submitClient(event) {
    event.preventDefault();
    try {
      const response = await api.post('/clients', form);
      setClients((current) => [response.data.client, ...current]);
      setForm(emptyForm);
      setMessage('Client enregistré.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible d’enregistrer le client.');
    }
  }

  async function showHistory(clientId) {
    try {
      const response = await api.get(`/clients/${clientId}/commandes`);
      setHistory({ clientId, commandes: response.data.commandes });
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de récupérer l’historique.');
    }
  }

  function startEditing(client) {
    setEditingClientId(client.id);
    setEditForm({ civilite: client.civilite || '', nom: client.nom, telephone: client.telephone });
    setMessage('');
  }

  async function saveClient(event) {
    event.preventDefault();
    try {
      const response = await api.patch(`/clients/${editingClientId}`, editForm);
      setClients((current) => current.map((client) => client.id === editingClientId ? response.data.client : client));
      setEditingClientId(null);
      setMessage('Informations du client corrigées.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de modifier ce client.');
    }
  }

  return (
    <div className="page-shell space-y-6">
      <div className="page-header"><div><h1>Clients</h1><p>Centralisez les coordonnées et l’historique de chaque client.</p></div></div>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Ajouter un client</h2>
        <form className="mt-4 grid gap-3 md:grid-cols-3" onSubmit={submitClient}>
          <select className="rounded border px-3 py-2" aria-label="Civilité" value={form.civilite} onChange={(event) => setForm({ ...form, civilite: event.target.value })} required>
            <option value="">Civilité</option>
            <option value="Mr">Mr</option>
            <option value="Mme">Mme</option>
          </select>
          <input className="rounded border px-3 py-2" placeholder="Nom complet" value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} required />
          <input className="rounded border px-3 py-2" placeholder="Téléphone" value={form.telephone} onChange={(event) => setForm({ ...form, telephone: event.target.value })} required />
          <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white md:col-span-3">Enregistrer le client</button>
        </form>
      </section>

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); loadClients(); }}>
          <input className="w-full rounded border px-3 py-2" placeholder="Rechercher par nom ou téléphone" value={search} onChange={(event) => setSearch(event.target.value)} />
          <button className="rounded border px-4 py-2 font-medium">Rechercher</button>
        </form>
        <div className="mt-4 divide-y">
          {clients.length === 0 && <p className="py-3 text-slate-600">Aucun client trouvé.</p>}
          {clients.map((client) => (
            <article key={client.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              {editingClientId === client.id ? (
                <form className="inline-edit-form" onSubmit={saveClient}>
                  <select aria-label="Civilité du client" value={editForm.civilite} onChange={(event) => setEditForm({ ...editForm, civilite: event.target.value })} required>
                    <option value="">Civilité</option>
                    <option value="Mr">Mr</option>
                    <option value="Mme">Mme</option>
                  </select>
                  <input aria-label="Nom du client" value={editForm.nom} onChange={(event) => setEditForm({ ...editForm, nom: event.target.value })} required />
                  <input aria-label="Téléphone du client" value={editForm.telephone} onChange={(event) => setEditForm({ ...editForm, telephone: event.target.value })} required />
                  <div className="record-actions">
                    <button type="submit" className="primary-button compact">Enregistrer</button>
                    <button type="button" className="secondary-button" onClick={() => setEditingClientId(null)}>Annuler</button>
                  </div>
                </form>
              ) : (
                <>
                  <div>
                    <h2 className="font-semibold">{client.civilite ? `${client.civilite} ` : ''}{client.nom}</h2>
                    <p className="text-sm text-slate-600">{client.telephone}</p>
                  </div>
                  <div className="record-actions">
                    <button type="button" onClick={() => copyClientCatalogLink(client)} className="secondary-button accent">Lien catalogue</button>
                    <button type="button" onClick={() => startEditing(client)} className="secondary-button">Corriger</button>
                    <button type="button" onClick={() => showHistory(client.id)} className="secondary-button accent">Historique</button>
                  </div>
                </>
              )}
              {history.clientId === client.id && (
                <div className="w-full rounded bg-slate-50 p-3 text-sm">
                  {history.commandes.length === 0 ? 'Aucune commande pour ce client.' : history.commandes.map((commande) => <p key={commande.id}>{commande.numero_commande} — {commande.statut}</p>)}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
