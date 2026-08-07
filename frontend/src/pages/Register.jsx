import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';
import AuthLayout from '../components/AuthLayout';

export default function Register({ onRegister }) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);
    try {
      const response = await api.post('/auth/register', { nom, email, password });
      if (response.data.requiresEmailConfirmation) {
        setSuccess(`Un email de confirmation a été envoyé à ${email}. Ouvrez-le sur ce téléphone, puis revenez vous connecter.`);
        return;
      }
      localStorage.setItem('ehe_token', response.data.token);
      onRegister(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur d’enregistrement');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout eyebrow="Première configuration" title="Créez votre espace revendeur" subtitle="Ce premier compte administrera les clients, les commandes et les artisans.">
      {success ? (
        <div className="confirmation-card">
          <span className="confirmation-icon">✓</span>
          <h2>Vérifiez votre boîte email</h2>
          <p>{success}</p>
          <Link className="primary-button" to="/">Aller à la connexion <span aria-hidden="true">→</span></Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="form-field">
            <span>Nom complet</span>
            <span className="input-wrap">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8" /></svg>
              <input value={nom} onChange={(event) => setNom(event.target.value)} placeholder="Votre nom" autoComplete="name" required />
            </span>
          </label>
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
              <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? 'text' : 'password'} placeholder="8 caractères minimum" minLength="8" autoComplete="new-password" required />
              <button className="password-toggle" type="button" onClick={() => setShowPassword((current) => !current)}>{showPassword ? 'Masquer' : 'Voir'}</button>
            </span>
          </label>
          <div className="password-hint"><span>✓</span> Utilisez au moins 8 caractères</div>
          {error && <div className="alert alert-error" role="alert">{error}</div>}
          <button className="primary-button" disabled={isSubmitting}>{isSubmitting ? 'Création…' : 'Créer mon espace'}<span aria-hidden="true">→</span></button>
        </form>
      )}
      {!success && <p className="auth-switch">Vous avez déjà un compte ? <Link to="/">Se connecter</Link></p>}
    </AuthLayout>
  );
}
