import { useEffect, useMemo, useState } from 'react';
import api from '../api/client';

const statusLabels = {
  en_attente: 'En attente',
  en_fabrication: 'En fabrication',
  prete: 'Prête',
  livree: 'Livrée',
  annulee: 'Annulée'
};

const paymentModeLabels = {
  especes: 'Espèces',
  mobile_money: 'Mobile Money',
  virement: 'Virement',
  carte: 'Carte',
  autre: 'Autre'
};

const moneyFormatter = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'XOF',
  maximumFractionDigits: 0
});

const paymentDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short'
});

function money(value) {
  return moneyFormatter.format(Number(value) || 0);
}

function todayInputValue() {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().slice(0, 10);
}

function receiptNumber(paymentId) {
  return 'REC-' + String(paymentId).padStart(6, '0');
}

function PaymentReceipt({ receipt }) {
  if (!receipt) return null;
  const { order, articles, entry, payment, paidTotal, remaining } = receipt;

  return (
    <article className="payment-receipt-print">
      <header className="receipt-header">
        <img src={import.meta.env.BASE_URL + 'ehe-logo-wine.png'} alt="EHE" />
        <div><strong>EHE</strong><span>Atelier & commandes</span></div>
        <div className="receipt-heading"><h1>Reçu de paiement</h1><p>{receiptNumber(payment.id)}</p></div>
      </header>

      <section className="receipt-meta">
        <div><span>Client</span><strong>{order.client_nom || 'Client'}</strong><small>{order.client_telephone || 'Téléphone non renseigné'}</small></div>
        <div><span>Commande</span><strong>{order.numero_commande}</strong><small>{statusLabels[order.statut]}</small></div>
        <div><span>Date du paiement</span><strong>{paymentDateFormatter.format(new Date(payment.date_paiement))}</strong><small>{paymentModeLabels[payment.mode_paiement] || payment.mode_paiement}</small></div>
      </section>

      <table className="receipt-lines">
        <thead><tr><th>Modèle</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr></thead>
        <tbody>
          {articles.map((article) => {
            const unitSale = Number(article.comptabilite?.prix_vente_unitaire || 0);
            const quantity = Number(article.quantite) || 0;
            return (
              <tr key={article.id}>
                <td><strong>{article.modele}</strong><small>{article.couleur} · Pointure {article.pointure}</small></td>
                <td>{quantity}</td>
                <td>{money(unitSale)}</td>
                <td>{money(unitSale * quantity)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <section className="receipt-payment">
        <div><span>Montant de ce paiement</span><strong>{money(payment.montant)}</strong></div>
        <div><span>Total de la commande</span><strong>{money(entry.prix_vente)}</strong></div>
        <div><span>Total encaissé</span><strong>{money(paidTotal)}</strong></div>
        <div><span>Reste à payer</span><strong>{money(remaining)}</strong></div>
      </section>

      {(payment.reference || payment.note) && (
        <section className="receipt-notes">
          {payment.reference && <p><strong>Référence :</strong> {payment.reference}</p>}
          {payment.note && <p><strong>Note :</strong> {payment.note}</p>}
        </section>
      )}

      <footer className="receipt-footer">
        <div><span>Signature EHE</span></div>
        <p>Merci pour votre confiance.</p>
      </footer>
    </article>
  );
}

function AccountingRow({ order, articles, entry, payments, onSaved, onPaymentSaved, onPaymentDeleted, onPrintReceipt }) {
  const [amounts, setAmounts] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState(null);
  const [paymentFeedback, setPaymentFeedback] = useState('');
  const [paymentForm, setPaymentForm] = useState({
    montant: '',
    mode_paiement: 'especes',
    reference: '',
    note: '',
    date_paiement: todayInputValue()
  });

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

  const saleTotal = Number(entry?.prix_vente || 0);
  const paidTotal = useMemo(() => payments.reduce((sum, payment) => sum + Number(payment.montant), 0), [payments]);
  const remaining = Math.max(saleTotal - paidTotal, 0);
  const paymentStatus = !entry ? 'unrecorded' : paidTotal <= 0 ? 'unpaid' : remaining <= 0 ? 'paid' : 'partial';
  const paymentStatusLabel = {
    unrecorded: 'Prix non renseignés',
    unpaid: 'Non payé',
    partial: 'Paiement partiel',
    paid: 'Payé'
  }[paymentStatus];

  useEffect(() => {
    setPaymentForm((current) => ({ ...current, montant: remaining > 0 ? String(remaining) : '' }));
  }, [remaining]);

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
      const response = await api.post('/commandes/' + order.id + '/comptabilite-lignes', {
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

  async function savePayment(event) {
    event.preventDefault();
    const amount = Number(paymentForm.montant);
    if (!amount || amount <= 0) {
      setPaymentFeedback('Saisissez un montant supérieur à zéro.');
      return;
    }
    if (amount > remaining) {
      setPaymentFeedback('Le montant dépasse le reste à payer.');
      return;
    }

    setSavingPayment(true);
    setPaymentFeedback('');
    try {
      const response = await api.post('/commandes/' + order.id + '/paiements', {
        ...paymentForm,
        montant: amount
      });
      onPaymentSaved(response.data.paiement);
      setPaymentForm({
        montant: '',
        mode_paiement: 'especes',
        reference: '',
        note: '',
        date_paiement: todayInputValue()
      });
      setPaymentFeedback('Paiement enregistré.');
    } catch (requestError) {
      setPaymentFeedback(requestError.response?.data?.error || 'Enregistrement du paiement impossible.');
    } finally {
      setSavingPayment(false);
    }
  }

  async function deletePayment(payment) {
    if (!window.confirm('Supprimer ce paiement de ' + money(payment.montant) + ' ?')) return;
    setDeletingPaymentId(payment.id);
    setPaymentFeedback('');
    try {
      await api.delete('/paiements/' + payment.id);
      onPaymentDeleted(payment.id);
      setPaymentFeedback('Paiement supprimé.');
    } catch (requestError) {
      setPaymentFeedback(requestError.response?.data?.error || 'Suppression du paiement impossible.');
    } finally {
      setDeletingPaymentId(null);
    }
  }

  return (
    <article className="accounting-order-card">
      <div className="accounting-order-info">
        <div>
          <strong>{order.numero_commande}</strong>
          <span className={'status-badge status-' + order.statut}>{statusLabels[order.statut]}</span>
          <span className={'payment-status payment-status-' + paymentStatus}>{paymentStatusLabel}</span>
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
                <div className={'accounting-profit' + (lineProfit < 0 ? ' negative' : '')}>
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

      <section className="payment-panel">
        <div className="payment-panel-header">
          <div><span>Encaissements client</span><h3>Suivi des paiements</h3></div>
          <div className="payment-summary-row">
            <div><span>Vente</span><strong>{money(saleTotal)}</strong></div>
            <div><span>Encaissé</span><strong>{money(paidTotal)}</strong></div>
            <div><span>Reste</span><strong>{money(remaining)}</strong></div>
          </div>
        </div>

        {!entry ? (
          <p className="payment-empty">Enregistrez d’abord les prix de vente pour pouvoir ajouter un paiement.</p>
        ) : (
          <>
            {remaining > 0 && (
              <form className="payment-form" onSubmit={savePayment}>
                <label>Montant reçu<span className="money-input"><input type="number" min="1" max={remaining} step="1" inputMode="numeric" value={paymentForm.montant} onChange={(event) => setPaymentForm({ ...paymentForm, montant: event.target.value })} required /><i>FCFA</i></span></label>
                <label>Mode de paiement<select value={paymentForm.mode_paiement} onChange={(event) => setPaymentForm({ ...paymentForm, mode_paiement: event.target.value })}><option value="especes">Espèces</option><option value="mobile_money">Mobile Money</option><option value="virement">Virement</option><option value="carte">Carte</option><option value="autre">Autre</option></select></label>
                <label>Date<input type="date" max={todayInputValue()} value={paymentForm.date_paiement} onChange={(event) => setPaymentForm({ ...paymentForm, date_paiement: event.target.value })} required /></label>
                <label>Référence <small>Facultative</small><input value={paymentForm.reference} onChange={(event) => setPaymentForm({ ...paymentForm, reference: event.target.value })} maxLength="120" placeholder="Transaction ou reçu" /></label>
                <label className="payment-note">Note <small>Facultative</small><input value={paymentForm.note} onChange={(event) => setPaymentForm({ ...paymentForm, note: event.target.value })} maxLength="300" placeholder="Précision sur le paiement" /></label>
                <button type="submit" className="primary-button compact" disabled={savingPayment}>{savingPayment ? 'Enregistrement…' : 'Ajouter le paiement'}</button>
              </form>
            )}

            {payments.length > 0 ? (
              <div className="payment-history">
                {payments.map((payment) => (
                  <div className="payment-entry" key={payment.id}>
                    <div><strong>{money(payment.montant)}</strong><span>{paymentModeLabels[payment.mode_paiement] || payment.mode_paiement} · {paymentDateFormatter.format(new Date(payment.date_paiement))}</span>{payment.reference && <small>Réf. {payment.reference}</small>}</div>
                    <div className="payment-entry-actions">
                      <button type="button" onClick={() => onPrintReceipt({ order, articles, entry, payment, paidTotal, remaining })}>Reçu / PDF</button>
                      <button type="button" className="danger-text" onClick={() => deletePayment(payment)} disabled={deletingPaymentId === payment.id}>{deletingPaymentId === payment.id ? 'Suppression…' : 'Supprimer'}</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="payment-empty">Aucun paiement enregistré pour cette commande.</p>
            )}
          </>
        )}
        {paymentFeedback && <p className="payment-feedback" role="status">{paymentFeedback}</p>}
      </section>
    </article>
  );
}

export default function Accounting() {
  const [orders, setOrders] = useState([]);
  const [entries, setEntries] = useState([]);
  const [articles, setArticles] = useState([]);
  const [payments, setPayments] = useState([]);
  const [receipt, setReceipt] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/commandes'), api.get('/comptabilite'), api.get('/articles-comptabilite'), api.get('/paiements')])
      .then(([ordersResponse, accountingResponse, articlesResponse, paymentsResponse]) => {
        setOrders(ordersResponse.data.commandes.filter((order) => order.statut !== 'annulee'));
        setEntries(accountingResponse.data.comptabilite);
        setArticles(articlesResponse.data.articles);
        setPayments(paymentsResponse.data.paiements);
      })
      .catch((requestError) => setError(requestError.response?.data?.error || 'Impossible de charger la comptabilité.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const clearReceipt = () => setReceipt(null);
    window.addEventListener('afterprint', clearReceipt);
    return () => window.removeEventListener('afterprint', clearReceipt);
  }, []);

  const entriesByOrder = useMemo(() => new Map(entries.map((entry) => [entry.commande_id, entry])), [entries]);
  const articlesByOrder = useMemo(() => articles.reduce((groups, article) => {
    const current = groups.get(article.commande_id) || [];
    current.push(article);
    groups.set(article.commande_id, current);
    return groups;
  }, new Map()), [articles]);
  const paymentsByOrder = useMemo(() => payments.reduce((groups, payment) => {
    const current = groups.get(payment.commande_id) || [];
    current.push(payment);
    groups.set(payment.commande_id, current);
    return groups;
  }, new Map()), [payments]);
  const totals = useMemo(() => {
    const accountingTotals = entries.reduce((summary, entry) => ({
      cost: summary.cost + Number(entry.prix_cordonnier),
      sales: summary.sales + Number(entry.prix_vente),
      profit: summary.profit + Number(entry.benefice)
    }), { cost: 0, sales: 0, profit: 0 });
    const paid = payments.reduce((sum, payment) => sum + Number(payment.montant), 0);
    return { ...accountingTotals, paid, due: Math.max(accountingTotals.sales - paid, 0) };
  }, [entries, payments]);

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

  function addPayment(payment) {
    setPayments((current) => [payment, ...current]);
  }

  function removePayment(paymentId) {
    setPayments((current) => current.filter((payment) => payment.id !== paymentId));
  }

  function printReceipt(receiptData) {
    setReceipt(receiptData);
    window.setTimeout(() => window.print(), 120);
  }

  if (loading) {
    return <div className="page-loader"><span className="loader-ring" /><p>Calcul de votre activité…</p></div>;
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header">
        <div>
          <h1>Comptabilité</h1>
          <p>Saisissez les prix, enregistrez les acomptes et imprimez les reçus de paiement.</p>
        </div>
        <span className="accounting-private"><i /> Visible uniquement par le revendeur</span>
      </div>

      <section className="accounting-summary">
        <article className="accounting-metric cost"><span>Coût total cordonniers</span><strong>{money(totals.cost)}</strong></article>
        <article className="accounting-metric sales"><span>Total des ventes</span><strong>{money(totals.sales)}</strong></article>
        <article className="accounting-metric profit"><span>Bénéfice total</span><strong>{money(totals.profit)}</strong></article>
        <article className="accounting-metric paid"><span>Total encaissé</span><strong>{money(totals.paid)}</strong></article>
        <article className="accounting-metric due"><span>Total restant</span><strong>{money(totals.due)}</strong></article>
        <article className="accounting-metric recorded"><span>Commandes renseignées</span><strong>{entries.length}</strong></article>
      </section>

      <section className="accounting-ledger">
        <div className="accounting-ledger-header">
          <div><h2>Détail par commande et variante</h2><p>Prix, bénéfices, acomptes, soldes et reçus sont réunis au même endroit.</p></div>
          <input type="search" aria-label="Rechercher une commande" placeholder="Commande, modèle, couleur…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </div>

        {error && <p className="conversation-error">{error}</p>}
        <div className="accounting-orders">
          {filteredOrders.length === 0 && <div className="messaging-empty compact"><p>Aucune commande à afficher.</p></div>}
          {filteredOrders.map((order) => (
            <AccountingRow
              key={order.id}
              order={order}
              articles={articlesByOrder.get(order.id) || []}
              entry={entriesByOrder.get(order.id)}
              payments={paymentsByOrder.get(order.id) || []}
              onSaved={updateEntry}
              onPaymentSaved={addPayment}
              onPaymentDeleted={removePayment}
              onPrintReceipt={printReceipt}
            />
          ))}
        </div>
      </section>

      <PaymentReceipt receipt={receipt} />
    </div>
  );
}
