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
    client_nom: commande.client?.nom,
    client_telephone: commande.client?.telephone,
    cordonnier_nom: commande.cordonnier?.nom,
    revendeur_nom: commande.revendeur?.nom
  };
}

const commandeSelection = `
  *,
  client:clients!commandes_client_id_fkey(nom, telephone),
  revendeur:profiles!commandes_revendeur_id_fkey(nom),
  cordonnier:profiles!commandes_cordonnier_id_fkey(nom)
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

async function signedStockModel(model) {
  const { data, error } = await supabase.storage
    .from('modele-photos')
    .createSignedUrl(model.photo_path, 3600);

  if (error) throw apiError(error, 'Impossible d’ouvrir la photo du modèle.');
  return { ...model, photo_url: data.signedUrl };
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

  if (path === '/modeles-stock') {
    let query = supabase
      .from('modeles_stock')
      .select('id, revendeur_id, nom, reference, description, photo_path, file_name, is_active, created_at, updated_at')
      .order('created_at', { ascending: false });
    if (params.active === true) query = query.eq('is_active', true);

    const { data, error } = await query;
    if (error) throw apiError(error, 'Impossible de charger la galerie de modèles.');
    return { data: { modeles: await Promise.all(data.map(signedStockModel)) } };
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
      .select('id, commande_id, modele_stock_id, modele, pointure, couleur, matiere, semelle, quantite, position, modele_stock:modeles_stock(id, nom, reference, photo_path, file_name)')
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
    const { data, error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) throw apiError(error, 'Email ou mot de passe incorrect.');
    return { data: { token: data.session.access_token, user: await profileForUser(data.user.id) } };
  }

  if (path === '/auth/register') {
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { nom: body.nom, role: 'revendeur' },
        emailRedirectTo: `${window.location.origin}${window.location.pathname}`
      }
    });
    if (error) {
      const message = /already registered/i.test(error.message)
        ? 'Un compte existe déjà avec cette adresse email. Essayez de vous connecter.'
        : 'Impossible de créer le compte.';
      throw apiError({ ...error, message }, message);
    }
    if (data.user?.identities?.length === 0) {
      const message = 'Un compte existe déjà avec cette adresse email. Essayez de vous connecter.';
      throw apiError({ message }, message);
    }
    if (!data.session) {
      return { data: { requiresEmailConfirmation: true } };
    }
    return { data: { token: data.session.access_token, user: await profileForUser(data.user.id) } };
  }

  if (path === '/auth/users') {
    const { data, error } = await supabase.functions.invoke('create-user', { body });
    if (error || data?.error) throw apiError(error || { message: data.error }, 'Impossible de créer le compte.');
    return { data };
  }

  if (path === '/clients') {
    const { data, error } = await supabase.from('clients').insert({
      nom: body.nom,
      telephone: body.telephone
    }).select().single();
    if (error) throw apiError(error, 'Impossible d’enregistrer le client.');
    return { data: { client: data } };
  }

  if (path === '/modeles-stock') {
    const file = body.get('file');
    const nom = String(body.get('nom') || '').trim();
    const reference = String(body.get('reference') || '').trim();
    const description = String(body.get('description') || '').trim();
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw apiError(authError, 'Session expirée.');
    if (!file || !nom) throw apiError(null, 'Le nom et la photo du modèle sont obligatoires.');

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const storagePath = `${authData.user.id}/${crypto.randomUUID()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from('modele-photos').upload(storagePath, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (uploadError) throw apiError(uploadError, 'Impossible d’envoyer la photo du modèle.');

    const { data, error } = await supabase.from('modeles_stock').insert({
      nom,
      reference: reference || null,
      description: description || null,
      photo_path: storagePath,
      file_name: file.name
    }).select().single();
    if (error) {
      await supabase.storage.from('modele-photos').remove([storagePath]);
      throw apiError(error, 'Impossible d’enregistrer ce modèle.');
    }
    return { data: { modele: await signedStockModel(data) } };
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
      .update({ nom: String(body.nom || '').trim(), telephone: String(body.telephone || '').trim() })
      .eq('id', Number(clientMatch[1]))
      .select()
      .single();
    if (error) throw apiError(error, 'Impossible de modifier ce client.');
    return { data: { client: data } };
  }

  const stockModelDetailsMatch = path.match(/^\/modeles-stock\/(\d+)$/);
  if (stockModelDetailsMatch) {
    const { data, error } = await supabase
      .from('modeles_stock')
      .update({
        nom: String(body.nom || '').trim(),
        reference: String(body.reference || '').trim() || null,
        description: String(body.description || '').trim() || null
      })
      .eq('id', Number(stockModelDetailsMatch[1]))
      .select()
      .single();
    if (error) throw apiError(error, 'Impossible de modifier ce modèle.');
    return { data: { modele: await signedStockModel(data) } };
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

const api = {
  get,
  post,
  patch,
  async logout() {
    if (isSupabaseConfigured) await supabase.auth.signOut();
  }
};

export default api;
