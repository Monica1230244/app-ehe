import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const statusLabels = {
  en_attente: 'En attente',
  en_fabrication: 'En fabrication',
  prete: 'Prête',
  livree: 'Livrée',
  annulee: 'Annulée'
};

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0
});

function money(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function AccountingRow({ order, entry, onSaved }) {
  const [cost, setCost] = useState(entry?.prix_cordonnier ?? '');
  const [sale, setSale] = useState(entry?.prix_vente ?? '');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setCost(entry?.prix_cordonnier ?? '');
    setSale(entry?.prix_vente ?? '');
  }, [entry?.prix_cordonnier, entry?.prix_vente]);

  const estimatedProfit = (Number(sale) || 0) - (Number(cost) || 0);

  async function save(event) {
    event.preventDefault();
    if (cost === '' || sale === '') {
      setFeedback('Renseignez les deux montants.');
      return;
    }

    setSaving(true);
    setFeedback('');
    try {
      const response = await api.post(`/commandes/${order.id}/comptabilite`, {
        prix_cordonnier: cost,
        prix_vente: sale
      });
      onSaved(response.data.comptabilite);
      setFeedback('Enregistré');
    } catch (requestError) {
      setFeedback(requestError.response?.data?.error || 'Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="accounting-order-card">
      <div className="accounting-order-info">
        <div>
          <strong>{order.numero_commande}</strong>
          <span className={`status-badge status-${order.statut}`}>{statusLabels[order.statut]}</span>
        </div>
        <p>{order.client_nom || 'Client'} · {order.modele}</p>
        <small>Cordonnier : {order.cordonnier_nom || 'Non renseigné'}</small>
      </div>

      <form className="accounting-order-form" onSubmit={save}>
        <label>
          <span>Prix du cordonnier</span>
          <span className="money-input"><input type="number" min="0" step="1" inputMode="numeric" value={cost} onChange={(event) => setCost(event.target.value)} placeholder="0" required /><i>FCFA</i></span>
        </label>
        <label>
          <span>Prix de vente</span>
          <span className="money-input"><input type="number" min="0" step="1" inputMode="numeric" value={sale} onChange={(event) => setSale(event.target.value)} placeholder="0" required /><i>FCFA</i></span>
        </label>
        <div className={`accounting-profit${estimatedProfit < 0 ? ' negative' : ''}`}>
          <span>Bénéfice</span>
          <strong>{money(estimatedProfit)}</strong>
        </div>
        <div className="accounting-save">
          <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : entry ? 'Mettre à jour' : 'Enregistrer'}</button>
          {feedback && <small>{feedback}</small>}
        </div>
      </form>
    </article>
  );
}

export default function Accounting() {
  const [orders, setOrders] = useState([]);
  const [entries, setEntries] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/commandes'), api.get('/comptabilite')])
      .then(([ordersResponse, accountingResponse]) => {
        setOrders(ordersResponse.data.commandes.filter((order) => order.statut !== 'annulee'));
        setEntries(accountingResponse.data.comptabilite);
      })
      .catch((requestError) => setError(requestError.response?.data?.error || 'Impossible de charger la comptabilité.'))
      .finally(() => setLoading(false));
  }, []);

  const entriesByOrder = useMemo(() => new Map(entries.map((entry) => [entry.commande_id, entry])), [entries]);
  const totals = useMemo(() => entries.reduce((summary, entry) => ({
    cost: summary.cost + Number(entry.prix_cordonnier),
    sales: summary.sales + Number(entry.prix_vente),
    profit: summary.profit + Number(entry.benefice)
  }), { cost: 0, sales: 0, profit: 0 }), [entries]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    if (!normalizedSearch) return orders;
    return orders.filter((order) => [order.numero_commande, order.client_nom, order.modele, order.cordonnier_nom]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('fr')
      .includes(normalizedSearch));
  }, [orders, search]);

  function updateEntry(savedEntry) {
    setEntries((current) => [savedEntry, ...current.filter((entry) => entry.commande_id !== savedEntry.commande_id)]);
  }

  if (loading) {
    return <div className="page-loader"><span className="loader-ring" /><p>Calcul de votre activité…</p></div>;
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header">
        <div>
          <h1>Comptabilité</h1>
          <p>Suivez le coût, le prix de vente et le bénéfice de chaque commande.</p>
        </div>
        <span className="accounting-private"><i /> Visible uniquement par le revendeur</span>
      </div>

      <section className="accounting-summary">
        <article className="accounting-metric cost"><span>Coût total cordonniers</span><strong>{money(totals.cost)}</strong></article>
        <article className="accounting-metric sales"><span>Total des ventes</span><strong>{money(totals.sales)}</strong></article>
        <article className="accounting-metric profit"><span>Bénéfice total</span><strong>{money(totals.profit)}</strong></article>
        <article className="accounting-metric recorded"><span>Commandes renseignées</span><strong>{entries.length}</strong></article>
      </section>

      <section className="accounting-ledger">
        <div className="accounting-ledger-header">
          <div><h2>Détail par commande</h2><p>Le bénéfice est calculé automatiquement : vente moins coût du cordonnier.</p></div>
          <input type="search" aria-label="Rechercher une commande" placeholder="Rechercher une commande…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        {error && <p className="conversation-error">{error}</p>}
        <div className="accounting-orders">
          {filteredOrders.length === 0 && <div className="messaging-empty compact"><p>Aucune commande à afficher.</p></div>}
          {filteredOrders.map((order) => (
            <AccountingRow key={order.id} order={order} entry={entriesByOrder.get(order.id)} onSaved={updateEntry} />
          ))}
        </div>
      </section>
    </div>
  );
}
