import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0
});

function money(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function monthKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function currentMonth() {
  return monthKey(new Date());
}

function monthLabel(value, format = 'long') {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('fr-FR', { month: format, year: format === 'long' ? 'numeric' : undefined })
    .format(new Date(year, month - 1, 1));
}

function recentMonths(count = 12) {
  const months = [];
  const date = new Date();
  date.setDate(1);
  for (let index = count - 1; index >= 0; index -= 1) {
    months.push(monthKey(new Date(date.getFullYear(), date.getMonth() - index, 1)));
  }
  return months;
}

function monthStatistics(orders, accountingByOrder, selectedMonth) {
  const deliveredOrders = orders.filter((order) => order.statut === 'livree' && order.date_fin && monthKey(order.date_fin) === selectedMonth);
  return deliveredOrders.reduce((summary, order) => {
    const accounting = accountingByOrder.get(order.id);
    return {
      orders: [...summary.orders, order],
      salesCount: summary.salesCount + 1,
      quantity: summary.quantity + Number(order.quantite || 0),
      revenue: summary.revenue + Number(accounting?.prix_vente || 0),
      profit: summary.profit + Number(accounting?.benefice || 0),
      missingAccounting: summary.missingAccounting + (accounting ? 0 : 1)
    };
  }, { orders: [], salesCount: 0, quantity: 0, revenue: 0, profit: 0, missingAccounting: 0 });
}

function saleDate(value) {
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

export default function Statistics() {
  const [orders, setOrders] = useState([]);
  const [accounting, setAccounting] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/commandes'), api.get('/comptabilite')])
      .then(([ordersResponse, accountingResponse]) => {
        setOrders(ordersResponse.data.commandes);
        setAccounting(accountingResponse.data.comptabilite);
      })
      .catch((requestError) => setError(requestError.response?.data?.error || 'Impossible de charger les statistiques.'))
      .finally(() => setLoading(false));
  }, []);

  const accountingByOrder = useMemo(() => new Map(accounting.map((entry) => [entry.commande_id, entry])), [accounting]);
  const selectedStatistics = useMemo(
    () => monthStatistics(orders, accountingByOrder, selectedMonth),
    [accountingByOrder, orders, selectedMonth]
  );
  const evolution = useMemo(
    () => recentMonths().map((month) => ({ month, ...monthStatistics(orders, accountingByOrder, month) })),
    [accountingByOrder, orders]
  );
  const maximumProfit = Math.max(...evolution.map((item) => Math.abs(item.profit)), 1);

  if (loading) {
    return <div className="page-loader"><span className="loader-ring" /><p>Préparation de vos statistiques…</p></div>;
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header statistics-header">
        <div>
          <h1>Statistiques</h1>
          <p>Analysez vos ventes livrées et vos bénéfices mois par mois.</p>
        </div>
        <label className="statistics-month-picker">
          <span>Mois analysé</span>
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} />
        </label>
      </div>

      {error && <p className="conversation-error">{error}</p>}

      <section className="statistics-summary">
        <article className="statistics-metric orders"><span>Commandes livrées</span><strong>{selectedStatistics.salesCount}</strong><small>1 commande livrée = 1 vente</small></article>
        <article className="statistics-metric quantity"><span>Paires vendues</span><strong>{selectedStatistics.quantity}</strong><small>Somme des quantités livrées</small></article>
        <article className="statistics-metric revenue"><span>Chiffre d’affaires</span><strong>{money(selectedStatistics.revenue)}</strong><small>Prix de vente enregistrés</small></article>
        <article className="statistics-metric profit"><span>Bénéfice du mois</span><strong>{money(selectedStatistics.profit)}</strong><small>Après coûts cordonniers</small></article>
      </section>

      <p className="statistics-explanation"><strong>Quelle différence ?</strong> Une commande livrée compte comme une vente, quelle que soit sa quantité. Exemple : une commande de 3 paires représente 1 commande livrée et 3 paires vendues.</p>

      {selectedStatistics.missingAccounting > 0 && (
        <p className="statistics-warning">{selectedStatistics.missingAccounting} vente{selectedStatistics.missingAccounting > 1 ? 's' : ''} livrée{selectedStatistics.missingAccounting > 1 ? 's' : ''} sans prix enregistré. Complétez la rubrique Comptabilité pour obtenir le bénéfice exact.</p>
      )}

      <section className="statistics-chart-card">
        <div className="statistics-section-heading">
          <div><h2>Évolution des bénéfices</h2><p>Les douze derniers mois, sur les commandes livrées.</p></div>
          <span>Maximum : {money(maximumProfit)}</span>
        </div>
        <div className="statistics-chart" aria-label="Évolution des bénéfices sur douze mois">
          {evolution.map((item) => (
            <article key={item.month} className="statistics-bar-column">
              <strong>{money(item.profit)}</strong>
              <div className="statistics-bar-track"><i className={item.profit < 0 ? 'negative' : ''} style={{ height: `${Math.max(Math.abs(item.profit) / maximumProfit * 100, item.profit ? 6 : 2)}%` }} /></div>
              <span>{monthLabel(item.month, 'short')}</span>
              <small>{item.salesCount} vente{item.salesCount > 1 ? 's' : ''}</small>
            </article>
          ))}
        </div>
      </section>

      <section className="statistics-sales-card">
        <div className="statistics-section-heading">
          <div><h2>Ventes de {monthLabel(selectedMonth)}</h2><p>Détail des commandes livrées pendant le mois sélectionné.</p></div>
        </div>
        <div className="statistics-sales-list">
          {selectedStatistics.orders.length === 0 && <div className="messaging-empty compact"><p>Aucune vente livrée durant ce mois.</p></div>}
          {selectedStatistics.orders.map((order) => {
            const entry = accountingByOrder.get(order.id);
            return (
              <article key={order.id} className="statistics-sale-row">
                <div><strong>{order.numero_commande}</strong><span>{order.client_nom || 'Client'} · {order.modele}</span></div>
                <time>{saleDate(order.date_fin)}</time>
                <div><span>Vente</span><strong>{entry ? money(entry.prix_vente) : 'Non renseignée'}</strong></div>
                <div className={Number(entry?.benefice) < 0 ? 'negative' : ''}><span>Bénéfice</span><strong>{entry ? money(entry.benefice) : '—'}</strong></div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
