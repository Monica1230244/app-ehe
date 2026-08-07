import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Dashboard({ user }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const isManager = ['revendeur', 'admin'].includes(user.role);

  useEffect(() => {
    api.get('/dashboard')
      .then((response) => setSummary(response.data.summary))
      .catch((requestError) => setError(requestError.response?.data?.error || 'Impossible de charger le tableau de bord.'));
  }, []);

  if (!summary) {
    return <div className="page-loader">{error || <><span className="loader-ring" /><p>Chargement de votre activité…</p></>}</div>;
  }

  const metrics = [
    ['metric-total', '◆', 'Total commandes', summary.total],
    ['metric-waiting', '◷', 'En attente', summary.en_attente],
    ['metric-making', '✦', 'En fabrication', summary.en_fabrication],
    ['metric-ready', '✓', 'Prêtes', summary.prete],
    ['metric-delivered', '↗', 'Livrées', summary.livree]
  ];

  return (
    <div className="page-shell">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Vue d’ensemble</span>
          <h1>Votre atelier avance, commande après commande.</h1>
          <p>{isManager ? 'Suivez la production, organisez votre équipe et gardez chaque client informé.' : 'Retrouvez les commandes qui vous sont confiées et faites progresser leur fabrication.'}</p>
        </div>
        <Link className="hero-action" to={isManager ? '/create-order' : '/orders'}>{isManager ? '＋ Nouvelle commande' : 'Voir mes commandes'} <span>→</span></Link>
      </section>

      <div className="page-header">
        <div><h1>Activité</h1><p>Les chiffres essentiels de vos commandes.</p></div>
      </div>
      <div className="metric-grid">
        {metrics.map(([className, icon, label, value]) => (
          <article key={label} className={`metric-card ${className}`}>
            <span className="metric-icon">{icon}</span>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>

      <div className="quick-actions">
        <Link className="quick-action" to="/orders"><span>⌕</span><div><strong>Consulter les commandes</strong><small>Filtrer et suivre la production</small></div></Link>
        {isManager && <Link className="quick-action" to="/clients"><span>◎</span><div><strong>Gérer les clients</strong><small>Coordonnées et historique</small></div></Link>}
        <Link className="quick-action" to="/notifications"><span>◉</span><div><strong>Voir les notifications</strong><small>Rester informé en temps réel</small></div></Link>
      </div>
    </div>
  );
}
