import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api/client';
import OrderConversation from '../components/OrderConversation';

const statusLabels = { en_attente: 'En attente', en_fabrication: 'En fabrication', prete: 'Prête', livree: 'Livrée', annulee: 'Annulée' };

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';
}

export default function OrderDetails({ user }) {
  const { id } = useParams();
  const [commande, setCommande] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

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
      await loadOrder();
    } catch (error) {
      setMessage(error.response?.data?.error || 'Cette mise à jour est impossible.');
    }
  }

  if (loading) return <div className="p-4">Chargement…</div>;
  if (!commande) return <div className="p-4"><p>{message || 'Commande introuvable.'}</p><Link className="mt-3 inline-block text-blue-700" to="/orders">Retour aux commandes</Link></div>;

  const actions = [];
  if (user.role === 'cordonnier' && commande.statut === 'en_attente') actions.push(['en_fabrication', 'Commencer la fabrication', 'bg-blue-700']);
  if (user.role === 'cordonnier' && commande.statut === 'en_fabrication') actions.push(['prete', 'Marquer comme prête', 'bg-emerald-700']);
  if (['revendeur', 'admin'].includes(user.role) && commande.statut === 'prete') actions.push(['livree', 'Confirmer la livraison', 'bg-slate-900']);
  if (['revendeur', 'admin'].includes(user.role) && commande.statut === 'en_attente') actions.push(['annulee', 'Annuler la commande', 'bg-red-700']);

  return (
    <div className="page-shell max-w-4xl space-y-5">
      <Link to="/orders" className="text-sm font-medium text-blue-700">← Retour aux commandes</Link>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h1 className="text-2xl font-bold">{commande.numero_commande}</h1><p className="mt-2"><span className={`status-badge status-${commande.statut}`}>{statusLabels[commande.statut]}</span></p></div>
          <span className="rounded bg-slate-100 px-3 py-2 text-sm">Créée le {dateLabel(commande.date_creation)}</span>
        </div>
        {user.role !== 'cordonnier' && commande.client_nom && <div className="mt-4 rounded bg-slate-50 p-3 text-sm"><strong>Client :</strong> {commande.client_nom} — {commande.client_telephone}</div>}
        <dl className="mt-5 grid gap-4 sm:grid-cols-2">
          {[['Modèle', commande.modele], ['Pointure', commande.pointure], ['Couleur', commande.couleur], ['Matière', commande.matiere], ['Semelle', commande.semelle], ['Quantité', commande.quantite], ['Date souhaitée', commande.date_souhaitee || '—'], ['Observations', commande.observations || '—']].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="font-medium">{value}</dd></div>)}
        </dl>
        {actions.length > 0 && <div className="mt-5 flex flex-wrap gap-3">{actions.map(([status, label, className]) => <button key={status} type="button" onClick={() => changeStatus(status)} className={`rounded px-4 py-2 font-medium text-white ${className}`}>{label}</button>)}</div>}
      </section>
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Photos de fabrication</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {photos.length === 0 && <p className="text-sm text-slate-600">Aucune photo jointe.</p>}
          {photos.map((photo) => <figure key={photo.id} className="overflow-hidden rounded border"><img className="aspect-square w-full object-cover" src={photo.storage_path} alt={photo.type_photo.replace('_', ' ')} /><figcaption className="p-2 text-sm capitalize">{photo.type_photo.replace('_', ' ')}</figcaption></figure>)}
        </div>
      </section>
      <OrderConversation commandeId={commande.id} commandeStatut={commande.statut} user={user} />
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
