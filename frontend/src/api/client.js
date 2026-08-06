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
    cordonnier_nom: commande.cordonnier?.nom
  };
}

const commandeSelection = `
  *,
  client:clients!commandes_client_id_fkey(nom, telephone),
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
    return { data: { photos: await Promise.all(data.map(signedPhoto)) } };
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
      options: { data: { nom: body.nom, role: 'revendeur' } }
    });
    if (error) throw apiError(error, 'Impossible de créer le compte.');
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
      telephone: body.telephone,
      email: body.email || null,
      notes: body.notes || null
    }).select().single();
    if (error) throw apiError(error, 'Impossible d’enregistrer le client.');
    return { data: { client: data } };
  }

  if (path === '/commandes') {
    const { data, error } = await supabase.from('commandes').insert({
      client_id: Number(body.client_id),
      cordonnier_id: body.cordonnier_id || null,
      modele: body.modele,
      pointure: body.pointure,
      couleur: body.couleur,
      matiere: body.matiere,
      semelle: body.semelle,
      quantite: Number(body.quantite),
      date_souhaitee: body.date_souhaitee || null,
      observations: body.observations || null
    }).select().single();
    if (error) throw apiError(error, 'Impossible de créer la commande.');
    return { data: { commande: data } };
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
