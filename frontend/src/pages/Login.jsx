import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function Login({ onLogin, allowRegistration = false }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/login', { email, password });
      localStorage.setItem('ehe_token', response.data.token);
      onLogin(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur de connexion');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout eyebrow="Bienvenue" title="Heureux de vous revoir" subtitle="Connectez-vous pour piloter vos commandes et votre atelier.">
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="form-field">
          <span>Adresse email</span>
          <span className="input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v14H4zM4 7l8 6 8-6" /></svg>
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="vous@entreprise.com" autoComplete="email" required />
          </span>
        </label>
        <label className="form-field">
          <span>Mot de passe</span>
          <span className="input-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2M5 10h14v10H5z" /></svg>
            <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="Votre mot de passe" autoComplete="current-password" required />
            <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)} aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}>{showPassword ? 'Masquer' : 'Voir'}</button>
          </span>
        </label>
        {error && <div className="alert alert-error" role="alert">{error}</div>}
        <button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Connexion…' : 'Se connecter'}<span aria-hidden="true">→</span></button>
      </form>
      {allowRegistration
        ? <p className="auth-switch">Premier accès ? <Link to="/register">Créer le compte revendeur</Link></p>
        : <p className="auth-switch">Les accès sont créés et attribués par le revendeur.</p>}
    </AuthLayout>
  );
}
