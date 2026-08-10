import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const emptyForm = { nom: '', reference: '', description: '' };

export default function Stock() {
  const [modeles, setModeles] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const fileInput = useRef(null);

  useEffect(() => {
    api.get('/modeles-stock')
      .then((response) => setModeles(response.data.modeles))
      .catch((requestError) => setMessage(requestError.response?.data?.error || 'Impossible de charger le stock.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!photo) {
      setPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(photo);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo]);

  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    return modeles.filter((modele) => {
      if (filter === 'active' && !modele.is_active) return false;
      if (filter === 'archived' && modele.is_active) return false;
      if (!normalizedSearch) return true;
      return [modele.nom, modele.reference, modele.description]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(normalizedSearch);
    });
  }, [filter, modeles, search]);

  const activeCount = modeles.filter((modele) => modele.is_active).length;

  async function submitModel(event) {
    event.preventDefault();
    if (!photo) {
      setMessage('Ajoutez une photo pour enregistrer ce modèle.');
      return;
    }

    setSaving(true);
    setMessage('');
    const payload = new FormData();
    payload.append('nom', form.nom);
    payload.append('reference', form.reference);
    payload.append('description', form.description);
    payload.append('file', photo);

    try {
      const response = await api.post('/modeles-stock', payload);
      setModeles((current) => [response.data.modele, ...current]);
      setForm(emptyForm);
      setPhoto(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Modèle ajouté à la galerie.');
    } catch (requestError) {
      setMessage(requestError.response?.data?.error || 'Impossible d’ajouter ce modèle.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleModel(modele) {
    setMessage('');
    try {
      const response = await api.patch(`/modeles-stock/${modele.id}/status`, { is_active: !modele.is_active });
      setModeles((current) => current.map((item) => item.id === modele.id ? response.data.modele : item));
      setMessage(response.data.modele.is_active ? 'Modèle remis dans la galerie.' : 'Modèle archivé.');
    } catch (requestError) {
      setMessage(requestError.response?.data?.error || 'Impossible de modifier ce modèle.');
    }
  }

  return (
    <div className="page-shell space-y-6">
      <div className="page-header">
        <div>
          <span className="eyebrow">Catalogue interne</span>
          <h1>Stock de modèles</h1>
          <p>Conservez vos modèles préférés et réutilisez-les rapidement dans les nouvelles commandes.</p>
        </div>
        <span className="stock-count"><strong>{activeCount}</strong> modèle{activeCount > 1 ? 's' : ''} disponible{activeCount > 1 ? 's' : ''}</span>
      </div>

      <section className="stock-create-card">
        <div className="stock-create-copy">
          <span className="stock-create-icon">＋</span>
          <div><h2>Ajouter un modèle</h2><p>Une seule photo suffit. Vous pourrez ensuite sélectionner ce modèle lors de chaque commande.</p></div>
        </div>
        <form className="stock-form" onSubmit={submitModel}>
          <label className="stock-photo-field">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} required />
            {preview ? <img src={preview} alt="Aperçu du nouveau modèle" /> : <span><strong>Ajouter la photo</strong><small>JPG, PNG ou WebP · 5 Mo maximum</small></span>}
          </label>
          <div className="stock-form-fields">
            <div className="stock-form-grid">
              <label>Nom du modèle<input value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} placeholder="Ex. Mocassin Élégance" maxLength="120" required /></label>
              <label>Référence <small>Facultative</small><input value={form.reference} onChange={(event) => setForm({ ...form, reference: event.target.value })} placeholder="Ex. EHE-001" maxLength="60" /></label>
            </div>
            <label>Description <small>Facultative</small><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Style, particularités ou recommandations…" maxLength="1000" /></label>
            <button type="submit" className="primary-button" disabled={saving}>{saving ? 'Enregistrement…' : 'Ajouter à la galerie'} <span>→</span></button>
          </div>
        </form>
      </section>

      <section className="stock-gallery-card">
        <div className="stock-gallery-toolbar">
          <div><h2>Galerie des modèles</h2><p>Sélectionnez un modèle pour créer une commande plus rapidement.</p></div>
          <div className="stock-gallery-controls">
            <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle" />
            <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filtrer les modèles">
              <option value="active">Modèles disponibles</option>
              <option value="archived">Modèles archivés</option>
              <option value="all">Tous les modèles</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="page-loader"><span className="loader-ring" /><p>Ouverture de la galerie…</p></div>
        ) : (
          <div className="stock-grid">
            {filteredModels.length === 0 && <div className="stock-empty"><span>◇</span><strong>Aucun modèle dans cette sélection</strong><p>Ajoutez une photo pour commencer votre galerie.</p></div>}
            {filteredModels.map((modele) => (
              <article key={modele.id} className={`stock-model-card${modele.is_active ? '' : ' archived'}`}>
                <div className="stock-model-photo">
                  <img src={modele.photo_url} alt={modele.nom} />
                  <span>{modele.is_active ? 'Disponible' : 'Archivé'}</span>
                </div>
                <div className="stock-model-body">
                  <div><h3>{modele.nom}</h3>{modele.reference && <small>{modele.reference}</small>}</div>
                  <p>{modele.description || 'Aucune description ajoutée.'}</p>
                  <div className="stock-model-actions">
                    {modele.is_active && <Link className="stock-use-button" to={`/create-order?modele=${modele.id}`}>Utiliser pour une commande</Link>}
                    <button type="button" onClick={() => toggleModel(modele)}>{modele.is_active ? 'Archiver' : 'Réactiver'}</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {message && <p className="stock-feedback" role="status">{message}</p>}
    </div>
  );
}
