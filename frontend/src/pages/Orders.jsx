import { useEffect, useState } from 'react';
import api from '../api/client';

export default function Orders() {
  const [commandes, setCommandes] = useState([]);

  useEffect(() => {
    api.get('/commandes').then((response) => setCommandes(response.data.commandes));
  }, []);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Commandes</h1>
      <div className="space-y-3">
        {commandes.length === 0 && <div>Aucune commande.</div>}
        {commandes.map((commande) => (
          <div key={commande.id} className="rounded border p-4 bg-white shadow-sm">
            <div className="font-semibold">{commande.numero_commande}</div>
            <div className="text-sm text-gray-600">Statut : {commande.statut}</div>
            <div className="text-sm">Modèle : {commande.modele}</div>
            <div className="text-sm">Pointure : {commande.pointure}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
