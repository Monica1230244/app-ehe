import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import { sendPushForOrder } from '../services/pushNotifications';

const statusLabels = { en_attente: 'En attente', en_fabrication: 'En fabrication', prete: 'Prête', livree: 'Livrée', annulee: 'Annulée' };

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

function whatsappNumber(value) {
  const rawValue = String(value || '').trim();
  let digits = rawValue.replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (!digits || rawValue.startsWith('+') || digits.startsWith('229')) return digits;
  return `229${digits}`;
}

function whatsappLink(commande) {
  const number = whatsappNumber(commande.client_telephone);
  const message = `Bonjour ${commande.client_nom}, votre commande est prête. Pour organiser la livraison, merci de nous envoyer vos informations de livraison ici, en message privé sur WhatsApp. — EHE`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function editableOrder(commande) {
  return {
    client_id: String(commande.client_id),
    cordonnier_id: commande.cordonnier_id || '',
    modele_stock_id: commande.modele_stock_id ? String(commande.modele_stock_id) : '',
    modele: commande.modele,
    pointure: commande.pointure,
    couleur: commande.couleur,
    matiere: commande.matiere,
    semelle: commande.semelle,
    quantite: String(commande.quantite),
    date_souhaitee: commande.date_souhaitee || '',
    observations: commande.observations || ''
  };
}

export default function OrderDetails({ user }) {
  const { id } = useParams();
  const [commande, setCommande] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [clients, setClients] = useState([]);
  const [cordonniers, setCordonniers] = useState([]);
  const [saving, setSaving] = useState(false);

  async function loadOrder() {
    setLoading(true);
    try {
      const [commandeResponse, photosResponse, historyResponse] = await Promise.all([
        api.get(`/commandes/${id}`),
        api.get('/photos', { params: { commande_id: id } }),
        api.get(`/commandes/${id}/history`)
      ]);
      setCommande(commandeResponse.data.commande);
      setPhotos(photosResponse.data.photos);
      setHistory(historyResponse.data.history);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de charger la commande.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrder();
  }, [id]);

  async function changeStatus(statut) {
    try {
      const response = await api.patch(`/commandes/${id}/status`, { statut });
      setCommande(response.data.commande);
      setMessage('Statut mis à jour.');
      await sendPushForOrder(id, 'status_changed');
      await loadOrder();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Cette mise à jour est impossible.');
    }
  }

  async function startEditing() {
    setMessage('');
    try {
      const [clientsResponse, cordonniersResponse] = await Promise.all([
        api.get('/clients'),
        api.get('/auth/cordonniers')
      ]);
      setClients(clientsResponse.data.clients);
      setCordonniers(cordonniersResponse.data.cordonniers);
      setEditForm(editableOrder(commande));
      setEditing(true);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible d’ouvrir la correction de la commande.');
    }
  }

  async function saveOrder(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const response = await api.patch(`/commandes/${id}`, editForm);
      setCommande(response.data.commande);
      setEditing(false);
      setMessage('Commande corrigée.');
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de corriger cette commande.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="p-4">Chargement…</div>;
  if (!commande) return <div className="p-4"><p>{message || 'Commande introuvable.'}</p><Link className="mt-3 inline-block text-blue-700" to="/orders">Retour aux commandes</Link></div>;

  const actions = [];
  if (user.role === 'cordonnier' && commande.statut === 'en_attente') actions.push(['en_fabrication', 'Commencer la fabrication', 'bg-blue-700']);
  if (user.role === 'cordonnier' && commande.statut === 'en_fabrication') actions.push(['prete', 'Marquer comme prête', 'bg-emerald-700']);
  if (['revendeur', 'admin'].includes(user.role) && commande.statut === 'prete') actions.push(['livree', 'Confirmer la livraison', 'bg-slate-900']);
  if (['revendeur', 'admin'].includes(user.role) && commande.statut === 'en_attente') actions.push(['annulee', 'Annuler la commande', 'bg-red-700']);
  const canNotifyClient = ['revendeur', 'admin'].includes(user.role) && commande.statut === 'prete' && whatsappNumber(commande.client_telephone);
  const canEdit = ['revendeur', 'admin'].includes(user.role) && commande.statut === 'en_attente';

  return (
    <div className="page-shell max-w-4xl space-y-5">
      <Link to="/orders" className="text-sm font-medium text-blue-700">← Retour aux commandes</Link>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-bold">{commande.numero_commande}</h1><p className="mt-2"><span className={`status-badge status-${commande.statut}`}>{statusLabels[commande.statut]}</span></p></div>
          <span className="rounded bg-slate-100 px-3 py-2 text-sm">Créée le {dateLabel(commande.date_creation)}</span>
        </div>
        {user.role !== 'cordonnier' && commande.client_nom && <div className="mt-4 rounded bg-slate-50 p-3 text-sm"><strong>Client :</strong> {commande.client_nom} — {commande.client_telephone}</div>}
        {editing ? (
          <form className="order-edit-form" onSubmit={saveOrder}>
            <label>Client<select value={editForm.client_id} onChange={(event) => setEditForm({ ...editForm, client_id: event.target.value })} required>{clients.map((client) => <option key={client.id} value={client.id}>{client.nom} — {client.telephone}</option>)}</select></label>
            <label>Cordonnier<select value={editForm.cordonnier_id} onChange={(event) => setEditForm({ ...editForm, cordonnier_id: event.target.value })} required>{cordonniers.map((cordonnier) => <option key={cordonnier.id} value={cordonnier.id}>{cordonnier.nom}</option>)}</select></label>
            <label>Modèle<input value={editForm.modele} onChange={(event) => setEditForm({ ...editForm, modele: event.target.value })} required /></label>
            <label>Pointure<input value={editForm.pointure} onChange={(event) => setEditForm({ ...editForm, pointure: event.target.value })} required /></label>
            <label>Couleur<input value={editForm.couleur} onChange={(event) => setEditForm({ ...editForm, couleur: event.target.value })} required /></label>
            <label>Matière<input value={editForm.matiere} onChange={(event) => setEditForm({ ...editForm, matiere: event.target.value })} required /></label>
            <label>Semelle<input value={editForm.semelle} onChange={(event) => setEditForm({ ...editForm, semelle: event.target.value })} required /></label>
            <label>Quantité<input type="number" min="1" value={editForm.quantite} onChange={(event) => setEditForm({ ...editForm, quantite: event.target.value })} required /></label>
            <label>Date souhaitée<input type="date" value={editForm.date_souhaitee} onChange={(event) => setEditForm({ ...editForm, date_souhaitee: event.target.value })} /></label>
            <label className="order-edit-notes">Observations<textarea value={editForm.observations} onChange={(event) => setEditForm({ ...editForm, observations: event.target.value })} /></label>
            <div className="record-actions order-edit-actions">
              <button type="submit" className="primary-button compact" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
              <button type="button" className="secondary-button" onClick={() => setEditing(false)}>Annuler</button>
            </div>
          </form>
        ) : (
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            {[['Modèle', commande.modele], ['Pointure', commande.pointure], ['Couleur', commande.couleur], ['Matière', commande.matiere], ['Semelle', commande.semelle], ['Quantité', commande.quantite], ['Date souhaitée', commande.date_souhaitee || '—'], ['Observations', commande.observations || '—']].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}
          </dl>
        )}
        {(actions.length > 0 || canNotifyClient || canEdit) && !editing && (
          <div className="mt-5 flex flex-wrap gap-3">
            {canEdit && <button type="button" onClick={startEditing} className="secondary-button accent">Corriger la commande</button>}
            {actions.map(([status, label, className]) => <button key={status} type="button" onClick={() => changeStatus(status)} className={`rounded px-4 py-2 font-medium text-white ${className}`}>{label}</button>)}
            {canNotifyClient && <a className="whatsapp-button" href={whatsappLink(commande)} target="_blank" rel="noreferrer">Informer le client sur WhatsApp</a>}
          </div>
        )}
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Photos de fabrication</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {photos.length === 0 && <p className="text-sm text-slate-600">Aucune photo jointe.</p>}
          {photos.map((photo) => <figure key={photo.id} className="overflow-hidden rounded border"><img className="aspect-square w-full object-cover" src={photo.storage_path} alt={photo.type_photo.replace('_', ' ')} /><figcaption className="p-2 text-sm capitalize">{photo.type_photo.replace('_', ' ')}</figcaption></figure>)}
        </div>
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Historique</h2>
        <ol className="mt-3 space-y-3 border-l pl-4">
          {history.map((entry) => <li key={`${entry.statut}-${entry.created_at}`}><strong>{statusLabels[entry.statut]}</strong><p className="text-sm text-slate-600">{dateLabel(entry.created_at)}{entry.commentaire ? ` — ${entry.commentaire}` : ''}</p></li>)}
        </ol>
      </section>
      {message && <p className="text-sm text-slate-700">{message}</p>}
    </div>
  );
}
