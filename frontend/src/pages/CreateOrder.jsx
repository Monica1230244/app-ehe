import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';

const emptyForm = {
  client_id: '',
  cordonnier_id: '',
  modele: '',
  pointure: '',
  couleur: '',
  matiere: '',
  semelle: '',
  quantite: '1',
  date_souhaitee: '',
  observations: ''
};

export default function CreateOrder() {
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyForm);
  const [photos, setPhotos] = useState({ modele: null, pied_gauche: null, pied_droit: null });
  const [clients, setClients] = useState([]);
  const [cordonniers, setCordonnier] = useState([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadFormData() {
      try {
        const [clientsResponse, cordonniersResponse] = await Promise.all([
          api.get('/clients'),
          api.get('/auth/cordonniers')
        ]);
        setClients(clientsResponse.data.clients);
        setCordonnier(cordonniersResponse.data.cordonniers);
      } catch (error) {
        setMessage(error.response?.data?.error || 'Impossible de charger les données du formulaire.');
      }
    }
    loadFormData();
  }, []);

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  async function uploadPhoto(commandeId, typePhoto, file) {
    const formData = new FormData();
    formData.append('commande_id', commandeId);
    formData.append('file', file);
    const uploadResponse = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
    await api.post('/photos', {
      commande_id: commandeId,
      type_photo: typePhoto,
      storage_path: uploadResponse.data.file.url,
      file_name: file.name
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!photos.modele) {
      setMessage('Ajoutez la photo du modèle. Les photos des pieds sont facultatives.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await api.post('/commandes', {
        ...form,
        cordonnier_id: form.cordonnier_id || null,
        quantite: Number(form.quantite)
      });
      const commande = response.data.commande;
      await Promise.all(Object.entries(photos)
        .filter(([, file]) => file)
        .map(([typePhoto, file]) => uploadPhoto(commande.id, typePhoto, file)));
      navigate(`/orders/${commande.id}`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de créer la commande.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-shell max-w-3xl">
      <div className="page-header"><div><h1>Nouvelle commande</h1><p>Renseignez le modèle et les mesures. Les photos des pieds sont facultatives.</p></div></div>
      <form className="mt-5 space-y-4 rounded-xl border bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium">Client
            <select name="client_id" className="rounded border px-3 py-2 font-normal" value={form.client_id} onChange={updateForm} required>
              <option value="">Sélectionner un client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.nom} — {client.telephone}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Cordonnier
            <select name="cordonnier_id" className="rounded border px-3 py-2 font-normal" value={form.cordonnier_id} onChange={updateForm} required>
              <option value="">Sélectionner un cordonnier</option>
              {cordonniers.map((cordonnier) => <option key={cordonnier.id} value={cordonnier.id}>{cordonnier.nom}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium">Modèle<input name="modele" className="rounded border px-3 py-2 font-normal" value={form.modele} onChange={updateForm} required /></label>
          <label className="grid gap-1 text-sm font-medium">Pointure<input name="pointure" className="rounded border px-3 py-2 font-normal" value={form.pointure} onChange={updateForm} required /></label>
          <label className="grid gap-1 text-sm font-medium">Couleur<input name="couleur" className="rounded border px-3 py-2 font-normal" value={form.couleur} onChange={updateForm} required /></label>
          <label className="grid gap-1 text-sm font-medium">Matière<input name="matiere" className="rounded border px-3 py-2 font-normal" value={form.matiere} onChange={updateForm} required /></label>
          <label className="grid gap-1 text-sm font-medium">Semelle<input name="semelle" className="rounded border px-3 py-2 font-normal" value={form.semelle} onChange={updateForm} required /></label>
          <label className="grid gap-1 text-sm font-medium">Quantité<input name="quantite" type="number" min="1" className="rounded border px-3 py-2 font-normal" value={form.quantite} onChange={updateForm} required /></label>
          <label className="grid gap-1 text-sm font-medium">Date souhaitée<input name="date_souhaitee" type="date" className="rounded border px-3 py-2 font-normal" value={form.date_souhaitee} onChange={updateForm} /></label>
        </div>
        <label className="grid gap-1 text-sm font-medium">Observations<textarea name="observations" className="rounded border px-3 py-2 font-normal" value={form.observations} onChange={updateForm} /></label>
        <div className="grid gap-4 md:grid-cols-3">
          {[['modele', 'Photo du modèle', true], ['pied_gauche', 'Photo du pied gauche', false], ['pied_droit', 'Photo du pied droit', false]].map(([key, label, required]) => (
            <label key={key} className="grid gap-1 text-sm font-medium">
              <span>{label}{!required && <small className="optional-field"> Facultative</small>}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="font-normal" onChange={(event) => setPhotos({ ...photos, [key]: event.target.files?.[0] || null })} required={required} />
            </label>
          ))}
        </div>
        <button disabled={isSubmitting} className="rounded bg-blue-700 px-4 py-2 font-medium text-white disabled:opacity-60">{isSubmitting ? 'Création en cours…' : 'Créer la commande'}</button>
      </form>
      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
    </div>
  );
}
