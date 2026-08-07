import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const statuses = ['en_attente', 'en_fabrication', 'prete', 'livree', 'annulee'];
const statusLabels = { en_attente: 'En attente', en_fabrication: 'En fabrication', prete: 'Prête', livree: 'Livrée', annulee: 'Annulée' };

export default function Orders({ user }) {
  const [commandes, setCommandes] = useState([]);
  const [filters, setFilters] = useState({ numero_commande: '', statut: '', date_debut: '', date_fin: '' });
  const [message, setMessage] = useState('');

  async function loadOrders(currentFilters = filters) {
    try {
      const params = Object.fromEntries(Object.entries(currentFilters).filter(([, value]) => value));
      const response = await api.get('/commandes', { params });
      setCommandes(response.data.commandes);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de charger les commandes.');
    }
  }

  useEffect(() => {
    loadOrders({ numero_commande: '', statut: '', date_debut: '', date_fin: '' });
  }, []);

  return (
    <div className="page-shell space-y-5">
      <div className="page-header"><div><h1>Commandes</h1><p>Recherchez une commande et suivez son état de fabrication.</p></div></div>
      <form className="grid gap-3 rounded-xl border bg-white p-4 shadow-sm md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); loadOrders(); }}>
        <input className="rounded border px-3 py-2" placeholder="N° de commande" value={filters.numero_commande} onChange={(event) => setFilters({ ...filters, numero_commande: event.target.value })} />
        <select className="rounded border px-3 py-2" value={filters.statut} onChange={(event) => setFilters({ ...filters, statut: event.target.value })}>
          <option value="">Tous les statuts</option>
          {statuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </select>
        <input className="rounded border px-3 py-2" type="date" value={filters.date_debut} onChange={(event) => setFilters({ ...filters, date_debut: event.target.value })} />
        <input className="rounded border px-3 py-2" type="date" value={filters.date_fin} onChange={(event) => setFilters({ ...filters, date_fin: event.target.value })} />
        <button className="rounded bg-blue-700 px-4 py-2 font-medium text-white md:col-span-4">Filtrer</button>
      </form>
      <div className="grid gap-3">
        {commandes.length === 0 && <p className="rounded border bg-white p-4 text-slate-600">Aucune commande trouvée.</p>}
        {commandes.map((commande) => (
          <Link key={commande.id} to={`/orders/${commande.id}`} className="rounded-xl border bg-white p-4 shadow-sm transition hover:border-blue-500">
            <div className="flex flex-wrap justify-between gap-2"><strong>{commande.numero_commande}</strong><span className={`status-badge status-${commande.statut}`}>{statusLabels[commande.statut]}</span></div>
            <p className="mt-2 text-sm">{commande.modele} — pointure {commande.pointure}</p>
            {user.role !== 'cordonnier' && commande.client_nom && <p className="mt-1 text-sm text-slate-600">Client : {commande.client_nom}</p>}
          </Link>
        ))}
      </div>
      {message && <p className="text-sm text-red-700">{message}</p>}
    </div>
  );
}
