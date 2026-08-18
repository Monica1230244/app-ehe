import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const statusLabels = {
  nouvelle: 'Nouvelle',
  en_cours: 'À préparer',
  convertie: 'Commande créée',
  archivee: 'Archivée'
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'medium', timeStyle: 'short' });

export default function CatalogRequests() {
  const [requests, setRequests] = useState([]);
  const [filter, setFilter] = useState('actives');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.get('/demandes-catalogue')
      .then((response) => setRequests(response.data.demandes))
      .catch((requestError) => setMessage(requestError.response?.data?.error || 'Impossible de charger les demandes.'))
      .finally(() => setLoading(false));
  }, []);

  const filteredRequests = useMemo(() => requests.filter((request) => {
    if (filter === 'actives') return ['nouvelle', 'en_cours'].includes(request.statut);
    if (filter === 'converties') return request.statut === 'convertie';
    if (filter === 'archivees') return request.statut === 'archivee';
    return true;
  }), [filter, requests]);

  async function archiveRequest(requestId) {
    setMessage('');
    try {
      const response = await api.patch(`/demandes-catalogue/${requestId}`, { statut: 'archivee' });
      setRequests((current) => current.map((request) => request.id === requestId ? { ...request, ...response.data.demande } : request));
      setMessage('Demande archivée.');
    } catch (requestError) {
      setMessage(requestError.response?.data?.error || 'Impossible d’archiver cette demande.');
    }
  }

  if (loading) {
    return <div className="page-loader"><span className="loader-ring" /><p>Chargement des sélections clients…</p></div>;
  }

  return (
    <div className="page-shell space-y-5">
      <div className="page-header">
        <div><span className="eyebrow">Catalogue public</span><h1>Demandes clients</h1><p>Consultez les paniers envoyés depuis votre catalogue et transformez-les en commandes.</p></div>
        <Link className="primary-button compact" to="/stock">Partager le catalogue</Link>
      </div>

      <section className="catalog-request-summary">
        <article><span>Nouvelles</span><strong>{requests.filter((request) => request.statut === 'nouvelle').length}</strong></article>
        <article><span>À préparer</span><strong>{requests.filter((request) => request.statut === 'en_cours').length}</strong></article>
        <article><span>Commandes créées</span><strong>{requests.filter((request) => request.statut === 'convertie').length}</strong></article>
      </section>

      <div className="catalog-request-toolbar">
        <div>
          <button type="button" className={filter === 'actives' ? 'active' : ''} onClick={() => setFilter('actives')}>À traiter</button>
          <button type="button" className={filter === 'converties' ? 'active' : ''} onClick={() => setFilter('converties')}>Commandes créées</button>
          <button type="button" className={filter === 'archivees' ? 'active' : ''} onClick={() => setFilter('archivees')}>Archivées</button>
          <button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>Toutes</button>
        </div>
        {message && <p>{message}</p>}
      </div>

      <section className="catalog-request-list">
        {filteredRequests.length === 0 && <div className="messaging-empty compact"><p>Aucune demande dans cette catégorie.</p></div>}
        {filteredRequests.map((request) => {
          const totalPairs = request.articles.reduce((total, article) => total + Number(article.quantite), 0);
          return (
            <article className={`catalog-request-card status-${request.statut}`} key={request.id}>
              <header>
                <div><span className={`catalog-request-status ${request.statut}`}>{statusLabels[request.statut]}</span><h2>{request.civilite ? `${request.civilite} ` : ''}{request.nom_client}</h2><a href={`tel:${request.telephone}`}>{request.telephone}</a></div>
                <div><strong>{totalPairs}</strong><span>paire{totalPairs > 1 ? 's' : ''}</span><time>{dateFormatter.format(new Date(request.created_at))}</time></div>
              </header>

              <div className="catalog-request-items">
                {request.articles.map((article) => (
                  <article key={article.id}>
                    {article.modele?.photo_url && <img src={article.modele.photo_url} alt={article.modele.nom} />}
                    <div><strong>{article.modele?.nom || 'Modèle indisponible'}</strong><small>{article.modele?.reference || 'Sans référence'}</small><span>{article.quantite} paire{article.quantite > 1 ? 's' : ''}{article.pointure ? ` · Pointure ${article.pointure}` : ''}{article.couleur ? ` · ${article.couleur}` : ''}</span></div>
                  </article>
                ))}
              </div>

              {request.note && <p className="catalog-request-note"><strong>Message du client :</strong> {request.note}</p>}

              <footer>
                {request.statut === 'convertie' && request.commande_id
                  ? <Link className="primary-button compact" to={`/orders/${request.commande_id}`}>Ouvrir la commande</Link>
                  : request.statut !== 'archivee' && <Link className="primary-button compact" to={`/create-order?demande=${request.id}`}>Préparer la commande</Link>}
                {request.statut !== 'archivee' && request.statut !== 'convertie' && <button type="button" className="secondary-button" onClick={() => archiveRequest(request.id)}>Archiver</button>}
              </footer>
            </article>
          );
        })}
      </section>
    </div>
  );
}
