import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/client';

const emptyForm = { nom: '', description: '', couleurs: [] };

function newVariant(values = {}) {
  return {
    key: crypto.randomUUID(),
    id: null,
    couleur: '',
    quantite: '1',
    photo: null,
    photo_url: '',
    file_name: '',
    ...values
  };
}

function VariantPhotoPreview({ variant, alt }) {
  const [preview, setPreview] = useState(variant.photo_url || '');

  useEffect(() => {
    if (!variant.photo) {
      setPreview(variant.photo_url || '');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(variant.photo);
    setPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [variant.photo, variant.photo_url]);

  return preview
    ? <img src={preview} alt={alt} />
    : <span className="stock-variant-photo-empty">Photo</span>;
}

function serializeVariants(variants) {
  return variants.map(({ id, couleur, quantite }) => ({
    ...(id ? { id } : {}),
    couleur: couleur.trim(),
    quantite: Math.max(Number(quantite) || 0, 0)
  }));
}

function appendVariantPhotos(payload, variants) {
  variants.forEach((variant, index) => {
    if (variant.photo) payload.append('couleur_photo_' + index, variant.photo);
  });
}

function ColorVariantEditor({ value, onChange, onMessage }) {
  const [draftColor, setDraftColor] = useState('');
  const [draftQuantity, setDraftQuantity] = useState('1');
  const [draftPhoto, setDraftPhoto] = useState(null);
  const draftPhotoInput = useRef(null);

  function updateVariant(key, changes) {
    onChange({
      ...value,
      couleurs: value.couleurs.map((variant) => variant.key === key ? { ...variant, ...changes } : variant)
    });
  }

  function addVariant() {
    const couleur = draftColor.trim();
    const quantite = Number(draftQuantity);
    if (!couleur) {
      onMessage('Indiquez le nom de la couleur.');
      return;
    }
    if (!Number.isInteger(quantite) || quantite < 0) {
      onMessage('La quantité doit être un nombre entier positif ou nul.');
      return;
    }
    if (!draftPhoto) {
      onMessage('Ajoutez une photo pour cette couleur.');
      return;
    }
    if (value.couleurs.some((variant) => variant.couleur.toLocaleLowerCase('fr') === couleur.toLocaleLowerCase('fr'))) {
      onMessage('Cette couleur existe déjà pour ce modèle.');
      return;
    }

    onChange({
      ...value,
      couleurs: [...value.couleurs, newVariant({ couleur, quantite: String(quantite), photo: draftPhoto })]
    });
    setDraftColor('');
    setDraftQuantity('1');
    setDraftPhoto(null);
    if (draftPhotoInput.current) draftPhotoInput.current.value = '';
    onMessage('');
  }

  return (
    <div className="stock-color-editor">
      <span className="stock-field-label">Variantes couleur <small>Photo et quantité par couleur</small></span>
      <div className="stock-color-add stock-variant-draft">
        <input value={draftColor} onChange={(event) => setDraftColor(event.target.value)} placeholder="Ex. Noir" maxLength="80" />
        <input className="stock-variant-quantity" type="number" min="0" step="1" value={draftQuantity} onChange={(event) => setDraftQuantity(event.target.value)} aria-label="Quantité de la couleur" />
        <label className="stock-variant-file">
          <input ref={draftPhotoInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setDraftPhoto(event.target.files?.[0] || null)} />
          {draftPhoto ? 'Photo choisie' : 'Choisir la photo'}
        </label>
        <button type="button" className="secondary-button" onClick={addVariant}>Ajouter</button>
      </div>
      <small className="stock-variant-hint">Chaque couleur doit avoir sa propre photo. La quantité peut être mise à zéro si elle est momentanément indisponible.</small>
      <div className="stock-variant-list">
        {value.couleurs.map((variant) => (
          <div className="stock-variant-row" key={variant.key}>
            <div className="stock-variant-photo"><VariantPhotoPreview variant={variant} alt={variant.couleur} /></div>
            <div className="stock-variant-details">
              <strong>{variant.couleur}</strong>
              <label>Quantité<input type="number" min="0" step="1" value={variant.quantite} onChange={(event) => updateVariant(variant.key, { quantite: event.target.value })} /></label>
              <small>{variant.photo?.name || variant.file_name || (variant.photo_url ? 'Photo enregistrée' : 'Photo manquante')}</small>
            </div>
            <label className="stock-variant-file stock-variant-replace">
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => updateVariant(variant.key, { photo: event.target.files?.[0] || null })} />
              Remplacer
            </label>
            <button type="button" className="stock-variant-remove" onClick={() => onChange({ ...value, couleurs: value.couleurs.filter((item) => item.key !== variant.key) })} aria-label={'Retirer la couleur ' + variant.couleur}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function buildModelGallery(modele) {
  return [
    { key: 'main', src: modele.photo_url, label: 'Photo principale', variantKey: null },
    ...(modele.couleurs || []).map((variant) => ({
      key: variant.id || variant.couleur,
      src: variant.photo_url || modele.photo_url,
      label: variant.couleur,
      variantKey: variant.id || variant.couleur
    }))
  ].filter((photo) => photo.src);
}

export default function Stock() {
  const [modeles, setModeles] = useState([]);
  const [nextReference, setNextReference] = useState('EHE-001');
  const [form, setForm] = useState(emptyForm);
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [editingModelId, setEditingModelId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm);
  const [editPhoto, setEditPhoto] = useState(null);
  const [editPreview, setEditPreview] = useState('');
  const [catalogueToken, setCatalogueToken] = useState('');
  const [sharing, setSharing] = useState(false);
  const [activePhoto, setActivePhoto] = useState(null);
  const fileInput = useRef(null);
  const editFileInput = useRef(null);

  useEffect(() => {
    api.get('/modeles-stock')
      .then((response) => setModeles(response.data.modeles))
      .catch((requestError) => setMessage(requestError.response?.data?.error || 'Impossible de charger le stock.'))
      .finally(() => setLoading(false));

    api.get('/modeles-stock/next-reference')
      .then((response) => setNextReference(response.data.reference))
      .catch(() => setNextReference('EHE-001'));

    api.get('/catalogue-link')
      .then((response) => setCatalogueToken(response.data.token))
      .catch(() => setCatalogueToken(''));
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

  useEffect(() => {
    if (!editPhoto) {
      setEditPreview('');
      return undefined;
    }
    const objectUrl = URL.createObjectURL(editPhoto);
    setEditPreview(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [editPhoto]);

  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    return modeles.filter((modele) => {
      if (filter === 'active' && !modele.is_active) return false;
      if (filter === 'archived' && modele.is_active) return false;
      if (!normalizedSearch) return true;
      return [modele.nom, modele.reference, modele.description, ...(modele.couleurs || []).map((variant) => variant.couleur)]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('fr')
        .includes(normalizedSearch);
    });
  }, [filter, modeles, search]);

  const activeCount = modeles.filter((modele) => modele.is_active).length;
  const catalogueLink = catalogueToken ? `${window.location.origin}${window.location.pathname}#/catalogue/${catalogueToken}` : '';

  const activeGalleryPhoto = activePhoto?.photos?.[activePhoto.index] || null;

  function openModelGallery(modele, variantKey = null) {
    const photos = buildModelGallery(modele);
    const selectedIndex = variantKey === null
      ? 0
      : Math.max(0, photos.findIndex((photo) => photo.variantKey === variantKey));
    setActivePhoto({ nom: modele.nom, photos, index: selectedIndex });
  }

  function changeActivePhoto(offset) {
    setActivePhoto((current) => {
      if (!current?.photos?.length) return current;
      const nextIndex = (current.index + offset + current.photos.length) % current.photos.length;
      return { ...current, index: nextIndex };
    });
  }


  async function copyCatalogueLink() {
    try {
      await navigator.clipboard.writeText(catalogueLink);
      setMessage('Lien du catalogue copié. Vous pouvez maintenant l’envoyer au client.');
    } catch {
      setMessage('Copiez manuellement le lien affiché.');
    }
  }

  async function rotateCatalogueLink() {
    setSharing(true);
    setMessage('');
    try {
      const response = await api.post('/catalogue-link/rotate', {});
      setCatalogueToken(response.data.token);
      setMessage('Nouveau lien créé. L’ancien lien ne fonctionne plus.');
    } catch (requestError) {
      setMessage(requestError.response?.data?.error || 'Impossible de renouveler le lien.');
    } finally {
      setSharing(false);
    }
  }

  function buildPayload(formData, mainPhoto) {
    const payload = new FormData();
    payload.append('nom', formData.nom);
    payload.append('description', formData.description);
    payload.append('couleurs', JSON.stringify(serializeVariants(formData.couleurs)));
    appendVariantPhotos(payload, formData.couleurs);
    if (mainPhoto) payload.append('file', mainPhoto);
    return payload;
  }

  async function submitModel(event) {
    event.preventDefault();
    if (!photo) {
      setMessage('Ajoutez une photo principale pour enregistrer ce modèle.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await api.post('/modeles-stock', buildPayload(form, photo));
      setModeles((current) => [response.data.modele, ...current]);
      api.get('/modeles-stock/next-reference')
        .then((nextResponse) => setNextReference(nextResponse.data.reference))
        .catch(() => undefined);
      setForm(emptyForm);
      setPhoto(null);
      if (fileInput.current) fileInput.current.value = '';
      setMessage('Modèle ajouté avec ses variantes couleur.');
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

  function startEditing(modele) {
    setEditingModelId(modele.id);
    setEditForm({
      nom: modele.nom,
      description: modele.description || '',
      couleurs: (modele.couleurs || []).map((variant) => newVariant({
        id: variant.id,
        couleur: variant.couleur,
        quantite: String(variant.quantite ?? 1),
        photo_url: variant.photo_url || '',
        file_name: variant.file_name || ''
      }))
    });
    setEditPhoto(null);
    if (editFileInput.current) editFileInput.current.value = '';
    setMessage('');
  }

  function cancelEditing() {
    setEditingModelId(null);
    setEditPhoto(null);
    setEditPreview('');
    if (editFileInput.current) editFileInput.current.value = '';
  }

  async function saveModel(event) {
    event.preventDefault();
    if (editForm.couleurs.some((variant) => !variant.id && !variant.photo && !variant.photo_url)) {
      setMessage('Ajoutez une photo à chaque nouvelle couleur avant d’enregistrer.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const response = await api.patch(`/modeles-stock/${editingModelId}`, buildPayload(editForm, editPhoto));
      setModeles((current) => current.map((modele) => modele.id === editingModelId ? response.data.modele : modele));
      cancelEditing();
      setMessage('Modèle et variantes corrigés avec succès.');
    } catch (requestError) {
      setMessage(requestError.response?.data?.error || 'Impossible de modifier ce modèle.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page-shell space-y-6">
      <div className="page-header">
        <div>
          <span className="eyebrow">Catalogue interne</span>
          <h1>Stock de modèles</h1>
          <p>Conservez un modèle avec plusieurs variantes couleur, chacune avec sa photo et sa quantité.</p>
        </div>
        <span className="stock-count"><strong>{activeCount}</strong> modèle{activeCount > 1 ? 's' : ''} disponible{activeCount > 1 ? 's' : ''}</span>
      </div>

      <section className="catalog-share-card">
        <div className="catalog-share-icon">↗</div>
        <div className="catalog-share-copy"><span>Catalogue client</span><h2>Partagez vos modèles sans donner accès à l’application</h2><p>Le client choisit ses modèles, ses couleurs et ses préférences au panier.</p></div>
        <div className="catalog-share-actions">
          <input value={catalogueLink} readOnly aria-label="Lien public du catalogue" />
          <button type="button" className="primary-button compact" onClick={copyCatalogueLink} disabled={!catalogueLink}>Copier le lien</button>
          <button type="button" className="secondary-button" onClick={rotateCatalogueLink} disabled={sharing}>{sharing ? 'Création…' : 'Créer un nouveau lien'}</button>
          <Link to="/catalog-requests">Voir les demandes reçues →</Link>
        </div>
      </section>

      <section className="stock-create-card">
        <div className="stock-create-copy">
          <span className="stock-create-icon">＋</span>
          <div><h2>Ajouter un modèle</h2><p>Ajoutez ensuite chaque couleur avec sa photo et son nombre de paires.</p></div>
        </div>
        <form className="stock-form" onSubmit={submitModel}>
          <label className="stock-photo-field">
            <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] || null)} required />
            {preview ? <img src={preview} alt="Aperçu du modèle" /> : <span><strong>Ajouter la photo principale</strong><small>JPG, PNG ou WebP · 5 Mo maximum</small></span>}
          </label>
          <div className="stock-form-fields">
            <div className="stock-form-grid">
              <label>Nom du modèle<input value={form.nom} onChange={(event) => setForm({ ...form, nom: event.target.value })} placeholder="Ex. Mocassin Élégance" maxLength="120" required /></label>
              <div className="stock-auto-reference"><span>Numérotation automatique</span><strong>{nextReference}</strong><small>Attribué par la base à l’enregistrement, sans doublon.</small></div>
            </div>
            <label>Description <small>Facultative</small><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Style, particularités ou recommandations…" maxLength="1000" /></label>
            <ColorVariantEditor value={form} onChange={setForm} onMessage={setMessage} />
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
                  <button type="button" className="stock-model-photo-button" onClick={() => openModelGallery(modele)} aria-label={`Agrandir la photo de ${modele.nom}`}>
                    <img src={modele.photo_url} alt={modele.nom} />
                    <span className="photo-thumb-zoom">Agrandir</span>
                  </button>
                  <span>{modele.is_active ? 'Disponible' : 'Archivé'}</span>
                </div>
                <div className="stock-model-body">
                  {editingModelId === modele.id ? (
                    <form className="stock-edit-form" onSubmit={saveModel}>
                      <label className="stock-edit-photo">
                        <input ref={editFileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setEditPhoto(event.target.files?.[0] || null)} />
                        <img src={editPreview || modele.photo_url} alt={'Aperçu de ' + modele.nom} />
                        <span><strong>Modifier la photo principale</strong><small>JPG, PNG ou WebP · 5 Mo maximum</small></span>
                      </label>
                      <input aria-label="Nom du modèle" value={editForm.nom} onChange={(event) => setEditForm({ ...editForm, nom: event.target.value })} maxLength="120" required />
                      <textarea aria-label="Description du modèle" value={editForm.description} onChange={(event) => setEditForm({ ...editForm, description: event.target.value })} maxLength="1000" placeholder="Description facultative" />
                      <ColorVariantEditor value={editForm} onChange={setEditForm} onMessage={setMessage} />
                      <div className="record-actions">
                        <button type="submit" className="primary-button compact" disabled={saving}>Enregistrer</button>
                        <button type="button" className="secondary-button" onClick={cancelEditing}>Annuler</button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <div><h3>{modele.nom}</h3>{modele.reference && <small>{modele.reference}</small>}</div>
                      <p>{modele.description || 'Aucune description ajoutée.'}</p>
                      {modele.couleurs?.length > 0 && (
                        <small className="stock-model-gallery-hint">Cliquez sur la photo principale pour voir toutes les couleurs.</small>
                      )}
                      <div className="stock-model-actions">
                        {modele.is_active && <Link className="stock-use-button" to={`/create-order?modele=${modele.id}`}>Utiliser pour une commande</Link>}
                        <button type="button" onClick={() => startEditing(modele)}>Corriger</button>
                        <button type="button" onClick={() => toggleModel(modele)}>{modele.is_active ? 'Archiver' : 'Réactiver'}</button>
                      </div>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      {message && <p className="stock-feedback" role="status">{message}</p>}
      {activePhoto && activeGalleryPhoto && (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={`Galerie de ${activePhoto.nom}`} onClick={() => setActivePhoto(null)}>
          <div className="photo-lightbox-content photo-gallery-lightbox" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="photo-lightbox-close" onClick={() => setActivePhoto(null)} aria-label="Fermer">×</button>
            <div className="photo-gallery-main">
              {activePhoto.photos.length > 1 && <button type="button" className="photo-gallery-nav" onClick={() => changeActivePhoto(-1)} aria-label="Photo précédente">‹</button>}
              <img src={activeGalleryPhoto.src} alt={`${activePhoto.nom} — ${activeGalleryPhoto.label}`} />
              {activePhoto.photos.length > 1 && <button type="button" className="photo-gallery-nav" onClick={() => changeActivePhoto(1)} aria-label="Photo suivante">›</button>}
            </div>
            <p>{activePhoto.nom} — {activeGalleryPhoto.label}</p>
            {activePhoto.photos.length > 1 && (
              <div className="photo-gallery-thumbnails" aria-label="Toutes les couleurs du modèle">
                {activePhoto.photos.map((photo, index) => (
                  <button type="button" className={index === activePhoto.index ? 'active' : ''} key={photo.key} onClick={() => setActivePhoto((current) => ({ ...current, index }))} aria-label={photo.label}>
                    <img src={photo.src} alt="" />
                    <span>{photo.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
