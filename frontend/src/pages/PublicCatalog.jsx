import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import Brand from '../components/Brand';
import api from '../api/client';

const emptyCustomer = { civilite: '', nom_client: '', telephone: '', note: '' };

function rememberedCustomerKey(catalogToken) {
  return `ehe_catalog_customer:${catalogToken}`;
}

function readRememberedCustomer(catalogToken) {
  try {
    const remembered = JSON.parse(localStorage.getItem(rememberedCustomerKey(catalogToken)));
    if (remembered?.civilite && remembered?.nom_client && remembered?.telephone) {
      return { ...emptyCustomer, ...remembered };
    }
  } catch {
    return null;
  }
  return null;
}

function forgetRememberedCustomer(catalogToken) {
  try {
    localStorage.removeItem(rememberedCustomerKey(catalogToken));
  } catch {
    return;
  }
}

function cartLineKey(model, variant) {
  return `${model.id}:${variant?.id || variant?.couleur || 'custom'}`;
}

export default function PublicCatalog() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const clientToken = searchParams.get('client') || '';
  const [catalog, setCatalog] = useState(null);
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(emptyCustomer);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [customerRecognized, setCustomerRecognized] = useState(false);
  const [activeClientToken, setActiveClientToken] = useState(clientToken);
  const [personalLinkNotice, setPersonalLinkNotice] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [challengeAnswer, setChallengeAnswer] = useState('');
  const [challengeLoading, setChallengeLoading] = useState(true);
  const [website, setWebsite] = useState('');

  const loadChallenge = useCallback(async () => {
    setChallengeLoading(true);
    try {
      const response = await api.get(`/catalogue-public/${token}/challenge`);
      setChallenge(response.data.challenge);
      setChallengeAnswer('');
    } catch (requestError) {
      setChallenge(null);
      setError(requestError.response?.data?.error || 'Impossible de préparer la vérification anti-robot.');
    } finally {
      setChallengeLoading(false);
    }
  }, [token]);

  useEffect(() => {
    setLoading(true);
    setCatalog(null);
    setError('');
    api.get(`/catalogue-public/${token}`)
      .then((response) => setCatalog(response.data.catalogue))
      .catch((requestError) => setError(requestError.response?.data?.error || 'Impossible d’ouvrir ce catalogue.'))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    loadChallenge();
  }, [loadChallenge]);

  useEffect(() => {
    setActiveClientToken(clientToken);
    setPersonalLinkNotice('');
    const rememberedCustomer = readRememberedCustomer(token);
    if (rememberedCustomer) {
      setCustomer(rememberedCustomer);
      setCustomerRecognized(true);
    }

    if (!clientToken) return;
    api.get(`/catalogue-public/${token}/clients/${clientToken}`)
      .then((response) => {
        setCustomer({ ...emptyCustomer, ...response.data.client });
        setCustomerRecognized(true);
      })
      .catch(() => {
        setActiveClientToken('');
        setPersonalLinkNotice('Ce lien personnel a expiré. Vous pouvez toujours remplir vos coordonnées et utiliser le catalogue public.');
      });
  }, [clientToken, token]);

  const filteredModels = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase('fr');
    if (!normalizedSearch) return catalog?.modeles || [];
    return (catalog?.modeles || []).filter((model) => [
      model.nom,
      model.reference,
      model.description,
      ...(model.couleurs || []).map((variant) => variant.couleur)
    ].filter(Boolean).join(' ').toLocaleLowerCase('fr').includes(normalizedSearch));
  }, [catalog?.modeles, search]);

  const totalPairs = cart.reduce((total, item) => total + Number(item.quantite || 0), 0);

  function addToCart(model, variant = null) {
    const key = cartLineKey(model, variant);
    setCart((current) => current.some((item) => item.key === key)
      ? current
      : [...current, {
        key,
        modele: model,
        variant,
        modele_stock_couleur_id: variant?.id || null,
        quantite: 1,
        pointure: '',
        couleur: variant?.couleur || ''
      }]);
  }

  function updateCart(lineKey, field, value) {
    setCart((current) => current.map((item) => item.key === lineKey ? { ...item, [field]: value } : item));
  }

  async function submitSelection(event) {
    event.preventDefault();
    if (cart.length === 0) {
      setError('Ajoutez au moins un modèle au panier.');
      return;
    }
    if (!challenge || !challengeAnswer) {
      setError('Répondez à la vérification anti-robot.');
      return;
    }

    setSending(true);
    setError('');
    try {
      await api.post(`/catalogue-public/${token}/demandes`, {
        ...customer,
        client_token: activeClientToken || null,
        challenge_id: challenge.id,
        challenge_answer: challengeAnswer,
        website,
        articles: cart.map((item) => ({
          modele_stock_id: item.modele.id,
          modele_stock_couleur_id: item.modele_stock_couleur_id,
          quantite: Number(item.quantite),
          pointure: item.pointure,
          couleur: item.couleur
        }))
      });
      try {
        localStorage.setItem(rememberedCustomerKey(token), JSON.stringify({
          civilite: customer.civilite,
          nom_client: customer.nom_client.trim(),
          telephone: customer.telephone.trim()
        }));
      } catch {}
      setCustomerRecognized(true);
      setSent(true);
      setCart([]);
      await loadChallenge();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (requestError) {
      setError(requestError.response?.data?.error || 'Impossible d’envoyer votre sélection.');
      await loadChallenge();
    } finally {
      setSending(false);
    }
  }

  if (loading) {
    return <div className="public-catalog-state"><span className="loader-ring" /><p>Ouverture du catalogue EHE…</p></div>;
  }

  if (!catalog) {
    return <div className="public-catalog-state"><Brand /><h1>Catalogue indisponible</h1><p>{error}</p></div>;
  }

  return (
    <div className="public-catalog-page">
      <header className="public-catalog-header">
        <Brand inverse />
        <div>
          <span>Catalogue de modèles</span>
          <strong>{totalPairs} paire{totalPairs > 1 ? 's' : ''} dans votre panier</strong>
        </div>
      </header>

      <main className="public-catalog-main">
        <section className="public-catalog-hero">
          <div>
            <span className="eyebrow">Choisissez votre style</span>
            <h1>Votre prochaine paire commence ici.</h1>
            <p>Parcourez les modèles EHE, choisissez une ou plusieurs couleurs, puis envoyez votre sélection. EHE vous contactera pour confirmer les détails.</p>
          </div>
          <div className="public-catalog-steps">
            <span><b>1</b> Choisissez</span>
            <span><b>2</b> Personnalisez</span>
            <span><b>3</b> Envoyez</span>
          </div>
        </section>

        {sent && (
          <section className="public-catalog-success" role="status">
            <span>✓</span>
            <div><h2>Votre sélection a bien été envoyée.</h2><p>EHE vous contactera sur WhatsApp ou par téléphone pour confirmer la commande.</p></div>
          </section>
        )}

        <div className="public-catalog-layout">
          <section className="public-catalog-products">
            <div className="public-catalog-toolbar">
              <div><h2>Modèles disponibles</h2><p>{catalog.modeles.length} modèle{catalog.modeles.length > 1 ? 's' : ''} dans la galerie</p></div>
              <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un modèle…" aria-label="Rechercher un modèle" />
            </div>

            <div className="public-catalog-grid">
              {filteredModels.length === 0 && <div className="public-catalog-empty">Aucun modèle ne correspond à votre recherche.</div>}
              {filteredModels.map((model) => {
                const selected = cart.some((item) => item.modele.id === model.id);
                return (
                  <article className={`public-product-card${selected ? ' selected' : ''}`} key={model.id}>
                    <div className="public-product-photo"><img src={model.photo_url} alt={model.nom} />{selected && <span>Dans le panier</span>}</div>
                    <div className="public-product-body">
                      <div><h3>{model.nom}</h3>{model.reference && <small>{model.reference}</small>}</div>
                      <p>{model.description || 'Un modèle EHE à personnaliser selon vos envies.'}</p>
                      {model.couleurs?.length > 0 ? (
                        <div className="public-product-variants">
                          <span>Choisissez une couleur</span>
                          {model.couleurs.map((variant) => {
                            const lineKey = cartLineKey(model, variant);
                            const inCart = cart.some((item) => item.key === lineKey);
                            const unavailable = Number(variant.quantite) <= 0;
                            return (
                              <button type="button" key={variant.id || variant.couleur} onClick={() => addToCart(model, variant)} disabled={inCart || unavailable}>
                                <img src={variant.photo_url || model.photo_url} alt="" />
                                <span><strong>{variant.couleur}</strong><small>{unavailable ? 'Indisponible' : `${variant.quantite} paire${Number(variant.quantite) > 1 ? 's' : ''} disponible${Number(variant.quantite) > 1 ? 's' : ''}`}</small></span>
                                <b>{inCart ? 'Ajoutée' : unavailable ? 'Épuisée' : 'Ajouter'}</b>
                              </button>
                            );
                          })}
                        </div>
                      ) : (
                        <button type="button" onClick={() => addToCart(model)} disabled={selected}>{selected ? 'Ajouté au panier' : 'Ajouter au panier'}</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="public-cart-card">
            <div className="public-cart-heading"><div><span>Votre sélection</span><h2>Panier</h2></div><strong>{totalPairs}</strong></div>
            {cart.length === 0 ? (
              <div className="public-cart-empty"><span>◇</span><p>Choisissez une ou plusieurs couleurs pour commencer.</p></div>
            ) : (
              <form onSubmit={submitSelection}>
                <div className="public-cart-lines">
                  {cart.map((item) => (
                    <article className="public-cart-line" key={item.key}>
                      <img src={item.variant?.photo_url || item.modele.photo_url} alt="" />
                      <div className="public-cart-line-copy">
                        <div><strong>{item.modele.nom}</strong><button type="button" onClick={() => setCart((current) => current.filter((line) => line.key !== item.key))}>Retirer</button></div>
                        {item.couleur && <span className="public-cart-variant-label">{item.couleur}</span>}
                        <div className="public-cart-fields">
                          <label>Pointure <small>Facultatif</small><input value={item.pointure} onChange={(event) => updateCart(item.key, 'pointure', event.target.value)} placeholder="Ex. 42" maxLength="40" /></label>
                          <label>Quantité<input type="number" min="1" max={item.variant?.quantite || 20} value={item.quantite} onChange={(event) => updateCart(item.key, 'quantite', event.target.value)} required /></label>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="public-customer-fields">
                  <h3>Vos coordonnées</h3>
                  {personalLinkNotice && <p className="public-personal-link-notice">{personalLinkNotice}</p>}
                  {customerRecognized && (
                    <div className="public-customer-recognized">
                      <span>✓ Coordonnées reconnues</span>
                      <button type="button" onClick={() => {
                        forgetRememberedCustomer(token);
                        setCustomer(emptyCustomer);
                        setCustomerRecognized(false);
                        setActiveClientToken('');
                      }}>Ce n’est pas moi</button>
                    </div>
                  )}
                  <label>Civilité
                    <select value={customer.civilite} onChange={(event) => setCustomer({ ...customer, civilite: event.target.value })} required>
                      <option value="">Choisir</option>
                      <option value="Mr">Mr</option>
                      <option value="Mme">Mme</option>
                    </select>
                  </label>
                  <label>Nom complet<input value={customer.nom_client} onChange={(event) => setCustomer({ ...customer, nom_client: event.target.value })} maxLength="120" required /></label>
                  <label>Numéro de téléphone / WhatsApp<input type="tel" inputMode="tel" value={customer.telephone} onChange={(event) => setCustomer({ ...customer, telephone: event.target.value })} maxLength="30" required /></label>
                  <label>Message <small>Facultatif</small><textarea value={customer.note} onChange={(event) => setCustomer({ ...customer, note: event.target.value })} maxLength="1000" placeholder="Une précision sur votre sélection…" /></label>
                  <label className="public-robot-check">Vérification anti-robot
                    <span>{challengeLoading ? 'Préparation…' : challenge ? `Combien font ${challenge.question} ?` : 'Vérification indisponible'}</span>
                    <input type="number" inputMode="numeric" value={challengeAnswer} onChange={(event) => setChallengeAnswer(event.target.value)} disabled={!challenge || challengeLoading} required />
                  </label>
                  <label className="catalogue-honeypot" aria-hidden="true">Site web
                    <input value={website} onChange={(event) => setWebsite(event.target.value)} tabIndex="-1" autoComplete="off" />
                  </label>
                </div>

                {error && <p className="public-catalog-error">{error}</p>}
                <button className="public-cart-submit" disabled={sending || challengeLoading || !challenge}>{sending ? 'Envoi en cours…' : `Envoyer ma sélection · ${totalPairs} paire${totalPairs > 1 ? 's' : ''}`}</button>
                <small className="public-cart-notice">Cette sélection est une demande. La commande sera confirmée avec EHE.</small>
              </form>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
