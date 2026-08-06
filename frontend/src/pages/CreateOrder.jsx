import { useState } from 'react';
import api from '../api/client';

export default function CreateOrder() {
  const [form, setForm] = useState({
    client_id: '',
    modele: '',
    pointure: '',
    couleur: '',
    matiere: '',
    semelle: '',
    quantite: '1',
    date_souhaitee: '',
    observations: ''
  });
  const [message, setMessage] = useState('');

  const handleChange = (event) => {
    setForm({ ...form, [event.target.name]: event.target.value });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      const response = await api.post('/commandes', { ...form, quantite: Number(form.quantite) });
      setMessage(`Commande créée : ${response.data.commande.numero_commande}`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Erreur lors de la création.');
    }
  };

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Nouvelle commande</h1>
      <form className="space-y-3" onSubmit={handleSubmit}>
        <input name="client_id" value={form.client_id} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="ID client" required />
        <input name="modele" value={form.modele} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Modèle" required />
        <input name="pointure" value={form.pointure} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Pointure" required />
        <input name="couleur" value={form.couleur} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Couleur" required />
        <input name="matiere" value={form.matiere} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Matière" required />
        <input name="semelle" value={form.semelle} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Semelle" required />
        <input type="number" name="quantite" min="1" value={form.quantite} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Quantité" />
        <input type="date" name="date_souhaitee" value={form.date_souhaitee} onChange={handleChange} className="w-full rounded border px-3 py-2" />
        <textarea name="observations" value={form.observations} onChange={handleChange} className="w-full rounded border px-3 py-2" placeholder="Observations" />
        <button className="bg-blue-600 text-white rounded px-4 py-2">Créer la commande</button>
      </form>
      {message && <div className="mt-4 text-sm">{message}</div>}
    </div>
  );
}
