import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Dashboard({ user }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard').then((response) => setSummary(response.data.summary)).catch((requestError) => setError(requestError.response?.data?.error || 'Impossible de charger le tableau de bord.'));
  }, []);

  if (!summary) {
    return <div className="p-4">{error || 'Chargement...'}</div>;
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold">Tableau de bord</h1>
      <p className="text-sm text-slate-600">Vue {user.role === 'cordonnier' ? 'des commandes qui vous sont attribuées' : 'de vos commandes'}.</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded border p-4 bg-white shadow-sm">
          <div className="text-sm text-gray-500">Total commandes</div>
          <div className="text-3xl font-bold">{summary.total}</div>
        </div>
        <div className="rounded border p-4 bg-yellow-50 shadow-sm">
          <div className="text-sm text-gray-500">En attente</div>
          <div className="text-3xl font-bold">{summary.en_attente}</div>
        </div>
        <div className="rounded border p-4 bg-blue-50 shadow-sm">
          <div className="text-sm text-gray-500">En fabrication</div>
          <div className="text-3xl font-bold">{summary.en_fabrication}</div>
        </div>
        <div className="rounded border p-4 bg-green-50 shadow-sm">
          <div className="text-sm text-gray-500">Prêtes</div>
          <div className="text-3xl font-bold">{summary.prete}</div>
        </div>
        <div className="rounded border p-4 bg-black text-white shadow-sm">
          <div className="text-sm">Livrées</div>
          <div className="text-3xl font-bold">{summary.livree}</div>
        </div>
      </div>
    </div>
  );
}
