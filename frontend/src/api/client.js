import { isSupabaseConfigured, supabase } from './supabase';

function apiError(error, fallback) {
  const message = error?.message || fallback;
  const requestError = new Error(message);
  requestError.response = {
    status: error?.status || 400,
    data: { error: message }
  };
  return requestError;
}

function ensureConfigured() {
  if (!isSupabaseConfigured) {
    throw apiError(null, 'Supabase n’est pas encore configuré.');
  }
}

async function profileForUser(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, nom, email, role, is_active, created_at')
    .eq('id', userId)
    .single();

  if (error) throw apiError(error, 'Profil utilisateur introuvable.');
  if (!data.is_active) throw apiError(null, 'Ce compte est désactivé.');
  return data;
}

function formatCommande(commande) {
  return {
    ...commande,
    client_civilite: commande.client?.civilite,
    client_nom: commande.client?.nom,
    client_telephone: commande.client?.telephone,
    cordonnier_nom: commande.cordonnier?.nom,
    revendeur_nom: commande.revendeur?.nom
  };
}

const commandeSelection = `
  *,
  client:clients!commandes_client_id_fkey(civilite, nom, telephone),
  revendeur:profiles!commandes_revendeur_id_fkey(nom),
  cordonnier:profiles!commandes_cordonnier_id_fkey(nom)
`;

const stockModelSelection = `
  id, revendeur_id, nom, reference, description, photo_path, file_name, is_active, created_at, updated_at,
  couleurs:modele_stock_couleurs(id, couleur, position, quantite, photo_path, file_name)
`;

async function getCommande(commandeId) {
  const { data, error } = await supabase
    .from('commandes')
    .select(commandeSelection)
    .eq('id', Number(commandeId))
    .single();

  if (error) throw apiError(error, 'Commande introuvable.');
  return formatCommande(data);
}

async function signedPhoto(photo) {
  if (/^https?:\/\//.test(photo.storage_path)) return photo;

  const { data, error } = await supabase.storage
    .from('commande-photos')
    .createSignedUrl(photo.storage_path, 3600);

  if (error) throw apiError(error, 'Impossible d’ouvrir une photo.');
  return { ...photo, storage_key: photo.storage_path, storage_path: data.signedUrl };
}

function parseColors(value) {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      candidate = [];
    }
  }

  if (!Array.isArray(candidate)) return [];
  const seen = new Set();
  return candidate
    .map((variant) => {
      const source = typeof variant === 'string' ? { couleur: variant } : (variant || {});
      const couleur = String(source.couleur || '').trim();
      const quantity = Number(source.quantite);
      return {
        id: source.id ? Number(source.id) : undefined,
        couleur,
        quantite: Number.isFinite(quantity) ? Math.max(0, Math.floor(quantity)) : 1
      };
    })
    .filter((variant) => {
      const normalized = variant.couleur.toLocaleLowerCase('fr');
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .slice(0, 30);
}

function normalizeModelColors(model) {
  return (model.couleurs || [])
    .map((color) => ({
      ...color,
      couleur: String(color.couleur || '').trim(),
      quantite: Math.max(Number(color.quantite) || 0, 0)
    }))
    .filter((color) => color.couleur)
    .sort((first, second) => (first.position || 0) - (second.position || 0) || first.couleur.localeCompare(second.couleur, 'fr'));
}

async function signedColorVariant(color) {
  if (!color.photo_path) return { ...color, photo_url: '' };
  const { data, error } = await supabase.storage
    .from('modele-photos')
    .createSignedUrl(color.photo_path, 3600);

  if (error) return { ...color, photo_url: '' };
  return { ...color, photo_url: data.signedUrl };
}

async function signedStockModel(model) {
  const { data, error } = await supabase.storage
    .from('modele-photos')
    .createSignedUrl(model.photo_path, 3600);

  if (error) throw apiError(error, 'Impossible d’ouvrir la photo du modèle.');
  const colors = await Promise.all(normalizeModelColors(model).map(signedColorVariant));
  return { ...model, couleurs: colors, photo_url: data.signedUrl };
}

function publicStockModel(model) {
  const { data } = supabase.storage.from('modele-photos').getPublicUrl(model.photo_path);
  const colors = normalizeModelColors(model).map((color) => ({
    ...color,
    photo_url: color.photo_path
      ? supabase.storage.from('modele-photos').getPublicUrl(color.photo_path).data.publicUrl
      : ''
  }));
  return { ...model, couleurs: colors, photo_url: data.publicUrl };
}

async function formatOrderArticle(article) {
  if (!article.modele_stock) return article;
  return { ...article, modele_stock: await signedStockModel(article.modele_stock) };
}

async function get(path, options = {}) {
  ensureConfigured();
  const params = options.params || {};

  if (path === '/auth/me') {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw apiError(error, 'Session expirée.');
    return { data: { user: await profileForUser(data.user.id) } };
  }

  if (path === '/auth/users') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nom, email, role, is_active, created_at')
      .order('nom');
    if (error) throw apiError(error, 'Impossible de charger les utilisateurs.');
    return { data: { users: data } };
  }

  if (path === '/auth/cordonniers') {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, nom, email, role')
      .eq('role', 'cordonnier')
      .eq('is_active', true)
      .order('nom');
    if (error) throw apiError(error, 'Impossible de charger les cordonniers.');
    return { data: { cordonniers: data } };
  }

  if (path === '/clients') {
    const { data, error } = await supabase.from('clients').select('*').order('created_at', { ascending: false });
    if (error) throw apiError(error, 'Impossible de charger les clients.');
    const search = String(params.q || '').trim().toLocaleLowerCase('fr');
    const clients = search
      ? data.filter((client) => `${client.nom} ${client.telephone || ''}`.toLocaleLowerCase('fr').includes(search))
      : data;
    return { data: { clients } };
  }

  if (path === '/modeles-stock/next-reference') {
    const { data, error } = await supabase.rpc('get_next_modele_stock_reference');
    if (error) throw apiError(error, 'Impossible de calculer le prochain numéro du stock.');
    return { data: { reference: data } };
  }

  if (path === '/modeles-stock') {
    let query = supabase
      .from('modeles_stock')
      .select(stockModelSelection)
      .order('created_at', { ascending: false });
    if (params.active === true) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw apiError(error, 'Impossible de charger la galerie de modèles.');
    return { data: { modeles: await Promise.all(data.map(signedStockModel)) } };
  }

  if (path === '/catalogue-link') {
    const { data, error } = await supabase.rpc('get_or_create_catalogue_token');
    if (error) throw apiError(error, 'Impossible de créer le lien du catalogue.');
    return { data: { token: data } };
  }

  const publicCatalogMatch = path.match(/^\/catalogue-public\/([0-9a-f-]+)$/i);
  if (publicCatalogMatch) {
    const { data, error } = await supabase.rpc('get_catalogue_public', { p_token: publicCatalogMatch[1] });
    if (error) throw apiError(error, 'Impossible de charger ce catalogue.');
    if (!data) throw apiError(null, 'Ce lien de catalogue est invalide ou désactivé.');
    return { data: { catalogue: { ...data, modeles: (data.modeles || []).map(publicStockModel) } } };
  }

  const publicCatalogClientMatch = path.match(/^\/catalogue-public\/([0-9a-f-]+)\/clients\/([0-9a-f-]+)$/i);
  if (publicCatalogClientMatch) {
    const { data, error } = await supabase.rpc('get_catalogue_client', {
      p_catalogue_token: publicCatalogClientMatch[1],
      p_client_token: publicCatalogClientMatch[2]
    });
    if (error) throw apiError(error, 'Impossible de reconnaître ce client.');
    if (!data) throw apiError(null, 'Ce lien client est invalide.');
    return { data: { client: data } };
  }

  const publicCatalogChallengeMatch = path.match(/^\/catalogue-public\/([0-9a-f-]+)\/challenge$/i);
  if (publicCatalogChallengeMatch) {
    const { data, error } = await supabase.rpc('create_catalogue_challenge', {
      p_catalogue_token: publicCatalogChallengeMatch[1]
    });
    if (error) throw apiError(error, 'Impossible de préparer la vérification anti-robot.');
    return { data: { challenge: data } };
  }

  const clientPortalMatch = path.match(/^\/client-portal\/([0-9a-f-]+)$/i);
  if (clientPortalMatch) {
    const { data, error } = await supabase.rpc('get_client_portal', {
      p_client_token: clientPortalMatch[1]
    });
    if (error) throw apiError(error, 'Impossible d’ouvrir votre suivi.');
    if (!data) throw apiError(null, 'Ce lien client est invalide ou expiré.');
    return { data: { portal: data } };
  }

  if (path === '/demandes-catalogue') {
    const { data, error } = await supabase
      .from('demandes_catalogue')
      .select('id, revendeur_id, client_id, civilite, nom_client, telephone, note, statut, commande_id, created_at, updated_at, articles:demande_catalogue_articles(id, modele_stock_id, quantite, pointure, couleur, position, modele:modeles_stock(id, nom, reference, description, photo_path, file_name, couleurs:modele_stock_couleurs(id, couleur, position)))')
      .order('created_at', { ascending: false });
    if (error) throw apiError(error, 'Impossible de charger les demandes du catalogue.');
    const requests = await Promise.all(data.map(async (request) => ({
      ...request,
      articles: await Promise.all((request.articles || [])
        .sort((first, second) => first.position - second.position)
        .map(async (article) => ({ ...article, modele: article.modele ? await signedStockModel(article.modele) : null })))
    })));
    return { data: { demandes: requests } };
  }

  const catalogRequestMatch = path.match(/^\/demandes-catalogue\/(\d+)$/);
  if (catalogRequestMatch) {
    const { data, error } = await supabase
      .from('demandes_catalogue')
      .select('id, revendeur_id, client_id, civilite, nom_client, telephone, note, statut, commande_id, created_at, updated_at, articles:demande_catalogue_articles(id, modele_stock_id, quantite, pointure, couleur, position, modele:modeles_stock(id, nom, reference, description, photo_path, file_name, couleurs:modele_stock_couleurs(id, couleur, position)))')
      .eq('id', Number(catalogRequestMatch[1]))
      .single();
    if (error) throw apiError(error, 'Demande de catalogue introuvable.');
    const request = {
      ...data,
      articles: await Promise.all((data.articles || [])
        .sort((first, second) => first.position - second.position)
        .map(async (article) => ({ ...article, modele: article.modele ? await signedStockModel(article.modele) : null })))
    };
    return { data: { demande: request } };
  }

  const clientHistoryMatch = path.match(/^\/clients\/(\d+)\/commandes$/);
  if (clientHistoryMatch) {
    const { data, error } = await supabase
      .from('commandes')
      .select('id, numero_commande, statut, date_creation, modele')
      .eq('client_id', Number(clientHistoryMatch[1]))
      .order('date_creation', { ascending: false });
    if (error) throw apiError(error, 'Impossible de charger l’historique du client.');
    return { data: { commandes: data } };
  }

  if (path === '/commandes') {
    let query = supabase
      .from('commandes')
      .select(commandeSelection)
      .order('date_creation', { ascending: false });

    if (params.numero_commande) query = query.ilike('numero_commande', `%${params.numero_commande}%`);
    if (params.statut) query = query.eq('statut', params.statut);
    if (params.date_debut) query = query.gte('date_creation', `${params.date_debut}T00:00:00`);
    if (params.date_fin) query = query.lte('date_creation', `${params.date_fin}T23:59:59`);

    const { data, error } = await query;
    if (error) throw apiError(error, 'Impossible de charger les commandes.');
    return { data: { commandes: data.map(formatCommande) } };
  }

  if (path === '/messages') {
    const { data, error } = await supabase
      .from('commande_messages')
      .select('id, commande_id, auteur_id, auteur_nom, auteur_role, contenu, created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw apiError(error, 'Impossible de charger la messagerie.');
    return { data: { messages: data } };
  }

  if (path === '/comptabilite') {
    const { data, error } = await supabase
      .from('commande_comptabilite')
      .select('commande_id, revendeur_id, prix_cordonnier, prix_vente, benefice, created_at, updated_at')
      .order('updated_at', { ascending: false });
    if (error) throw apiError(error, 'Impossible de charger la comptabilité.');
    return { data: { comptabilite: data } };
  }

  if (path === '/paiements') {
    const { data, error } = await supabase
      .from('commande_paiements')
      .select('id, commande_id, revendeur_id, montant, mode_paiement, reference, note, date_paiement, created_at')
      .order('date_paiement', { ascending: false });
    if (error) throw apiError(error, 'Impossible de charger les paiements.');
    return { data: { paiements: data } };
  }

  if (path === '/articles-comptabilite') {
    const [{ data: articles, error: articlesError }, { data: entries, error: entriesError }] = await Promise.all([
      supabase
        .from('commande_articles')
        .select('id, commande_id, modele, pointure, couleur, quantite, position')
        .order('commande_id')
        .order('position'),
      supabase
        .from('commande_article_comptabilite')
        .select('article_id, commande_id, prix_cordonnier_unitaire, prix_vente_unitaire, benefice_unitaire, updated_at')
    ]);
    if (articlesError || entriesError) throw apiError(articlesError || entriesError, 'Impossible de charger le détail comptable.');
    const entriesByArticle = new Map(entries.map((entry) => [entry.article_id, entry]));
    return {
      data: {
        articles: articles.map((article) => ({
          ...article,
          comptabilite: entriesByArticle.get(article.id) || null
        }))
      }
    };
  }

  const historyMatch = path.match(/^\/commandes\/(\d+)\/history$/);
  if (historyMatch) {
    const { data, error } = await supabase
      .from('commande_statuts')
      .select('id, statut, commentaire, created_at, utilisateur:profiles!commande_statuts_user_id_fkey(nom)')
      .eq('commande_id', Number(historyMatch[1]))
      .order('created_at');
    if (error) throw apiError(error, 'Impossible de charger l’historique.');
    return { data: { history: data } };
  }

  const messagesMatch = path.match(/^\/commandes\/(\d+)\/messages$/);
  if (messagesMatch) {
    const { data, error } = await supabase
      .from('commande_messages')
      .select('id, commande_id, auteur_id, auteur_nom, auteur_role, contenu, created_at')
      .eq('commande_id', Number(messagesMatch[1]))
      .order('created_at');
    if (error) throw apiError(error, 'Impossible de charger la conversation.');
    return { data: { messages: data } };
  }

  const articlesMatch = path.match(/^\/commandes\/(\d+)\/articles$/);
  if (articlesMatch) {
    const { data, error } = await supabase
      .from('commande_articles')
      .select('id, commande_id, modele_stock_id, modele, pointure, couleur, matiere, semelle, quantite, position, modele_stock:modeles_stock(id, nom, reference, photo_path, file_name, couleurs:modele_stock_couleurs(id, couleur, position))')
      .eq('commande_id', Number(articlesMatch[1]))
      .order('position');
    if (error) throw apiError(error, 'Impossible de charger les articles de la commande.');
    return { data: { articles: await Promise.all(data.map(formatOrderArticle)) } };
  }

  const commandeMatch = path.match(/^\/commandes\/(\d+)$/);
  if (commandeMatch) {
    return { data: { commande: await getCommande(commandeMatch[1]) } };
  }

  if (path === '/photos') {
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .eq('commande_id', Number(params.commande_id))
      .order('created_at');
    if (error) throw apiError(error, 'Impossible de charger les photos.');
    const photos = await Promise.all(data.map(signedPhoto));

    if (!photos.some((photo) => photo.type_photo === 'modele')) {
      const { data: order, error: orderError } = await supabase
        .from('commandes')
        .select('modele_stock_id')
        .eq('id', Number(params.commande_id))
        .single();
      if (orderError) throw apiError(orderError, 'Impossible de retrouver le modèle de la commande.');

      if (order.modele_stock_id) {
        const { data: stockModel, error: modelError } = await supabase
          .from('modeles_stock')
          .select('id, nom, photo_path, file_name')
          .eq('id', order.modele_stock_id)
          .single();
        if (modelError) throw apiError(modelError, 'Impossible de charger le modèle du stock.');
        const signedModel = await signedStockModel(stockModel);
        photos.unshift({
          id: `stock-${signedModel.id}`,
          commande_id: Number(params.commande_id),
          type_photo: 'modele',
          storage_path: signedModel.photo_url,
          file_name: signedModel.file_name,
          source: 'stock'
        });
      }
    }

    return { data: { photos } };
  }

  if (path === '/notifications') {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw apiError(error, 'Impossible de charger les notifications.');
    return { data: { notifications: data } };
  }

  if (path === '/dashboard') {
    const { data, error } = await supabase.from('commandes').select('statut');
    if (error) throw apiError(error, 'Impossible de charger le tableau de bord.');
    const summary = {
      total: data.length,
      en_attente: 0,
      en_fabrication: 0,
      prete: 0,
      livree: 0,
      annulee: 0
    };
    data.forEach((commande) => {
      summary[commande.statut] += 1;
    });
    return { data: { summary } };
  }

  throw apiError(null, `Route non prise en charge : ${path}`);
}

async function post(path, body) {
  ensureConfigured();

  if (path === '/auth/login') {
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password) throw apiError(null, 'Saisissez votre email et votre mot de passe.');

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) throw apiError(error, 'Email ou mot de passe incorrect.');

    const user = await profileForUser(data.user.id);
    return {
      data: {
        token: data.session?.access_token || '',
        user
      }
    };
  }

  if (path === '/auth/register') {
    const nom = String(body?.nom || '').trim();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!nom || !email || password.length < 8) {
      throw apiError(null, 'Renseignez votre nom, un email valide et un mot de passe de 8 caractères minimum.');
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nom } }
    });
    if (error || !data.user) throw apiError(error, 'Impossible de créer ce compte.');

    if (!data.session) {
      return { data: { requiresEmailConfirmation: true } };
    }

    const user = await profileForUser(data.user.id);
    return {
      data: {
        requiresEmailConfirmation: false,
        token: data.session.access_token,
        user
      }
    };
  }

  if (path === '/modeles-stock') {
    const file = body.get('file');
    const nom = String(body.get('nom') || '').trim();
    const description = String(body.get('description') || '').trim();
    const couleurs = parseColors(body.get('couleurs'));
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw apiError(authError, 'Session expirée.');
    if (!file || !nom) throw apiError(null, 'Le nom et la photo du modèle sont obligatoires.');

    const uploadedPaths = [];
    const uploadModelPhoto = async (photoFile, prefix = '') => {
      if (!photoFile || !photoFile.size) return null;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(photoFile.type)) {
        throw apiError(null, 'Les photos doivent être au format JPG, PNG ou WebP.');
      }
      if (photoFile.size > 5242880) throw apiError(null, 'Chaque photo ne doit pas dépasser 5 Mo.');
      const safeName = photoFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storagePath = `${authData.user.id}/${prefix}${crypto.randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage.from('modele-photos').upload(storagePath, photoFile, {
        cacheControl: '3600',
        contentType: photoFile.type,
        upsert: false
      });
      if (uploadError) throw apiError(uploadError, 'Impossible d’envoyer une photo du modèle.');
      uploadedPaths.push(storagePath);
      return storagePath;
    };

    let storagePath;
    try {
      storagePath = await uploadModelPhoto(file);
      const colorRows = [];
      for (let index = 0; index < couleurs.length; index += 1) {
        const colorFile = body.get(`couleur_photo_${index}`);
        const photoPath = await uploadModelPhoto(colorFile, 'couleurs/');
        colorRows.push({
          couleur: couleurs[index].couleur,
          quantite: couleurs[index].quantite,
          position: index + 1,
          photo_path: photoPath,
          file_name: colorFile?.name || null
        });
      }

      const { data, error } = await supabase.from('modeles_stock').insert({
        nom,
        reference: null,
        description: description || null,
        photo_path: storagePath,
        file_name: file.name
      }).select('id').single();
      if (error) throw apiError(error, 'Impossible d’enregistrer ce modèle.');

      if (colorRows.length > 0) {
        const { error: colorsError } = await supabase.from('modele_stock_couleurs').insert(
          colorRows.map((row) => ({ ...row, modele_stock_id: data.id }))
        );
        if (colorsError) throw apiError(colorsError, 'Le modèle a été créé, mais ses variantes n’ont pas pu être enregistrées.');
      }

      const { data: fullModel, error: fullModelError } = await supabase
        .from('modeles_stock')
        .select(stockModelSelection)
        .eq('id', data.id)
        .single();
      if (fullModelError) throw apiError(fullModelError, 'Le modèle a été créé, mais il ne peut pas être rechargé.');
      return { data: { modele: await signedStockModel(fullModel) } };
    } catch (requestError) {
      if (uploadedPaths.length > 0) await supabase.storage.from('modele-photos').remove(uploadedPaths);
      throw requestError;
    }
  }

  if (path === '/client-portal/delivery') {
    const { data, error } = await supabase.rpc('save_client_delivery', {
      p_client_token: body.client_token,
      p_commande_id: Number(body.commande_id),
      p_nom_reception: body.nom_reception,
      p_telephone: body.telephone,
      p_adresse: body.adresse,
      p_ville: body.ville,
      p_instructions: body.instructions || null
    });
    if (error) throw apiError(error, 'Impossible d’enregistrer les informations de livraison.');
    return { data };
  }

  const publicCatalogRequestMatch = path.match(/^\/catalogue-public\/([0-9a-f-]+)\/demandes$/i);
  if (publicCatalogRequestMatch) {
    const { data, error } = await supabase.rpc('submit_demande_catalogue_v3', {
      p_token: publicCatalogRequestMatch[1],
      p_client_token: body.client_token || null,
      p_civilite: body.civilite,
      p_nom_client: body.nom_client,
      p_telephone: body.telephone,
      p_note: body.note || null,
      p_articles: body.articles,
      p_challenge_id: body.challenge_id,
      p_challenge_answer: body.challenge_answer === '' ? null : Number(body.challenge_answer),
      p_website: body.website || null
    });
    if (error) throw apiError(error, 'Impossible d’envoyer votre sélection.');
    if (!data?.ok) throw apiError({ message: data?.error }, 'Impossible d’envoyer votre sélection.');
    return { data: { demande_id: data.demande_id } };
  }

  const clientCatalogLinkMatch = path.match(/^\/clients\/(\d+)\/catalogue-link$/);
  if (clientCatalogLinkMatch) {
    const { data, error } = await supabase.rpc('renew_client_catalogue_link', {
      p_client_id: Number(clientCatalogLinkMatch[1])
    });
    if (error) throw apiError(error, 'Impossible de renouveler le lien personnel.');
    return { data };
  }

  if (path === '/catalogue-link/rotate') {
    const { data, error } = await supabase.rpc('rotate_catalogue_token');
    if (error) throw apiError(error, 'Impossible de renouveler le lien du catalogue.');
    return { data: { token: data } };
  }

  if (path === '/commandes') {
    const articles = (body.articles || []).map((article) => ({
      modele_stock_id: article.modele_stock_id ? Number(article.modele_stock_id) : null,
      modele: article.modele,
      pointure: article.pointure,
      couleur: article.couleur,
      matiere: article.matiere,
      semelle: article.semelle,
      quantite: Number(article.quantite)
    }));
    const { data, error } = await supabase.rpc('create_commande_multi', {
      p_client_id: Number(body.client_id),
      p_cordonnier_id: body.cordonnier_id,
      p_date_souhaitee: body.date_souhaitee || null,
      p_observations: body.observations || null,
      p_articles: articles
    });
    if (error) throw apiError(error, 'Impossible de créer la commande.');
    return { data: { commande: data } };
  }

  const messageMatch = path.match(/^\/commandes\/(\d+)\/messages$/);
  if (messageMatch) {
    const { data, error } = await supabase
      .from('commande_messages')
      .insert({
        commande_id: Number(messageMatch[1]),
        contenu: body.contenu
      })
      .select('id, commande_id, auteur_id, auteur_nom, auteur_role, contenu, created_at')
      .single();
    if (error) throw apiError(error, 'Impossible d’envoyer le message.');
    return { data: { message: data } };
  }

  const accountingMatch = path.match(/^\/commandes\/(\d+)\/comptabilite$/);
  if (accountingMatch) {
    const { data, error } = await supabase
      .from('commande_comptabilite')
      .upsert({
        commande_id: Number(accountingMatch[1]),
        prix_cordonnier: Number(body.prix_cordonnier),
        prix_vente: Number(body.prix_vente)
      }, { onConflict: 'commande_id' })
      .select('commande_id, revendeur_id, prix_cordonnier, prix_vente, benefice, created_at, updated_at')
      .single();
    if (error) throw apiError(error, 'Impossible d’enregistrer les montants de cette commande.');
    return { data: { comptabilite: data } };
  }

  const itemAccountingMatch = path.match(/^\/commandes\/(\d+)\/comptabilite-lignes$/);
  if (itemAccountingMatch) {
    const commandeId = Number(itemAccountingMatch[1]);
    const { data: accounting, error } = await supabase.rpc('save_commande_article_comptabilite', {
      p_commande_id: commandeId,
      p_lignes: body.lignes
    });
    if (error) throw apiError(error, 'Impossible d’enregistrer les montants de cette commande.');

    const { data: lines, error: linesError } = await supabase
      .from('commande_article_comptabilite')
      .select('article_id, commande_id, prix_cordonnier_unitaire, prix_vente_unitaire, benefice_unitaire, updated_at')
      .eq('commande_id', commandeId);
    if (linesError) throw apiError(linesError, 'Montants enregistrés, mais leur détail ne peut pas être rechargé.');
    return { data: { comptabilite: accounting, lignes: lines } };
  }

  const paymentMatch = path.match(/^\/commandes\/(\d+)\/paiements$/);
  if (paymentMatch) {
    const { data, error } = await supabase.rpc('save_commande_paiement', {
      p_commande_id: Number(paymentMatch[1]),
      p_montant: Number(body.montant),
      p_mode_paiement: body.mode_paiement,
      p_reference: body.reference || null,
      p_note: body.note || null,
      p_date_paiement: body.date_paiement ? new Date(body.date_paiement + 'T12:00:00').toISOString() : new Date().toISOString()
    });
    if (error) throw apiError(error, 'Impossible d’enregistrer ce paiement.');
    return { data: { paiement: data } };
  }

  if (path === '/upload') {
    const commandeId = body.get('commande_id');
    const file = body.get('file');
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${commandeId}/${crypto.randomUUID()}-${safeName}`;
    const { error } = await supabase.storage.from('commande-photos').upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (error) throw apiError(error, 'Impossible d’envoyer la photo.');
    return { data: { file: { url: storagePath, name: file.name } } };
  }

  if (path === '/photos') {
    const { data, error } = await supabase.from('photos').insert({
      commande_id: Number(body.commande_id),
      type_photo: body.type_photo,
      storage_path: body.storage_path,
      file_name: body.file_name
    }).select().single();
    if (error) throw apiError(error, 'Impossible d’enregistrer la photo.');
    return { data: { photo: data } };
  }

  throw apiError(null, `Route non prise en charge : ${path}`);
}

async function patch(path, body = {}) {
  ensureConfigured();

  const userMatch = path.match(/^\/auth\/users\/([0-9a-f-]+)$/i);
  if (userMatch) {
    const { data, error } = await supabase.functions.invoke('update-user', {
      body: { ...body, userId: userMatch[1] }
    });
    if (error || data?.error) throw apiError(error || { message: data.error }, 'Impossible de modifier ce compte.');
    return { data };
  }

  const clientMatch = path.match(/^\/clients\/(\d+)$/);
  if (clientMatch) {
    const { data, error } = await supabase
      .from('clients')
      .update({ civilite: body.civilite, nom: String(body.nom || '').trim(), telephone: String(body.telephone || '').trim() })
      .eq('id', Number(clientMatch[1]))
      .select()
      .single();
    if (error) throw apiError(error, 'Impossible de modifier ce client.');
    return { data: { client: data } };
  }

  const stockModelDetailsMatch = path.match(/^\/modeles-stock\/(\d+)$/);
  if (stockModelDetailsMatch) {
    const modelId = Number(stockModelDetailsMatch[1]);
    const isMultipart = typeof FormData !== 'undefined' && body instanceof FormData;
    const nom = String(isMultipart ? body.get('nom') : body.nom || '').trim();
    const description = String(isMultipart ? body.get('description') : body.description || '').trim();
    const rawColors = isMultipart ? body.get('couleurs') : body.couleurs;
    const hasColors = isMultipart ? body.has('couleurs') : Object.prototype.hasOwnProperty.call(body, 'couleurs');
    const couleurs = parseColors(rawColors);
    const file = isMultipart ? body.get('file') : null;

    if (!nom) throw apiError(null, 'Le nom du modèle est obligatoire.');

    const [{ data: currentModel, error: modelError }, { data: authData, error: authError }] = await Promise.all([
      supabase.from('modeles_stock').select('photo_path').eq('id', modelId).single(),
      supabase.auth.getUser()
    ]);
    if (modelError) throw apiError(modelError, 'Modèle introuvable.');
    if (authError || !authData.user) throw apiError(authError, 'Session expirée.');

    const { data: currentColors, error: colorsLoadError } = await supabase
      .from('modele_stock_couleurs')
      .select('id, photo_path, file_name')
      .eq('modele_stock_id', modelId);
    if (colorsLoadError) throw apiError(colorsLoadError, 'Impossible de charger les variantes du modèle.');

    const changes = { nom, description: description || null };
    const uploadedPaths = [];
    let uploadedPhotoPath = null;

    try {
      if (file && file.size > 0) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
          throw apiError(null, 'La nouvelle photo doit être au format JPG, PNG ou WebP.');
        }
        if (file.size > 5242880) throw apiError(null, 'La nouvelle photo ne doit pas dépasser 5 Mo.');
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
        uploadedPhotoPath = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
        const { error: uploadError } = await supabase.storage.from('modele-photos').upload(uploadedPhotoPath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false
        });
        if (uploadError) throw apiError(uploadError, 'Impossible d’envoyer la nouvelle photo.');
        uploadedPaths.push(uploadedPhotoPath);
        changes.photo_path = uploadedPhotoPath;
        changes.file_name = file.name;
      }

      const { data, error } = await supabase
        .from('modeles_stock')
        .update(changes)
        .eq('id', modelId)
        .select()
        .single();
      if (error) throw apiError(error, 'Impossible de modifier ce modèle.');

      if (hasColors) {
        const colorRows = [];
        const currentById = new Map(currentColors.map((color) => [Number(color.id), color]));
        for (let index = 0; index < couleurs.length; index += 1) {
          const variant = couleurs[index];
          const previous = variant.id ? currentById.get(Number(variant.id)) : null;
          const colorFile = isMultipart ? body.get(`couleur_photo_${index}`) : null;
          let photoPath = previous?.photo_path || null;
          let fileName = previous?.file_name || null;

          if (colorFile && colorFile.size > 0) {
            if (!['image/jpeg', 'image/png', 'image/webp'].includes(colorFile.type)) {
              throw apiError(null, 'Les photos de variantes doivent être au format JPG, PNG ou WebP.');
            }
            if (colorFile.size > 5242880) throw apiError(null, 'Chaque photo de variante ne doit pas dépasser 5 Mo.');
            const safeName = colorFile.name.replace(/[^a-zA-Z0-9._-]/g, '-');
            photoPath = `${authData.user.id}/couleurs/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage.from('modele-photos').upload(photoPath, colorFile, {
              cacheControl: '3600',
              contentType: colorFile.type,
              upsert: false
            });
            if (uploadError) throw apiError(uploadError, 'Impossible d’envoyer la photo de cette variante.');
            uploadedPaths.push(photoPath);
            fileName = colorFile.name;
          }

          const row = {
            modele_stock_id: modelId,
            couleur: variant.couleur,
            quantite: variant.quantite,
            position: index + 1,
            photo_path: photoPath,
            file_name: fileName
          };
          if (previous) row.id = previous.id;
          colorRows.push(row);
        }

        const { error: upsertColorsError } = colorRows.length > 0
          ? await supabase.from('modele_stock_couleurs').upsert(colorRows, { onConflict: 'id' })
          : { error: null };
        if (upsertColorsError) throw apiError(upsertColorsError, 'Impossible d’enregistrer les variantes du modèle.');

        const keepIds = new Set(colorRows.filter((row) => row.id).map((row) => Number(row.id)));
        const removedColors = currentColors.filter((color) => !keepIds.has(Number(color.id)));
        if (removedColors.length > 0) {
          const { error: deleteColorsError } = await supabase
            .from('modele_stock_couleurs')
            .delete()
            .in('id', removedColors.map((color) => color.id));
          if (deleteColorsError) throw apiError(deleteColorsError, 'Impossible de supprimer une variante du modèle.');
        }

        const oldPathsToRemove = [
          ...(uploadedPhotoPath && currentModel.photo_path ? [currentModel.photo_path] : []),
          ...currentColors
            .filter((color) => {
              const next = colorRows.find((row) => Number(row.id) === Number(color.id));
              return color.photo_path && (!next || next.photo_path !== color.photo_path);
            })
            .map((color) => color.photo_path)
        ];
        if (oldPathsToRemove.length > 0) {
          await supabase.storage.from('modele-photos').remove([...new Set(oldPathsToRemove)]);
        }
      } else if (uploadedPhotoPath && currentModel.photo_path) {
        await supabase.storage.from('modele-photos').remove([currentModel.photo_path]);
      }

      const { data: fullModel, error: fullModelError } = await supabase
        .from('modeles_stock')
        .select(stockModelSelection)
        .eq('id', modelId)
        .single();
      if (fullModelError) throw apiError(fullModelError, 'Le modèle a été modifié, mais il ne peut pas être rechargé.');

      return { data: { modele: await signedStockModel(fullModel) } };
    } catch (requestError) {
      if (uploadedPaths.length > 0) await supabase.storage.from('modele-photos').remove(uploadedPaths);
      throw requestError;
    }
  }

  const catalogRequestMatch = path.match(/^\/demandes-catalogue\/(\d+)$/);
  if (catalogRequestMatch) {
    const changes = {};
    if (body.statut) changes.statut = body.statut;
    if (body.commande_id !== undefined) changes.commande_id = body.commande_id || null;
    const { data, error } = await supabase
      .from('demandes_catalogue')
      .update(changes)
      .eq('id', Number(catalogRequestMatch[1]))
      .select('id, statut, commande_id, updated_at')
      .single();
    if (error) throw apiError(error, 'Impossible de mettre à jour cette demande.');
    return { data: { demande: data } };
  }

  const commandeMatch = path.match(/^\/commandes\/(\d+)$/);
  if (commandeMatch) {
    const { error } = await supabase.rpc('update_commande_details', {
      p_commande_id: Number(commandeMatch[1]),
      p_details: body
    });
    if (error) throw apiError(error, 'Impossible de corriger cette commande.');
    return { data: { commande: await getCommande(commandeMatch[1]) } };
  }

  const stockModelMatch = path.match(/^\/modeles-stock\/(\d+)\/status$/);
  if (stockModelMatch) {
    const { data, error } = await supabase
      .from('modeles_stock')
      .update({ is_active: Boolean(body.is_active) })
      .eq('id', Number(stockModelMatch[1]))
      .select()
      .single();
    if (error) throw apiError(error, 'Impossible de modifier ce modèle.');
    return { data: { modele: await signedStockModel(data) } };
  }

  const statusMatch = path.match(/^\/commandes\/(\d+)\/status$/);
  if (statusMatch) {
    const { error } = await supabase.rpc('change_commande_status', {
      p_commande_id: Number(statusMatch[1]),
      p_nouveau_statut: body.statut
    });
    if (error) throw apiError(error, 'Cette mise à jour est impossible.');
    return { data: { commande: await getCommande(statusMatch[1]) } };
  }

  const notificationMatch = path.match(/^\/notifications\/(\d+)\/read$/);
  if (notificationMatch) {
    const { data, error } = await supabase
      .from('notifications')
      .update({ lu: true })
      .eq('id', Number(notificationMatch[1]))
      .select()
      .single();
    if (error) throw apiError(error, 'Impossible de marquer la notification comme lue.');
    return { data: { notification: data } };
  }

  throw apiError(null, `Route non prise en charge : ${path}`);
}

async function remove(path) {
  ensureConfigured();

  const paymentMatch = path.match(/^\/paiements\/(\d+)$/);
  if (paymentMatch) {
    const { error } = await supabase.rpc('delete_commande_paiement', { p_paiement_id: Number(paymentMatch[1]) });
    if (error) throw apiError(error, 'Impossible de supprimer ce paiement.');
    return { data: { deleted: true } };
  }

  const commandeMatch = path.match(/^\/commandes\/(\d+)$/);
  if (commandeMatch) {
    const commandeId = Number(commandeMatch[1]);
    const { data: photos, error: photosError } = await supabase
      .from('photos')
      .select('storage_path')
      .eq('commande_id', commandeId);
    if (photosError) throw apiError(photosError, 'Impossible de préparer la suppression de cette commande.');

    const storagePaths = photos
      .map((photo) => photo.storage_path)
      .filter((storagePath) => storagePath && !/^https?:\/\//i.test(storagePath));

    if (storagePaths.length > 0) {
      const { error: storageError } = await supabase.storage.from('commande-photos').remove(storagePaths);
      if (storageError) throw apiError(storageError, 'Impossible de supprimer les photos de cette commande.');
    }

    const { error } = await supabase.rpc('delete_commande', { p_commande_id: commandeId });
    if (error) throw apiError(error, 'Impossible de supprimer cette commande.');
    return { data: { deleted: true } };
  }

  throw apiError(null, `Route non prise en charge : ${path}`);
}

const api = {
  get,
  post,
  patch,
  delete: remove,
  async logout() {
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }
};

export default api;
