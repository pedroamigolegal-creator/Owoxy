-- Owoxy: migração 6 (30% das vendas para a conta Owoxy, escala do UGC, Faces, só a Owoxy cria UGC/Faces, Settings).
-- Rode UMA vez no SQL Editor do Supabase, DEPOIS do 004 e do 005. Pode rodar de novo sem estragar nada.
-- (Não rode o 005 de novo depois deste.)

-- ============ COLUNAS NOVAS ============
alter table public.items add column if not exists scale real not null default 1 check (scale between 0.05 and 20);
alter table public.items drop constraint if exists items_kind_check;
alter table public.items add constraint items_kind_check check (kind in ('shirt', 'pants', 'accessory', 'facedecal'));

alter table public.profiles add column if not exists privacy_messages        text not null default 'friends'  check (privacy_messages in ('friends', 'nobody'));
alter table public.profiles add column if not exists privacy_friend_requests text not null default 'everyone' check (privacy_friend_requests in ('everyone', 'nobody'));

-- ============ A CONTA OWOXY (recebe 30% de tudo que é vendido) ============
create or replace function public._owoxy_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.profiles where is_admin order by created_at limit 1;
$$;
revoke all on function public._owoxy_id() from public, anon, authenticated;

-- ============ CARTÃO DE ITEM (agora com scale) ============
drop type if exists public.item_card cascade;
create type public.item_card as (
  id bigint, kind text, accessory_type text, name text, price integer, image_path text, mesh_path text,
  creator_id uuid, creator_name text, creator_verified boolean, owned boolean, equipped boolean, created_at timestamptz,
  offset_x real, offset_y real, offset_z real,
  limited_kind text, stock integer, sold integer, serial integer, available_until timestamptz,
  open_now boolean, on_sale boolean, resale_from integer, resale_count integer,
  scale real
);

create or replace function public._cards(p_uid uuid)
returns setof public.item_card language sql stable security definer set search_path = public as $$
  select i.id, i.kind, i.accessory_type, i.name, i.price, i.image_path, i.mesh_path,
         i.creator_id, c.username, c.verified, (v.user_id is not null), coalesce(v.equipped, false), i.created_at,
         i.offset_x, i.offset_y, i.offset_z,
         i.limited_kind, i.stock, i.sold, v.serial, i.available_until,
         public._primary_open(i),
         (public._primary_open(i) or coalesce(r.cnt, 0) > 0),
         r.low, coalesce(r.cnt, 0)::integer,
         i.scale
  from public.items i
  join public.profiles c on c.id = i.creator_id
  left join public.inventory v on v.item_id = i.id and v.user_id = p_uid
  left join lateral (select min(s.price)::integer as low, count(*) as cnt from public.resales s where s.item_id = i.id) r on true
  where not i.deleted;
$$;
revoke all on function public._cards(uuid) from public, anon, authenticated;

create or replace function public.catalog_list(p_kind text default null, p_q text default null,
                                               p_limit integer default 48, p_offset integer default 0,
                                               p_show_offsale boolean default false)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select c.* from public._cards(auth.uid()) c
  where (p_kind is null or c.kind = p_kind or c.accessory_type = p_kind)
    and (coalesce(trim(p_q), '') = '' or strpos(lower(c.name), lower(trim(p_q))) > 0)
    and (p_show_offsale or c.on_sale)
  order by c.created_at desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;

create or replace function public.get_item(p_id bigint)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select c.* from public._cards(auth.uid()) c where c.id = p_id;
$$;

create or replace function public.my_inventory(p_kind text default null)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select c.* from public._cards(auth.uid()) c
  join public.inventory v on v.item_id = c.id and v.user_id = auth.uid()
  where p_kind is null or c.kind = p_kind or c.accessory_type = p_kind
  order by v.acquired_at desc
  limit 200;
$$;

create or replace function public.my_creations(p_kind text default null)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select c.* from public._cards(auth.uid()) c
  where c.creator_id = auth.uid() and (p_kind is null or c.kind = p_kind or c.accessory_type = p_kind)
  order by c.created_at desc
  limit 200;
$$;

-- ============ CRIAR ============
-- Camisa e calça: todo mundo. Acessório (UGC) e Face: só a conta Owoxy (admin).
drop function if exists public.create_item(text, text, text, integer, text, text, integer, real, real, real, text, integer, timestamptz);
create or replace function public.create_item(p_kind text, p_accessory_type text, p_name text, p_price integer,
                                              p_image_path text, p_mesh_path text, p_triangles integer default null,
                                              p_off_x real default 0, p_off_y real default 0, p_off_z real default 0,
                                              p_limited text default null, p_stock integer default null,
                                              p_until timestamptz default null, p_scale real default 1)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  nm     text := trim(coalesce(p_name, ''));
  folder text;
  new_id bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  folder := '^' || me::text || '/[A-Za-z0-9._-]{1,80}$';
  if p_kind not in ('shirt', 'pants', 'accessory', 'facedecal') then raise exception 'invalid kind'; end if;
  if p_kind in ('accessory', 'facedecal') and not public._is_admin() then raise exception 'admins only'; end if;
  if char_length(nm) not between 3 and 50 then raise exception 'invalid name'; end if;
  if p_price is not null and p_price not between 0 and 1000000 then raise exception 'invalid price'; end if;

  if p_kind = 'accessory' then
    if p_accessory_type is null or p_accessory_type not in ('hat', 'hair', 'face', 'back') then raise exception 'invalid accessory type'; end if;
    if p_mesh_path is null or p_mesh_path !~ folder or right(p_mesh_path, 4) <> '.obj' then raise exception 'invalid mesh'; end if;
    if p_triangles is null or p_triangles not between 1 and 4000 then raise exception 'too many triangles (max 4000)'; end if;
    if p_image_path is not null and (p_image_path !~ folder or right(p_image_path, 4) <> '.png') then raise exception 'invalid texture'; end if;
    if coalesce(p_off_x, 0) not between -50 and 50 or coalesce(p_off_y, 0) not between -50 and 50 or coalesce(p_off_z, 0) not between -50 and 50 then
      raise exception 'invalid position';
    end if;
    if coalesce(p_scale, 1) not between 0.05 and 20 then raise exception 'invalid scale'; end if;
  else
    if p_accessory_type is not null or p_mesh_path is not null then raise exception 'invalid item'; end if;
    if p_image_path is null or p_image_path !~ folder or right(p_image_path, 4) <> '.png' then raise exception 'invalid image'; end if;
  end if;

  if p_mesh_path is not null and not exists (select 1 from storage.objects where bucket_id = 'items' and name = p_mesh_path) then
    raise exception 'file not uploaded';
  end if;
  if p_image_path is not null and not exists (select 1 from storage.objects where bucket_id = 'items' and name = p_image_path) then
    raise exception 'file not uploaded';
  end if;

  if p_limited is not null or p_stock is not null or p_until is not null then
    if not public._is_admin() then raise exception 'admins only'; end if;
    if p_limited is not null and p_limited not in ('limited', 'unique') then raise exception 'invalid limited type'; end if;
    if p_limited = 'unique' and (p_stock is null or p_stock not between 1 and 100000) then raise exception 'invalid stock'; end if;
    if p_limited is distinct from 'unique' and p_stock is not null then raise exception 'invalid stock'; end if;
    if p_until is not null and p_until <= now() then raise exception 'invalid end date'; end if;
  end if;

  if (select count(*) from public.items where creator_id = me and created_at > now() - interval '1 day') >= 30
     and not public._is_admin() then
    raise exception 'daily upload limit reached';
  end if;

  insert into public.items (creator_id, kind, accessory_type, name, price, image_path, mesh_path, triangles,
                            offset_x, offset_y, offset_z, scale, limited_kind, stock, available_until)
  values (me, p_kind, p_accessory_type, nm, p_price, p_image_path, p_mesh_path, p_triangles,
          coalesce(p_off_x, 0), coalesce(p_off_y, 0), coalesce(p_off_z, 0), coalesce(p_scale, 1), p_limited, p_stock, p_until)
  returning id into new_id;

  insert into public.inventory (user_id, item_id) values (me, new_id);
  return new_id;
end $$;

-- ============ COMPRAR: 70% para quem criou, 30% para a conta Owoxy ============
-- Arredondamento: o criador recebe a parte inteira de 70% (ex.: 5 Owos -> 3 para o criador e 2 para o Owoxy).
-- Se o criador for a própria conta Owoxy, ela fica com tudo.
create or replace function public.buy_item(p_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  it    public.items;
  bal   bigint;
  share integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  select balance into bal from public.profiles where id = me for update;
  select * into it from public.items where id = p_id and not deleted for update;
  if not found then raise exception 'item not found'; end if;
  if it.price is null then raise exception 'item is offsale'; end if;
  if it.available_until is not null and it.available_until <= now() then raise exception 'sale ended'; end if;
  if it.limited_kind = 'unique' and it.sold >= coalesce(it.stock, 0) then raise exception 'sold out'; end if;
  if exists (select 1 from public.inventory where user_id = me and item_id = it.id) then
    raise exception 'already owned';
  end if;
  if bal < it.price then raise exception 'not enough owos'; end if;
  update public.profiles set balance = balance - it.price where id = me returning balance into bal;

  share := (it.price * 7) / 10;
  update public.profiles set balance = balance + share where id = it.creator_id;
  update public.profiles set balance = balance + (it.price - share) where id = public._owoxy_id();
  -- quem compra ganha o saldo de volta se for o próprio criador/Owoxy: refaz a leitura do saldo
  select balance into bal from public.profiles where id = me;

  if it.limited_kind = 'unique' then
    update public.items set sold = sold + 1 where id = it.id returning sold into it.sold;
    insert into public.inventory (user_id, item_id, serial) values (me, it.id, it.sold);
  else
    update public.items set sold = sold + 1 where id = it.id;
    insert into public.inventory (user_id, item_id) values (me, it.id);
  end if;
  return bal;
end $$;

-- Revenda: o vendedor recebe 70% (parte inteira) e a conta Owoxy os outros 30%.
create or replace function public.buy_resale(p_id bigint, p_seller uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me    uuid := auth.uid();
  l     public.resales;
  bal   bigint;
  share integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  if me = p_seller then raise exception 'cannot buy your own'; end if;
  select * into l from public.resales where item_id = p_id and seller_id = p_seller for update;
  if not found then raise exception 'listing gone'; end if;
  if not exists (select 1 from public.inventory where user_id = p_seller and item_id = p_id) then
    delete from public.resales where item_id = p_id and seller_id = p_seller;
    raise exception 'listing gone';
  end if;
  if exists (select 1 from public.inventory where user_id = me and item_id = p_id) then raise exception 'already owned'; end if;
  select balance into bal from public.profiles where id = me for update;
  if bal < l.price then raise exception 'not enough owos'; end if;
  update public.profiles set balance = balance - l.price where id = me;
  share := (l.price * 7) / 10;
  update public.profiles set balance = balance + share where id = p_seller;
  update public.profiles set balance = balance + (l.price - share) where id = public._owoxy_id();
  delete from public.resales where item_id = p_id and seller_id = p_seller;
  update public.inventory set user_id = me, equipped = false, acquired_at = now() where user_id = p_seller and item_id = p_id;
  select balance into bal from public.profiles where id = me;
  return bal;
end $$;

-- ============ AVATAR (escala dos acessórios e face) ============
create or replace function public.avatar_look(p_user uuid)
returns jsonb language sql security definer stable set search_path = public as $$
  select jsonb_build_object(
    'colors', p.avatar_colors,
    'shirt', (select jsonb_build_object('id', i.id, 'image_path', i.image_path)
                from public.inventory v join public.items i on i.id = v.item_id
               where v.user_id = p.id and v.equipped and not i.deleted and i.kind = 'shirt' limit 1),
    'pants', (select jsonb_build_object('id', i.id, 'image_path', i.image_path)
                from public.inventory v join public.items i on i.id = v.item_id
               where v.user_id = p.id and v.equipped and not i.deleted and i.kind = 'pants' limit 1),
    'face', (select jsonb_build_object('id', i.id, 'image_path', i.image_path)
               from public.inventory v join public.items i on i.id = v.item_id
              where v.user_id = p.id and v.equipped and not i.deleted and i.kind = 'facedecal' limit 1),
    'accessories', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.accessory_type,
                                                                  'mesh_path', i.mesh_path, 'image_path', i.image_path,
                                                                  'offset_x', i.offset_x, 'offset_y', i.offset_y, 'offset_z', i.offset_z,
                                                                  'scale', i.scale))
                               from public.inventory v join public.items i on i.id = v.item_id
                              where v.user_id = p.id and v.equipped and not i.deleted and i.kind = 'accessory'), '[]'::jsonb)
  )
  from public.profiles p where p.id = p_user;
$$;

-- ============ SETTINGS ============
-- Gênero (male / female / vazio) e privacidade. O nome de usuário e a data de nascimento não mudam.
create or replace function public.update_settings(p_gender text, p_privacy_messages text, p_privacy_friend_requests text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if coalesce(p_gender, '') not in ('', 'male', 'female') then raise exception 'invalid gender'; end if;
  if p_privacy_messages not in ('friends', 'nobody') then raise exception 'invalid setting'; end if;
  if p_privacy_friend_requests not in ('everyone', 'nobody') then raise exception 'invalid setting'; end if;
  update public.profiles
     set gender = nullif(p_gender, ''), privacy_messages = p_privacy_messages, privacy_friend_requests = p_privacy_friend_requests
   where id = auth.uid();
end $$;

-- Quem não quer mensagens / pedidos de amizade é respeitado
create or replace function public.send_message(p_to_user uuid, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'invalid message'; end if;
  if length(coalesce(p_subject, '')) > 100 then raise exception 'subject too long'; end if;
  if public.friend_status(p_to_user) <> 'friends' then raise exception 'you can only message friends'; end if;
  if (select privacy_messages from public.profiles where id = p_to_user) = 'nobody' then raise exception 'messages disabled'; end if;
  if (select count(*) from public.messages where sender_id = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'slow down';
  end if;
  insert into public.messages (sender_id, recipient_id, subject, body)
  values (me, p_to_user, trim(coalesce(p_subject, '')), trim(p_body));
end $$;

create or replace function public.send_friend_request(p_target uuid)
returns text language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); f public.friendships;
begin
  if me is null then raise exception 'not signed in'; end if;
  if me = p_target then raise exception 'cannot add yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'no such user'; end if;
  select * into f from public.friendships
   where least(requester, addressee) = least(me, p_target) and greatest(requester, addressee) = greatest(me, p_target);
  if found then
    if f.status = 'pending' and f.addressee = me then
      update public.friendships set status = 'accepted' where id = f.id;
      return 'friends';
    end if;
    return public.friend_status(p_target);
  end if;
  if (select privacy_friend_requests from public.profiles where id = p_target) = 'nobody' then
    raise exception 'friend requests disabled';
  end if;
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 100 then
    raise exception 'too many pending requests';
  end if;
  insert into public.friendships (requester, addressee) values (me, p_target);
  return 'sent';
end $$;

-- ============ PERMISSÕES ============
do $$
declare f text;
begin
  foreach f in array array[
    'catalog_list(text, text, integer, integer, boolean)', 'get_item(bigint)', 'my_inventory(text)', 'my_creations(text)',
    'create_item(text, text, text, integer, text, text, integer, real, real, real, text, integer, timestamptz, real)',
    'buy_item(bigint)', 'buy_resale(bigint, uuid)', 'avatar_look(uuid)',
    'update_settings(text, text, text)', 'send_message(uuid, text, text)', 'send_friend_request(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Avisa a API do Supabase para recarregar as funções novas
notify pgrst, 'reload schema';
