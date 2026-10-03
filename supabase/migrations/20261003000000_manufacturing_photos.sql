alter table public.photos drop constraint if exists photos_type_photo_check;

alter table public.photos
  add constraint photos_type_photo_check
  check (type_photo in ('modele', 'pied_gauche', 'pied_droit', 'fabrication', 'autre'));

create or replace function public.can_upload_fabrication_photo(p_commande_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.commandes
    where id = p_commande_id
      and cordonnier_id = auth.uid()
      and statut = 'en_fabrication'
  );
$$;

drop policy if exists photos_insert on public.photos;
create policy photos_insert on public.photos
for insert to authenticated
with check (
  public.can_manage_commande(commande_id)
  or (
    type_photo = 'fabrication'
    and public.can_upload_fabrication_photo(commande_id)
  )
);

drop policy if exists commande_photos_insert on storage.objects;
create policy commande_photos_insert on storage.objects
for insert to authenticated
with check (
  bucket_id = 'commande-photos'
  and (
    public.can_manage_commande(
      case
        when (storage.foldername(name))[1] ~ '^[0-9]+$' then ((storage.foldername(name))[1])::bigint
        else null
      end
    )
    or public.can_upload_fabrication_photo(
      case
        when (storage.foldername(name))[1] ~ '^[0-9]+$' then ((storage.foldername(name))[1])::bigint
        else null
      end
    )
  )
);

revoke execute on function public.can_upload_fabrication_photo(bigint) from public, anon;
grant execute on function public.can_upload_fabrication_photo(bigint) to authenticated;
