import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';

const STATUS_LABELS = {
  en_attente: 'En attente',
  en_fabrication: 'En fabrication',
  prete: 'Prête',
  livree: 'Livrée',
  annulee: 'Annulée'
};

export default function OrderDetails(){
  const { id } = useParams();
  const navigate = useNavigate();
  const [commande, setCommande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  useEffect(()=>{
    api.get(`/commandes/${id}`).then(r=>{ setCommande(r.data.commande); setLoading(false); }).catch(()=>setLoading(false));
  },[id]);

  const changeStatus = async (newStatus)=>{
    try{
      const res = await api.patch(`/commandes/${id}/status`, { statut: newStatus });
      setCommande(res.data.commande);
      setMessage('Statut mis à jour.');
    }catch(err){
      setMessage(err.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  if(loading) return <div className="p-4">Chargement...</div>;
  if(!commande) return <div className="p-4">Commande introuvable.</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <button className="text-blue-600 mb-4" onClick={()=>navigate(-1)}>← Retour</button>
      <h1 className="text-2xl font-bold mb-2">{commande.numero_commande}</h1>
      <div className="space-y-2">
        <div><strong>Statut:</strong> {STATUS_LABELS[commande.statut] || commande.statut}</div>
        <div><strong>Modèle:</strong> {commande.modele}</div>
        <div><strong>Pointure:</strong> {commande.pointure}</div>
        <div><strong>Couleur:</strong> {commande.couleur}</div>
        <div><strong>Matière:</strong> {commande.matiere}</div>
        <div><strong>Semelle:</strong> {commande.semelle}</div>
        <div><strong>Quantité:</strong> {commande.quantite}</div>
        <div><strong>Observations:</strong> {commande.observations}</div>
      </div>

      <div className="mt-4 flex gap-2">
        {commande.statut !== 'en_fabrication' && (
          <button onClick={()=>changeStatus('en_fabrication')} className="bg-blue-600 text-white px-3 py-2 rounded">Commencer fabrication</button>
        )}
        {commande.statut !== 'prete' && (
          <button onClick={()=>changeStatus('prete')} className="bg-green-600 text-white px-3 py-2 rounded">Marquer prête</button>
        )}
        {commande.statut !== 'livree' && (
          <button onClick={()=>changeStatus('livree')} className="bg-black text-white px-3 py-2 rounded">Marquer livrée</button>
        )}
      </div>

      {message && <div className="mt-4 text-sm">{message}</div>}
    </div>
  );
}
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

export default function OrderDetails() {
  const { id } = useParams();
  const [commande, setCommande] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');

  const user = (() => {
    try {
      return JSON.parse(localStorage.getItem('ehe_user'));
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    setLoading(true);
    api
      .get(`/commandes/${id}`)
      .then((res) => setCommande(res.data.commande))
      .catch((err) => setMessage(err.response?.data?.error || 'Impossible de charger la commande'))
      .finally(() => setLoading(false));
  }, [id]);

  const changeStatus = async (newStatus) => {
    try {
      const res = await api.patch(`/commandes/${id}/status`, { statut: newStatus });
      setCommande(res.data.commande);
      setMessage('Statut mis à jour.');
    } catch (err) {
      setMessage(err.response?.data?.error || 'Erreur lors de la mise à jour');
    }
  };

  if (loading) return <div className="p-4">Chargement...</div>;
  if (!commande) return <div className="p-4">Commande introuvable.</div>;

  return (
    <div className="p-4 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">{commande.numero_commande}</h1>
      <div className="rounded border p-4 bg-white">
        <div><strong>Modèle:</strong> {commande.modele}</div>
        <div><strong>Pointure:</strong> {commande.pointure}</div>
        <div><strong>Couleur:</strong> {commande.couleur}</div>
        <div><strong>Matière:</strong> {commande.matiere}</div>
        <div><strong>Semelle:</strong> {commande.semelle}</div>
        <div><strong>Quantité:</strong> {commande.quantite}</div>
        <div><strong>Statut:</strong> {commande.statut}</div>
        <div><strong>Date création:</strong> {commande.date_creation}</div>
        {commande.observations && <div><strong>Observations:</strong> {commande.observations}</div>}
      </div>

      {user?.role === 'cordonnier' && (
        <div className="space-x-2">
          {commande.statut !== 'en_fabrication' && (
            <button onClick={() => changeStatus('en_fabrication')} className="bg-blue-600 text-white px-3 py-2 rounded">Commencer fabrication</button>
          )}
          {commande.statut !== 'prete' && (
            <button onClick={() => changeStatus('prete')} className="bg-green-600 text-white px-3 py-2 rounded">Marquer prête</button>
          )}
        </div>
      )}

      {user?.role === 'revendeur' && (
        <div className="space-x-2">
          {commande.statut !== 'annulee' && (
            <button onClick={() => changeStatus('annulee')} className="bg-red-600 text-white px-3 py-2 rounded">Annuler</button>
          )}
        </div>
      )}

      {message && <div className="text-sm text-indigo-700">{message}</div>}
    </div>
  );
}
