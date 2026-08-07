import Brand from './Brand';

export default function AuthLayout({ children, eyebrow, title, subtitle }) {
  return (
    <div className="auth-shell">
      <section className="auth-visual">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <Brand inverse />
        <div className="auth-visual-copy">
          <span className="auth-kicker">La production, simplement.</span>
          <h2>De la prise de commande à la livraison.</h2>
          <p>Une seule application pour connecter le revendeur et le cordonnier, suivre chaque paire et informer le client.</p>
        </div>
        <div className="auth-features">
          <div><span>01</span><p><strong>Commandes claires</strong>Photos, mesures et délais au même endroit.</p></div>
          <div><span>02</span><p><strong>Suivi en direct</strong>Chaque étape de fabrication reste visible.</p></div>
          <div><span>03</span><p><strong>Données protégées</strong>Accès privé selon le rôle de chacun.</p></div>
        </div>
      </section>

      <main className="auth-panel">
        <div className="auth-mobile-brand"><Brand /></div>
        <div className="auth-card">
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p className="auth-subtitle">{subtitle}</p>
          {children}
        </div>
        <p className="auth-security"><span>●</span> Connexion chiffrée et données protégées</p>
      </main>
    </div>
  );
}
