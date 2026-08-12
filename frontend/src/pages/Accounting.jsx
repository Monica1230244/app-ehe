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

function AccountingRow({ order, articles, entry, onSaved }) {
  const [amounts, setAmounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    setAmounts(Object.fromEntries(articles.map((article) => [article.id, {
      cost: article.comptabilite?.prix_cordonnier_unitaire ?? '',
      sale: article.comptabilite?.prix_vente_unitaire ?? ''
    }])));
  }, [articles]);

  const totals = useMemo(() => articles.reduce((summary, article) => {
    const values = amounts[article.id] || {};
    const quantity = Number(article.quantite) || 0;
    const cost = (Number(values.cost) || 0) * quantity;
    const sale = (Number(values.sale) || 0) * quantity;
    return { cost: summary.cost + cost, sale: summary.sale + sale, profit: summary.profit + sale - cost };
  }, { cost: 0, sale: 0, profit: 0 }), [amounts, articles]);

  function updateAmount(articleId, field, value) {
    setAmounts((current) => ({
      ...current,
      [articleId]: { ...current[articleId], [field]: value }
    }));
  }

  async function save(event) {
    event.preventDefault();
    const incomplete = articles.some((article) => amounts[article.id]?.cost === '' || amounts[article.id]?.sale === '');
    if (incomplete) {
      setFeedback('Renseignez les deux prix de chaque variante.');
      return;
    }

    setSaving(true);
    setFeedback('');
    try {
      const response = await api.post(`/commandes/${order.id}/comptabilite-lignes`, {
        lignes: articles.map((article) => ({
          article_id: article.id,
          prix_cordonnier_unitaire: Number(amounts[article.id].cost),
          prix_vente_unitaire: Number(amounts[article.id].sale)
        }))
      });
      onSaved(order.id, response.data.comptabilite, response.data.lignes);
      setFeedback('Comptabilité enregistrée');
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
        <p>{order.client_nom || 'Client'} · {order.quantite} paire{Number(order.quantite) > 1 ? 's' : ''}</p>
        <small>Cordonnier : {order.cordonnier_nom || 'Non renseigné'}</small>
      </div>

      <form className="accounting-order-form" onSubmit={save}>
        <div className="accounting-lines">
          {articles.map((article, index) => {
            const values = amounts[article.id] || {};
            const quantity = Number(article.quantite) || 0;
            const lineProfit = ((Number(values.sale) || 0) - (Number(values.cost) || 0)) * quantity;
            return (
              <div className="accounting-line" key={article.id}>
                <div className="accounting-line-product">
                  <span>Variante {index + 1}</span>
                  <strong>{article.modele}</strong>
                  <small>{article.couleur} · Pointure {article.pointure} · {quantity} paire{quantity > 1 ? 's' : ''}</small>
                </div>
                <label>
                  <span>Coût cordonnier / paire</span>
                  <span className="money-input"><input type="number" min="0" step="1" inputMode="numeric" value={values.cost ?? ''} onChange={(event) => updateAmount(article.id, 'cost', event.target.value)} placeholder="0" required /><i>FCFA</i></span>
                </label>
                <label>
                  <span>Prix de vente / paire</span>
                  <span className="money-input"><input type="number" min="0" step="1" inputMode="numeric" value={values.sale ?? ''} onChange={(event) => updateAmount(article.id, 'sale', event.target.value)} placeholder="0" required /><i>FCFA</i></span>
                </label>
                <div className={`accounting-profit${lineProfit < 0 ? ' negative' : ''}`}>
                  <span>Bénéfice de la variante</span>
                  <strong>{money(lineProfit)}</strong>
                </div>
              </div>
            );
          })}
        </div>

        <div className="accounting-order-total">
          <div><span>Coût total</span><strong>{money(totals.cost)}</strong></div>
          <div><span>Vente totale</span><strong>{money(totals.sale)}</strong></div>
          <div className={totals.profit < 0 ? 'negative' : ''}><span>Bénéfice total</span><strong>{money(totals.profit)}</strong></div>
          <div className="accounting-save">
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : entry ? 'Mettre à jour' : 'Enregistrer'}</button>
            {feedback && <small>{feedback}</small>}
          </div>
        </div>
      </form>
    </article>
  );
}

export default function Accounting() {
  const [orders, setOrders] = useState([]);
  const [entries, setEntries] = useState([]);
  const [articles, setArticles] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/commandes'), api.get('/comptabilite'), api.get('/articles-comptabilite')])
      .then(([ordersResponse, accountingResponse, articlesResponse]) => {
        setOrders(ordersResponse.data.commandes.filter((order) => order.statut !== 'annulee'));
        setEntries(accountingResponse.data.comptabilite);
        setArticles(articlesResponse.data.articles);
      })
      .catch((requestError) => setError(requestError.response?.data?.error || 'Impossible de charger la comptabilité.'))
      .finally(() => setLoading(false));
  }, []);

  const entriesByOrder = useMemo(() => new Map(entries.map((entry) => [entry.commande_id, entry])), [entries]);
  const articlesByOrder = useMemo(() => articles.reduce((groups, article) => {
    const current = groups.get(article.commande_id) || [];
    current.push(article);
    groups.set(article.commande_id, current);
    return groups;
  }, new Map()), [articles]);
  const totals = useMemo(() => entries.reduce((summary, entry) => ({
    cost: summary.cost + Number(entry.prix_cordonnier),
    sales: summary.sales + Number(entry.prix_vente),
    profit: summary.profit + Number(entry.benefice)
  }), { cost: 0, sales: 0, profit: 0 }), [entries]);

  const filteredOrders = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    if (!normalizedSearch) return orders;
    return orders.filter((order) => {
      const orderArticles = articlesByOrder.get(order.id) || [];
      return [order.numero_commande, order.client_nom, order.cordonnier_nom, ...orderArticles.flatMap((article) => [article.modele, article.couleur, article.pointure])]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(normalizedSearch);
    });
  }, [articlesByOrder, orders, search]);

  function updateEntry(orderId, savedEntry, savedLines) {
    setEntries((current) => [savedEntry, ...current.filter((entry) => entry.commande_id !== savedEntry.commande_id)]);
    const linesByArticle = new Map(savedLines.map((line) => [line.article_id, line]));
    setArticles((current) => current.map((article) => article.commande_id === orderId
      ? { ...article, comptabilite: linesByArticle.get(article.id) || null }
      : article));
  }

  if (loading) {
    return <div className="page-loader"><span className="loader-ring" /><p>Calcul de votre activité…</p></div>;
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header">
        <div>
          <h1>Comptabilité</h1>
          <p>Saisissez les prix par paire pour chaque variante. Les totaux sont calculés automatiquement.</p>
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
          <div><h2>Détail par commande et variante</h2><p>Pour chaque paire : prix de vente moins coût du cordonnier.</p></div>
          <input type="search" aria-label="Rechercher une commande" placeholder="Commande, modèle, couleur…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        {error && <p className="conversation-error">{error}</p>}
        <div className="accounting-orders">
          {filteredOrders.length === 0 && <div className="messaging-empty compact"><p>Aucune commande à afficher.</p></div>}
          {filteredOrders.map((order) => (
            <AccountingRow key={order.id} order={order} articles={articlesByOrder.get(order.id) || []} entry={entriesByOrder.get(order.id)} onSaved={updateEntry} />
          ))}
        </div>
      </section>
    </div>
  );
}
