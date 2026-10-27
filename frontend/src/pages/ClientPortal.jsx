import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import Brand from '../components/Brand';
import api from '../api/client';

const statusLabels = {
  recue: 'Reçue',
  en_attente: 'En attente',
  en_fabrication: 'En fabrication',
  prete: 'Prête',
  livree: 'Livrée',
  annulee: 'Annulée'
};

const statusDescriptions = {
  recue: 'Votre demande a bien été reçue par EHE.',
  en_attente: 'EHE prépare votre commande.',
  en_fabrication: 'Votre paire est actuellement en fabrication.',
  prete: 'Votre commande est prête. Envoyez vos informations de livraison.',
  livree: 'Votre commande a été livrée.',
  annulee: 'Cette commande a été annulée.'
};

const deliveryStatusLabels = { recue: 'Informations reçues', confirmee: 'Livraison confirmée', livree: 'Livrée' };

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

function formatShortDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium' }).format(new Date(value));
}

function clientName(client) {
  return [client?.civilite, client?.nom].filter(Boolean).join(' ') || 'Client EHE';
}

function whatsappUrl(message) {
  const number = String(import.meta.env.VITE_EHE_WHATSAPP_NUMBER || '').replace(/\D/g, '');
  const target = number ? 'https://wa.me/' + number : 'https://wa.me/';
  return target + '?text=' + encodeURIComponent(message);
}

function orderWhatsappUrl(order, client) {
  const name = clientName(client);
  const number = order.numero_commande ? ' ' + order.numero_commande : '';
  return whatsappUrl(
    'Bonjour EHE, je confirme ma commande' + number + ' au nom de ' + name + '. Je souhaite organiser la livraison.'
  );
}

function selectionWhatsappUrl(selection, client) {
  const name = clientName(client);
  const lines = (selection.articles || [])
    .map((article) => {
      const color = article.couleur ? ' - ' + article.couleur : '';
      return (article.quantite || 1) + ' x ' + (article.modele || 'Modèle') + color;
    })
    .join(', ');
  return whatsappUrl(
    'Bonjour EHE, je confirme ma sélection au nom de ' + name + ': ' + (lines || 'mes modèles sélectionnés') + '.'
  );
}

function emptyDelivery(client, order) {
  return {
    nom_reception: order?.livraison?.nom_reception || client?.nom || '',
    telephone: order?.livraison?.telephone || client?.telephone || '',
    adresse: order?.livraison?.adresse || '',
    ville: order?.livraison?.ville || '',
    instructions: order?.livraison?.instructions || ''
  };
}

function OrderStatus({ order }) {
  const status = order.statut || 'en_attente';
  return (
    <div className="client-portal-status">
      <span className={'client-portal-status-dot status-' + status} />
      <div>
        <strong>{statusLabels[status] || status}</strong>
        <p>{statusDescriptions[status] || 'Le statut de votre commande est suivi par EHE.'}</p>
      </div>
    </div>
  );
}

export default function ClientPortal() {
  const { clientToken } = useParams();
  const [portal, setPortal] = useState(null);
  const [deliveryForms, setDeliveryForms] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingOrderId, setSavingOrderId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadPortal = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const response = await api.get('/client-portal/' + clientToken);
      const nextPortal = response.data.portal;
      setPortal(nextPortal);
      setError('');
      setDeliveryForms((current) => {
        const next = { ...current };
        (nextPortal.commandes || []).forEach((order) => {
          if (!next[order.id]) next[order.id] = emptyDelivery(nextPortal.client, order);
        });
        return next;
      });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Ce lien client est invalide ou expiré.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [clientToken]);

  useEffect(() => {
    loadPortal();
    const timer = window.setInterval(() => loadPortal(true), 30000);
    return () => window.clearInterval(timer);
  }, [loadPortal]);

  const orders = portal?.commandes || [];
  const selections = portal?.selections || [];
  const readyOrders = useMemo(() => orders.filter((order) => order.statut === 'prete'), [orders]);

  function updateDelivery(orderId, field, value) {
    setDeliveryForms((current) => ({
      ...current,
      [orderId]: { ...(current[orderId] || {}), [field]: value }
    }));
  }

  async function saveDelivery(order) {
    const form = deliveryForms[order.id] || emptyDelivery(portal.client, order);
    if (!form.nom_reception || !form.telephone || !form.adresse || !form.ville) {
      setNotice('Renseignez le nom, le téléphone, l’adresse et la ville de livraison.');
      return;
    }

    setSavingOrderId(order.id);
    setNotice('');
    try {
      const response = await api.post('/client-portal/delivery', {
        client_token: clientToken,
        commande_id: order.id,
        ...form
      });
      setPortal((current) => ({
        ...current,
        commandes: current.commandes.map((item) => item.id === order.id
          ? {
            ...item,
            livraison: {
              ...form,
              statut: response.data.statut,
              updated_at: response.data.updated_at
            }
          }
          : item)
      }));
      setNotice('Vos informations de livraison ont été transmises à EHE.');
    } catch (requestError) {
      setNotice(requestError.response?.data?.error || 'Impossible d’enregistrer la livraison.');
    } finally {
      setSavingOrderId(null);
    }
  }

  if (loading) {
    return (
      <div className="client-portal-state">
        <Brand />
        <span className="loader-ring" />
        <p>Ouverture de votre suivi sécurisé…</p>
      </div>
    );
  }

  if (!portal) {
    return (
      <div className="client-portal-state">
        <Brand />
        <h1>Suivi indisponible</h1>
        <p>{error || 'Ce lien est invalide ou a expiré.'}</p>
        <small>Demandez à EHE de vous renvoyer un nouveau lien personnel.</small>
      </div>
    );
  }

  return (
    <div className="client-portal-page">
      <header className="client-portal-header">
        <Brand inverse />
        <div className="client-portal-header-copy">
          <span>Suivi client</span>
          <strong>Accès sécurisé sans compte</strong>
        </div>
      </header>

      <main className="client-portal-main">
        <section className="client-portal-hero">
          <div>
            <span className="eyebrow">Bonjour {clientName(portal.client)}</span>
            <h1>Suivez votre commande, simplement.</h1>
            <p>Consultez vos modèles sélectionnés, l’avancement de fabrication et transmettez vos informations de livraison directement à EHE.</p>
          </div>
          <div className="client-portal-expiry">
            <span>Lien personnel</span>
            <strong>Valable jusqu’au</strong>
            <b>{formatShortDate(portal.client.expires_at)}</b>
            <small>Ne partagez pas ce lien.</small>
          </div>
        </section>

        {readyOrders.length > 0 && (
          <section className="client-portal-ready-alert" role="status">
            <div className="client-portal-ready-icon">✓</div>
            <div>
              <span>Bonne nouvelle</span>
              <h2>Votre commande est prête</h2>
              <p>EHE attend vos informations de livraison pour organiser la remise de votre commande.</p>
            </div>
            <a
              className="client-portal-whatsapp"
              href={orderWhatsappUrl(readyOrders[0], portal.client)}
              target="_blank"
              rel="noreferrer"
            >
              Confirmer sur WhatsApp
            </a>
          </section>
        )}

        {notice && <div className="client-portal-notice" role="status">{notice}</div>}
        {error && <div className="client-portal-error" role="alert">{error}</div>}

        <div className="client-portal-grid">
          <section className="client-portal-card">
            <div className="client-portal-section-heading">
              <div>
                <span className="eyebrow">Avancement</span>
                <h2>Vos commandes</h2>
              </div>
              <strong>{orders.length}</strong>
            </div>

            {orders.length === 0 ? (
              <div className="client-portal-empty">
                <span>◇</span>
                <p>Aucune commande n’est encore rattachée à ce lien.</p>
              </div>
            ) : (
              <div className="client-portal-orders">
                {orders.map((order) => {
                  const form = deliveryForms[order.id] || emptyDelivery(portal.client, order);
                  const isSaving = savingOrderId === order.id;
                  return (
                    <article className="client-portal-order" key={order.id}>
                      <div className="client-portal-order-heading">
                        <div>
                          <span className="eyebrow">Commande</span>
                          <h3>{order.numero_commande || '#' + order.id}</h3>
                        </div>
                        <span className="client-portal-order-date">{formatShortDate(order.date_creation)}</span>
                      </div>

                      <OrderStatus order={order} />

                      {(order.articles || []).length > 0 && (
                        <div className="client-portal-articles">
                          {order.articles.map((article) => (
                            <div className="client-portal-article" key={article.id || article.position}>
                              <div>
                                <strong>{article.modele || 'Modèle EHE'}</strong>
                                <span>{[article.couleur, article.pointure && 'Pointure ' + article.pointure].filter(Boolean).join(' · ') || 'Détails à confirmer'}</span>
                              </div>
                              <b>{article.quantite || 1} paire{Number(article.quantite) > 1 ? 's' : ''}</b>
                            </div>
                          ))}
                        </div>
                      )}

                      {order.observations && <p className="client-portal-observations">{order.observations}</p>}

                      {order.statut === 'prete' && (
                        <div className="client-portal-delivery">
                          <div className="client-portal-delivery-heading">
                            <div>
                              <span className="eyebrow">Dernière étape</span>
                              <h4>Organiser la livraison</h4>
                            </div>
                            {order.livraison?.statut && <span className="client-portal-delivery-saved">{deliveryStatusLabels[order.livraison.statut] || 'Informations envoyées'}</span>}
                          </div>
                          <p>Remplissez ce formulaire, puis confirmez avec EHE sur WhatsApp si besoin.</p>
                          <div className="client-portal-form">
                            <label>Nom de réception<input value={form.nom_reception} onChange={(event) => updateDelivery(order.id, 'nom_reception', event.target.value)} maxLength="120" /></label>
                            <label>Téléphone<input type="tel" value={form.telephone} onChange={(event) => updateDelivery(order.id, 'telephone', event.target.value)} maxLength="30" /></label>
                            <label className="client-portal-field-wide">Adresse<input value={form.adresse} onChange={(event) => updateDelivery(order.id, 'adresse', event.target.value)} maxLength="240" /></label>
                            <label>Ville<input value={form.ville} onChange={(event) => updateDelivery(order.id, 'ville', event.target.value)} maxLength="100" /></label>
                            <label className="client-portal-field-wide">Instructions complémentaires <small>Facultatif</small><textarea value={form.instructions} onChange={(event) => updateDelivery(order.id, 'instructions', event.target.value)} maxLength="1000" rows="3" /></label>
                          </div>
                          <div className="client-portal-actions">
                            <button type="button" className="primary-button" onClick={() => saveDelivery(order)} disabled={isSaving}>
                              {isSaving ? 'Envoi…' : 'Envoyer les informations'}
                            </button>
                            <a className="client-portal-whatsapp client-portal-whatsapp-light" href={orderWhatsappUrl(order, portal.client)} target="_blank" rel="noreferrer">Confirmer par WhatsApp</a>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="client-portal-card client-portal-selection-card">
            <div className="client-portal-section-heading">
              <div>
                <span className="eyebrow">Catalogue</span>
                <h2>Vos sélections</h2>
              </div>
              <strong>{selections.length}</strong>
            </div>
            <p className="client-portal-card-intro">Retrouvez ici les modèles que vous avez envoyés à EHE.</p>
            {selections.length === 0 ? (
              <div className="client-portal-empty compact">
                <p>Votre sélection apparaîtra ici après son envoi.</p>
              </div>
            ) : (
              <div className="client-portal-selections">
                {selections.map((selection) => (
                  <article className="client-portal-selection" key={selection.id}>
                    <div className="client-portal-selection-heading">
                      <strong>Sélection du {formatShortDate(selection.created_at)}</strong>
                      <span>{selection.statut || 'Reçue'}</span>
                    </div>
                    <div className="client-portal-selection-lines">
                      {(selection.articles || []).map((article, index) => (
                        <div key={index}>
                          <span>{article.quantite || 1} × {article.modele || 'Modèle EHE'}</span>
                          <small>{[article.reference, article.couleur, article.pointure && 'Pointure ' + article.pointure].filter(Boolean).join(' · ')}</small>
                        </div>
                      ))}
                    </div>
                    <a className="client-portal-text-link" href={selectionWhatsappUrl(selection, portal.client)} target="_blank" rel="noreferrer">Confirmer cette sélection sur WhatsApp →</a>
                  </article>
                ))}
              </div>
            )}
            <div className="client-portal-privacy">
              <strong>Vos données restent privées.</strong>
              <p>Ce lien est personnel, temporaire et ne crée aucun compte client. Ne le transférez pas.</p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
