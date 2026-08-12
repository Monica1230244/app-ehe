import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { sendPushForOrder } from '../services/pushNotifications';

const emptyForm = {
  client_id: '',
  cordonnier_id: '',
  date_souhaitee: '',
  observations: ''
};

function newArticle(values = {}) {
  return {
    key: crypto.randomUUID(),
    modele_stock_id: '',
    modele: '',
    pointure: '',
    couleur: '',
    matiere: '',
    semelle: '',
    quantite: '1',
    ...values
  };
}

export default function CreateOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [form, setForm] = useState(emptyForm);
  const [articles, setArticles] = useState(() => [newArticle()]);
  const [photos, setPhotos] = useState({ modele: null, pied_gauche: null, pied_droit: null });
  const [clients, setClients] = useState([]);
  const [cordonniers, setCordonniers] = useState([]);
  const [stockModels, setStockModels] = useState([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    async function loadFormData() {
      try {
        const [clientsResponse, cordonniersResponse, stockResponse] = await Promise.all([
          api.get('/clients'),
          api.get('/auth/cordonniers'),
          api.get('/modeles-stock', { params: { active: true } })
        ]);
        setClients(clientsResponse.data.clients);
        setCordonniers(cordonniersResponse.data.cordonniers);
        setStockModels(stockResponse.data.modeles);

        const requestedModelId = searchParams.get('modele');
        const requestedModel = stockResponse.data.modeles.find((model) => String(model.id) === requestedModelId);
        if (requestedModel) {
          setArticles([newArticle({ modele_stock_id: String(requestedModel.id), modele: requestedModel.nom })]);
        }
      } catch (error) {
        setMessage(error.response?.data?.error || 'Impossible de charger les données du formulaire.');
      }
    }
    loadFormData();
  }, [searchParams]);

  const totalQuantity = useMemo(
    () => articles.reduce((total, article) => total + Math.max(Number(article.quantite) || 0, 0), 0),
    [articles]
  );

  function updateForm(event) {
    setForm({ ...form, [event.target.name]: event.target.value });
  }

  function updateArticle(articleKey, field, value) {
    setArticles((current) => current.map((article) => article.key === articleKey ? { ...article, [field]: value } : article));
  }

  function selectStockModel(articleKey, modelId) {
    const selectedModel = stockModels.find((model) => String(model.id) === modelId);
    setArticles((current) => current.map((article) => article.key === articleKey ? {
      ...article,
      modele_stock_id: modelId,
      modele: selectedModel?.nom || ''
    } : article));
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
    if (articles.some((article) => !article.modele.trim() || !article.pointure.trim() || !article.couleur.trim() || !article.matiere.trim() || !article.semelle.trim() || Number(article.quantite) < 1)) {
      setMessage('Complétez toutes les informations de chaque ligne de la commande.');
      return;
    }

    setIsSubmitting(true);
    setMessage('');
    try {
      const response = await api.post('/commandes', {
        ...form,
        articles: articles.map(({ key, ...article }) => ({ ...article, quantite: Number(article.quantite) }))
      });
      const commande = response.data.commande;
      await Promise.all(Object.entries(photos)
        .filter(([, file]) => file)
        .map(([typePhoto, file]) => uploadPhoto(commande.id, typePhoto, file)));
      await sendPushForOrder(commande.id, 'order_created');
      navigate(`/orders/${commande.id}`);
    } catch (error) {
      setMessage(error.response?.data?.error || 'Impossible de créer la commande.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-shell max-w-4xl">
      <div className="page-header"><div><h1>Nouvelle commande</h1><p>Ajoutez une ligne pour chaque modèle, couleur ou pointure différente.</p></div></div>
      <form className="mt-5 space-y-4 rounded-xl border bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <section className="order-general-fields">
          <label>Client
            <select name="client_id" value={form.client_id} onChange={updateForm} required>
              <option value="">Sélectionner un client</option>
              {clients.map((client) => <option key={client.id} value={client.id}>{client.nom} — {client.telephone}</option>)}
            </select>
          </label>
          <label>Cordonnier
            <select name="cordonnier_id" value={form.cordonnier_id} onChange={updateForm} required>
              <option value="">Sélectionner un cordonnier</option>
              {cordonniers.map((cordonnier) => <option key={cordonnier.id} value={cordonnier.id}>{cordonnier.nom}</option>)}
            </select>
          </label>
          <label>Date souhaitée<input name="date_souhaitee" type="date" value={form.date_souhaitee} onChange={updateForm} /></label>
        </section>

        <section className="order-lines-section">
          <div className="order-lines-heading">
            <div><h2>Articles de la commande</h2><p>Une ligne correspond à une variante précise.</p></div>
            <span>{totalQuantity} paire{totalQuantity > 1 ? 's' : ''} au total</span>
          </div>

          <div className="order-lines-list">
            {articles.map((article, index) => {
              const selectedModel = stockModels.find((model) => String(model.id) === article.modele_stock_id);
              return (
                <article key={article.key} className="order-line-card">
                  <div className="order-line-title">
                    <strong>Ligne {index + 1}</strong>
                    {articles.length > 1 && <button type="button" onClick={() => setArticles((current) => current.filter((item) => item.key !== article.key))}>Supprimer</button>}
                  </div>
                  <div className="order-line-grid">
                    <label>Modèle de la galerie
                      <select value={article.modele_stock_id} onChange={(event) => selectStockModel(article.key, event.target.value)}>
                        <option value="">Nouveau modèle / saisie libre</option>
                        {stockModels.map((model) => <option key={model.id} value={model.id}>{model.nom}{model.reference ? ` — ${model.reference}` : ''}</option>)}
                      </select>
                    </label>
                    <label>Nom du modèle<input value={article.modele} onChange={(event) => updateArticle(article.key, 'modele', event.target.value)} readOnly={Boolean(article.modele_stock_id)} required /></label>
                    <label>Pointure<input value={article.pointure} onChange={(event) => updateArticle(article.key, 'pointure', event.target.value)} required /></label>
                    <label>Couleur<input value={article.couleur} onChange={(event) => updateArticle(article.key, 'couleur', event.target.value)} required /></label>
                    <label>Matière<input value={article.matiere} onChange={(event) => updateArticle(article.key, 'matiere', event.target.value)} required /></label>
                    <label>Semelle<input value={article.semelle} onChange={(event) => updateArticle(article.key, 'semelle', event.target.value)} required /></label>
                    <label>Nombre de paires<input type="number" min="1" value={article.quantite} onChange={(event) => updateArticle(article.key, 'quantite', event.target.value)} required /></label>
                  </div>
                  {selectedModel && <div className="order-line-model-preview"><img src={selectedModel.photo_url} alt="" /><span><strong>{selectedModel.nom}</strong><small>Modèle sélectionné dans la galerie</small></span></div>}
                </article>
              );
            })}
          </div>

          <button type="button" className="secondary-button order-add-line" onClick={() => setArticles((current) => [...current, newArticle()])}>＋ Ajouter une autre variante</button>
          <Link className="order-stock-link" to="/stock">Gérer la galerie de modèles →</Link>
        </section>

        <label className="grid gap-1 text-sm font-medium">Observations générales<textarea name="observations" className="rounded border px-3 py-2 font-normal" value={form.observations} onChange={updateForm} /></label>
        <div className="grid gap-4 md:grid-cols-3">
          {[['modele', 'Photo générale du modèle'], ['pied_gauche', 'Photo du pied gauche'], ['pied_droit', 'Photo du pied droit']].map(([key, label]) => (
            <label key={key} className="grid gap-1 text-sm font-medium">
              <span>{label}<small className="optional-field"> Facultative</small></span>
              <input type="file" accept="image/jpeg,image/png,image/webp" className="font-normal" onChange={(event) => setPhotos({ ...photos, [key]: event.target.files?.[0] || null })} />
            </label>
          ))}
        </div>
        <button disabled={isSubmitting} className="primary-button">{isSubmitting ? 'Création en cours…' : `Créer la commande · ${totalQuantity} paire${totalQuantity > 1 ? 's' : ''}`}</button>
      </form>
      {message && <p className="mt-4 text-sm text-red-700">{message}</p>}
    </div>
  );
}
