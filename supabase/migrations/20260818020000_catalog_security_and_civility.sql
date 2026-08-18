alter table public.clients
add column if not exists civilite text
check (civilite is null or civilite in ('Mr', 'Mme'));

alter table public.clients
add column if not exists catalogue_token_expires_at timestamptz;

update public.clients
set catalogue_token_expires_at = now() + interval '30 days'
where catalogue_token_expires_at is null;

alter table public.clients
alter column catalogue_token_expires_at set default (now() + interval '30 days');

alter table public.clients
alter column catalogue_token_expires_at set not null;

alter table public.demandes_catalogue
add column if not exists civilite text
check (civilite is null or civilite in ('Mr', 'Mme'));

create table if not exists public.catalogue_challenges (
  id uuid primary key default gen_random_uuid(),
  revendeur_id uuid not null references public.profiles(id) on delete cascade,
  source_key bigint,
  question text not null,
  expected_answer integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  used_at timestamptz
);

create index if not exists idx_catalogue_challenges_source
on public.catalogue_challenges(source_key, created_at desc);

create index if not exists idx_catalogue_challenges_expiry
on public.catalogue_challenges(expires_at);

alter table public.catalogue_challenges enable row level security;
revoke all on table public.catalogue_challenges from public, anon, authenticated;

create or replace function public.catalogue_request_source_key()
returns bigint
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  request_headers_text text;
  request_headers jsonb;
  request_source text;
begin
  request_headers_text := current_setting('request.headers', true);
  if request_headers_text is null or request_headers_text = '' then
    return null;
  end if;

  begin
    request_headers := request_headers_text::jsonb;
  exception when others then
    return null;
  end;

  request_source := coalesce(
    nullif(btrim(request_headers ->> 'cf-connecting-ip'), ''),
    nullif(btrim(split_part(request_headers ->> 'x-forwarded-for', ',', 1)), ''),
    nullif(btrim(request_headers ->> 'x-real-ip'), '')
  );

  if request_source is null then
    return null;
  end if;

  return hashtextextended(request_source, 0);
end;
$$;

create or replace function public.create_catalogue_challenge(p_catalogue_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  order_owner uuid;
  request_source_key bigint;
  left_operand integer;
  right_operand integer;
  challenge_id uuid;
  challenge_expiry timestamptz;
begin
  select revendeur_id into order_owner
  from public.catalogue_partages
  where token = p_catalogue_token and actif = true;

  if order_owner is null then
    raise exception 'Ce lien de catalogue est invalide ou désactivé';
  end if;

  request_source_key := public.catalogue_request_source_key();

  if request_source_key is not null then
    perform pg_advisory_xact_lock(request_source_key);
    if (
      select count(*)
      from public.catalogue_challenges
      where source_key = request_source_key
        and created_at >= now() - interval '1 minute'
    ) >= 20 then
      raise exception 'Trop de vérifications demandées. Veuillez patienter une minute.';
    end if;
  end if;

  delete from public.catalogue_challenges
  where expires_at < now() - interval '1 day';

  left_operand := 10 + floor(random() * 40)::integer;
  right_operand := 1 + floor(random() * 9)::integer;

  insert into public.catalogue_challenges (
    revendeur_id,
    source_key,
    question,
    expected_answer
  ) values (
    order_owner,
    request_source_key,
    left_operand || ' + ' || right_operand,
    left_operand + right_operand
  )
  returning id, expires_at into challenge_id, challenge_expiry;

  return jsonb_build_object(
    'id', challenge_id,
    'question', left_operand || ' + ' || right_operand,
    'expires_at', challenge_expiry
  );
end;
$$;

create or replace function public.sync_catalogue_request_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_phone text;
  matched_client_id bigint;
begin
  normalized_phone := regexp_replace(btrim(new.telephone), '[^0-9]', '', 'g');

  perform pg_advisory_xact_lock(
    hashtextextended(new.revendeur_id::text || ':' || normalized_phone, 0)
  );

  if new.client_id is not null then
    select id into matched_client_id
    from public.clients
    where id = new.client_id and revendeur_id = new.revendeur_id;
  end if;

  if matched_client_id is null then
    select id into matched_client_id
    from public.clients
    where revendeur_id = new.revendeur_id
      and regexp_replace(telephone, '[^0-9]', '', 'g') = normalized_phone
    order by created_at
    limit 1;
  end if;

  if matched_client_id is null then
    insert into public.clients (revendeur_id, civilite, nom, telephone)
    values (new.revendeur_id, new.civilite, btrim(new.nom_client), btrim(new.telephone))
    returning id into matched_client_id;
  else
    update public.clients
    set civilite = coalesce(new.civilite, civilite),
        nom = btrim(new.nom_client),
        telephone = btrim(new.telephone)
    where id = matched_client_id;
  end if;

  new.client_id := matched_client_id;
  return new;
end;
$$;

drop trigger if exists demandes_catalogue_sync_client on public.demandes_catalogue;
create trigger demandes_catalogue_sync_client
before insert or update of civilite, nom_client, telephone, client_id on public.demandes_catalogue
for each row execute function public.sync_catalogue_request_client();

create or replace function public.get_catalogue_client(
  p_catalogue_token uuid,
  p_client_token uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'civilite', client.civilite,
    'nom_client', client.nom,
    'telephone', client.telephone,
    'expires_at', client.catalogue_token_expires_at
  )
  from public.catalogue_partages as partage
  join public.clients as client
    on client.revendeur_id = partage.revendeur_id
  where partage.token = p_catalogue_token
    and partage.actif = true
    and client.catalogue_token = p_client_token
    and client.catalogue_token_expires_at > now()
  limit 1;
$$;

create or replace function public.renew_client_catalogue_link(p_client_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  client_owner uuid;
  client_token uuid;
  client_expiry timestamptz;
  catalog_token uuid;
begin
  if auth.uid() is null or not public.is_manager() then
    raise exception 'Accès refusé';
  end if;

  select revendeur_id into client_owner
  from public.clients
  where id = p_client_id
    and (revendeur_id = auth.uid() or public.current_user_role() = 'admin');

  if client_owner is null then
    raise exception 'Client introuvable';
  end if;

  update public.clients
  set catalogue_token = gen_random_uuid(),
      catalogue_token_expires_at = now() + interval '30 days',
      updated_at = now()
  where id = p_client_id
  returning catalogue_token, catalogue_token_expires_at
  into client_token, client_expiry;

  insert into public.catalogue_partages (revendeur_id, actif)
  values (client_owner, true)
  on conflict (revendeur_id) do update
  set actif = true,
      updated_at = now()
  returning token into catalog_token;

  return jsonb_build_object(
    'token', client_token,
    'expires_at', client_expiry,
    'catalogue_token', catalog_token
  );
end;
$$;

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
    select count(distinct value ->> 'modele_stock_id')
    from jsonb_array_elements(p_articles)
  ) <> line_count then
    return jsonb_build_object('ok', false, 'error', 'Un même modèle ne peut apparaître qu’une fois dans le panier.');
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
      quantite,
      pointure,
      couleur,
      position
    ) values (
      created_request_id,
      (request_line ->> 'modele_stock_id')::bigint,
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
    'Nouvelle demande de ' || p_civilite || ' ' || btrim(p_nom_client) || ' depuis le catalogue (' || line_count || ' modèle' || case when line_count > 1 then 's' else '' end || ').'
  );

  return jsonb_build_object('ok', true, 'demande_id', created_request_id);
end;
$$;

revoke execute on function public.catalogue_request_source_key() from public, anon, authenticated;

revoke execute on function public.create_catalogue_challenge(uuid) from public;
grant execute on function public.create_catalogue_challenge(uuid) to anon, authenticated;

revoke execute on function public.get_catalogue_client(uuid, uuid) from public;
grant execute on function public.get_catalogue_client(uuid, uuid) to anon, authenticated;

revoke execute on function public.renew_client_catalogue_link(bigint) from public, anon;
grant execute on function public.renew_client_catalogue_link(bigint) to authenticated;

revoke execute on function public.submit_demande_catalogue(uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.submit_demande_catalogue_v2(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
revoke execute on function public.submit_demande_catalogue_v3(uuid, uuid, text, text, text, text, jsonb, uuid, integer, text) from public;
grant execute on function public.submit_demande_catalogue_v3(uuid, uuid, text, text, text, text, jsonb, uuid, integer, text) to anon, authenticated;
