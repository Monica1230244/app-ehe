alter table public.modele_stock_couleurs
  add column if not exists photo_path text,
  add column if not exists file_name text,
  add column if not exists quantite integer not null default 1;

alter table public.modele_stock_couleurs
  alter column quantite set default 1;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.modele_stock_couleurs'::regclass
      and conname = 'modele_stock_couleurs_quantite_check'
  ) then
    alter table public.modele_stock_couleurs
      add constraint modele_stock_couleurs_quantite_check check (quantite >= 0);
  end if;
end;
$$;

create index if not exists idx_modele_stock_couleurs_photo
on public.modele_stock_couleurs(photo_path)
where photo_path is not null;

alter table public.demande_catalogue_articles
  add column if not exists modele_stock_couleur_id bigint
  references public.modele_stock_couleurs(id)
  on delete set null;

alter table public.demande_catalogue_articles
  drop constraint if exists demande_catalogue_articles_demande_id_modele_stock_id_key;

drop index if exists public.idx_demande_catalogue_articles_model_unique;

create unique index if not exists idx_demande_catalogue_articles_variant_unique
on public.demande_catalogue_articles (
  demande_id,
  modele_stock_id,
  coalesce(modele_stock_couleur_id, 0)
);

create or replace function public.can_access_modele_photo(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.modeles_stock
    where photo_path = p_storage_path
      and (
        revendeur_id = auth.uid()
        or public.current_user_role() = 'admin'
        or exists (
          select 1
          from public.commande_articles
          join public.commandes on commandes.id = commande_articles.commande_id
          where commande_articles.modele_stock_id = modeles_stock.id
            and commandes.cordonnier_id = auth.uid()
        )
      )
  )
  or exists (
    select 1
    from public.modele_stock_couleurs
    join public.modeles_stock on modeles_stock.id = modele_stock_couleurs.modele_stock_id
    where modele_stock_couleurs.photo_path = p_storage_path
      and (
        modeles_stock.revendeur_id = auth.uid()
        or public.current_user_role() = 'admin'
        or exists (
          select 1
          from public.commande_articles
          join public.commandes on commandes.id = commande_articles.commande_id
          where commande_articles.modele_stock_id = modeles_stock.id
            and commandes.cordonnier_id = auth.uid()
        )
      )
  );
$$;

revoke execute on function public.can_access_modele_photo(text) from public, anon;
grant execute on function public.can_access_modele_photo(text) to authenticated;

create or replace function public.get_catalogue_public(p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  catalog jsonb;
begin
  select revendeur_id into order_owner
  from public.catalogue_partages
  where token = p_token and actif = true;

  if order_owner is null then
    return null;
  end if;

  select jsonb_build_object(
    'entreprise', 'EHE',
    'modeles', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', modeles_stock.id,
          'nom', modeles_stock.nom,
          'reference', modeles_stock.reference,
          'description', modeles_stock.description,
          'photo_path', modeles_stock.photo_path,
          'couleurs', coalesce(
            (
              select jsonb_agg(
                jsonb_build_object(
                  'id', modele_stock_couleurs.id,
                  'couleur', modele_stock_couleurs.couleur,
                  'position', modele_stock_couleurs.position,
                  'photo_path', modele_stock_couleurs.photo_path,
                  'file_name', modele_stock_couleurs.file_name,
                  'quantite', modele_stock_couleurs.quantite
                )
                order by modele_stock_couleurs.position, modele_stock_couleurs.couleur
              )
              from public.modele_stock_couleurs
              where modele_stock_couleurs.modele_stock_id = modeles_stock.id
            ),
            '[]'::jsonb
          )
        ) order by modeles_stock.created_at desc
      ) filter (where modeles_stock.id is not null),
      '[]'::jsonb
    )
  ) into catalog
  from public.modeles_stock
  where revendeur_id = order_owner and is_active = true;

  return catalog;
end;
$$;

revoke execute on function public.get_catalogue_public(uuid) from public;
grant execute on function public.get_catalogue_public(uuid) to anon, authenticated;

create or replace function public.submit_demande_catalogue_v3(
  p_token uuid,
  p_client_token uuid,
  p_civilite text,
  p_nom_client text,
  p_telephone text,
  p_note text,
  p_articles jsonb,
  p_challenge_id uuid,
  p_challenge_answer integer,
  p_website text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  known_client_id bigint;
  created_request_id bigint;
  request_line jsonb;
  request_position bigint;
  model_id bigint;
  variant_id bigint;
  variant_color text;
  requested_quantity integer;
  line_count integer;
  normalized_phone text;
  request_source_key bigint;
  expected_challenge_answer integer;
begin
  select revendeur_id into order_owner
  from public.catalogue_partages
  where token = p_token and actif = true;

  if order_owner is null then
    return jsonb_build_object('ok', false, 'error', 'Ce lien de catalogue est invalide ou désactivé.');
  end if;

  if nullif(btrim(coalesce(p_website, '')), '') is not null then
    return jsonb_build_object('ok', false, 'error', 'La vérification anti-robot a échoué.');
  end if;

  if p_civilite is null or p_civilite not in ('Mr', 'Mme') then
    return jsonb_build_object('ok', false, 'error', 'Veuillez choisir Mr ou Mme.');
  end if;

  normalized_phone := regexp_replace(btrim(coalesce(p_telephone, '')), '[^0-9]', '', 'g');
  if char_length(btrim(coalesce(p_nom_client, ''))) < 2
    or char_length(btrim(coalesce(p_nom_client, ''))) > 120
    or char_length(normalized_phone) < 6
    or char_length(normalized_phone) > 20 then
    return jsonb_build_object('ok', false, 'error', 'Le nom et un numéro de téléphone valide sont obligatoires.');
  end if;

  if char_length(coalesce(p_note, '')) > 1000 then
    return jsonb_build_object('ok', false, 'error', 'Le message ne peut pas dépasser 1000 caractères.');
  end if;

  if p_client_token is not null then
    select id into known_client_id
    from public.clients
    where catalogue_token = p_client_token
      and revendeur_id = order_owner
      and catalogue_token_expires_at > now();

    if known_client_id is null then
      return jsonb_build_object('ok', false, 'error', 'Ce lien personnel a expiré. Utilisez le catalogue public ou demandez un nouveau lien à EHE.');
    end if;
  end if;

  if jsonb_typeof(p_articles) is distinct from 'array' then
    return jsonb_build_object('ok', false, 'error', 'Le panier est invalide.');
  end if;

  line_count := jsonb_array_length(p_articles);
  if line_count < 1 or line_count > 50 then
    return jsonb_build_object('ok', false, 'error', 'Le panier doit contenir entre 1 et 50 modèles.');
  end if;

  if (
    select count(distinct (
      case
        when nullif(value ->> 'modele_stock_couleur_id', '') is not null
          then 'variant:' || (value ->> 'modele_stock_couleur_id')
        else 'model:' || (value ->> 'modele_stock_id') || ':color:' || lower(btrim(coalesce(value ->> 'couleur', '')))
      end
    ))
    from jsonb_array_elements(p_articles)
  ) <> line_count then
    return jsonb_build_object('ok', false, 'error', 'Une même couleur ne peut apparaître qu’une fois dans le panier.');
  end if;

  for request_line, request_position in
    select value, ordinality
    from jsonb_array_elements(p_articles) with ordinality
  loop
    if coalesce(request_line ->> 'modele_stock_id', '') !~ '^[0-9]+$'
      or coalesce(request_line ->> 'quantite', '') !~ '^[0-9]+$' then
      return jsonb_build_object('ok', false, 'error', 'La ligne ' || request_position || ' du panier est invalide.');
    end if;

    model_id := (request_line ->> 'modele_stock_id')::bigint;
    variant_id := nullif(request_line ->> 'modele_stock_couleur_id', '')::bigint;
    requested_quantity := (request_line ->> 'quantite')::integer;

    if requested_quantity < 1 or requested_quantity > 20 then
      return jsonb_build_object('ok', false, 'error', 'La quantité de la ligne ' || request_position || ' est invalide.');
    end if;

    if char_length(coalesce(request_line ->> 'pointure', '')) > 40
      or char_length(coalesce(request_line ->> 'couleur', '')) > 80 then
      return jsonb_build_object('ok', false, 'error', 'Les informations de la ligne ' || request_position || ' sont trop longues.');
    end if;

    if not exists (
      select 1 from public.modeles_stock
      where id = model_id and revendeur_id = order_owner and is_active = true
    ) then
      return jsonb_build_object('ok', false, 'error', 'Le modèle de la ligne ' || request_position || ' n’est plus disponible.');
    end if;

    if variant_id is not null then
      select couleur into variant_color
      from public.modele_stock_couleurs
      where id = variant_id and modele_stock_id = model_id;

      if not found then
        return jsonb_build_object('ok', false, 'error', 'La couleur de la ligne ' || request_position || ' est invalide.');
      end if;

      if lower(btrim(coalesce(request_line ->> 'couleur', ''))) <> lower(btrim(variant_color)) then
        return jsonb_build_object('ok', false, 'error', 'La couleur de la ligne ' || request_position || ' ne correspond pas au modèle.');
      end if;
    end if;
  end loop;

  request_source_key := public.catalogue_request_source_key();

  update public.catalogue_challenges
  set used_at = clock_timestamp()
  where id = p_challenge_id
    and revendeur_id = order_owner
    and used_at is null
    and expires_at > clock_timestamp()
    and created_at <= clock_timestamp() - interval '1 second'
    and (source_key is null or source_key = request_source_key)
  returning expected_answer into expected_challenge_answer;

  if expected_challenge_answer is null then
    return jsonb_build_object('ok', false, 'error', 'La vérification anti-robot a expiré. Veuillez réessayer.');
  end if;

  if p_challenge_answer is null or p_challenge_answer <> expected_challenge_answer then
    return jsonb_build_object('ok', false, 'error', 'La réponse anti-robot est incorrecte.');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(order_owner::text || ':catalogue-global', 0));
  perform pg_advisory_xact_lock(hashtextextended(order_owner::text || ':' || normalized_phone, 0));

  if (
    select count(*)
    from public.demandes_catalogue
    where revendeur_id = order_owner
      and created_at >= now() - interval '1 hour'
  ) >= 50 then
    return jsonb_build_object('ok', false, 'error', 'Le catalogue reçoit trop de demandes. Veuillez réessayer dans une heure.');
  end if;

  if (
    select count(*)
    from public.demandes_catalogue
    where revendeur_id = order_owner
      and created_at >= now() - interval '15 minutes'
      and regexp_replace(telephone, '[^0-9]', '', 'g') = normalized_phone
  ) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'Trop de demandes ont été envoyées avec ce numéro. Veuillez patienter 15 minutes.');
  end if;

  insert into public.demandes_catalogue (
    revendeur_id,
    client_id,
    civilite,
    nom_client,
    telephone,
    note
  ) values (
    order_owner,
    known_client_id,
    p_civilite,
    btrim(p_nom_client),
    btrim(p_telephone),
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into created_request_id;

  for request_line, request_position in
    select value, ordinality
    from jsonb_array_elements(p_articles) with ordinality
  loop
    insert into public.demande_catalogue_articles (
      demande_id,
      modele_stock_id,
      modele_stock_couleur_id,
      quantite,
      pointure,
      couleur,
      position
    ) values (
      created_request_id,
      (request_line ->> 'modele_stock_id')::bigint,
      nullif(request_line ->> 'modele_stock_couleur_id', '')::bigint,
      (request_line ->> 'quantite')::integer,
      nullif(btrim(coalesce(request_line ->> 'pointure', '')), ''),
      nullif(btrim(coalesce(request_line ->> 'couleur', '')), ''),
      request_position
    );
  end loop;

  insert into public.notifications (user_id, demande_catalogue_id, message)
  values (
    order_owner,
    created_request_id,
    'Nouvelle demande de ' || p_civilite || ' ' || btrim(p_nom_client) || ' depuis le catalogue (' || line_count || ' variante' || case when line_count > 1 then 's' else '' end || ').'
  );

  return jsonb_build_object('ok', true, 'demande_id', created_request_id);
end;
$$;

revoke execute on function public.submit_demande_catalogue_v3(uuid, uuid, text, text, text, text, jsonb, uuid, integer, text) from public;
grant execute on function public.submit_demande_catalogue_v3(uuid, uuid, text, text, text, text, jsonb, uuid, integer, text) to anon, authenticated;
