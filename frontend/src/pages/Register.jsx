import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

export default function Register({ onRegister }) {
  const [nom, setNom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    try {
      const response = await api.post('/auth/register', { nom, email, password });
      if (response.data.requiresEmailConfirmation) {
        setSuccess('Compte créé. Consultez votre email pour confirmer le compte, puis connectez-vous.');
        return;
      }
      localStorage.setItem('ehe_token', response.data.token);
      onRegister(response.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Erreur d’enregistrement');
    }
  };

  return (
    <div className="max-w-md mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Créer le compte revendeur</h1>
      <p className="mb-4 text-sm text-slate-600">Les comptes cordonnier et les autres revendeurs sont créés depuis l’application.</p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium">Nom</label>
          <input
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            className="w-full rounded border px-3 py-2"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded border px-3 py-2"
            type="email"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Mot de passe</label>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border px-3 py-2"
            type="password"
            required
          />
        </div>
        {error && <div className="text-red-600">{error}</div>}
        {success && <div className="text-emerald-700">{success}</div>}
        <button className="w-full bg-blue-600 text-white rounded px-4 py-2">Créer le compte</button>
      </form>
      <p className="mt-4 text-sm"><Link to="/" className="font-medium text-blue-700">Retour à la connexion</Link></p>
    </div>
  );
}
