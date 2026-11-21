-- Owoxy: migração 5 (Premium, posição dos acessórios UGC, Limiteds / Limited Unique, revenda, prazo de venda, Offsale).
-- Rode UMA vez no SQL Editor do Supabase, DEPOIS do 004. Pode rodar de novo sem estragar nada.

-- ============ COLUNAS NOVAS ============
alter table public.profiles  add column if not exists premium_until   timestamptz;

alter table public.items add column if not exists offset_x real not null default 0 check (offset_x between -50 and 50);
alter table public.items add column if not exists offset_y real not null default 0 check (offset_y between -50 and 50);
alter table public.items add column if not exists offset_z real not null default 0 check (offset_z between -50 and 50);
alter table public.items add column if not exists limited_kind    text check (limited_kind in ('limited', 'unique'));
alter table public.items add column if not exists stock           integer check (stock is null or stock between 1 and 100000);   -- só Limited Unique
alter table public.items add column if not exists sold            integer not null default 0;
alter table public.items add column if not exists available_until timestamptz;                                                    -- vende até esta data/hora

alter table public.inventory add column if not exists serial integer;                                                             -- número da cópia (Limited Unique)

-- Revenda: o dono de um Limited coloca a cópia dele à venda (um anúncio por pessoa e por item).
create table if not exists public.resales (
  item_id    bigint not null references public.items(id) on delete cascade,
  seller_id  uuid   not null references public.profiles(id) on delete cascade,
  price      integer not null check (price between 1 and 1000000),
  created_at timestamptz not null default now(),
  primary key (item_id, seller_id)
);
alter table public.resales enable row level security;
revoke all on public.resales from anon, authenticated;

-- ============ PERFIL (agora com premium_until) ============
create or replace function public.my_profile()
returns public.profiles language sql security definer stable set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

-- ============ CARTÃO DE ITEM (novos campos no fim) ============
drop type if exists public.item_card cascade;   -- derruba as funções que usam o tipo; elas são recriadas abaixo
create type public.item_card as (
  id bigint, kind text, accessory_type text, name text, price integer, image_path text, mesh_path text,
  creator_id uuid, creator_name text, creator_verified boolean, owned boolean, equipped boolean, created_at timestamptz,
  offset_x real, offset_y real, offset_z real,
  limited_kind text, stock integer, sold integer, serial integer, available_until timestamptz,
  open_now boolean,      -- dá para comprar do Owoxy agora (tem preço, dentro do prazo, com estoque)
  on_sale boolean,       -- aparece no catálogo sem filtro: open_now ou tem revendedor
  resale_from integer,   -- menor preço de revenda
  resale_count integer
);

-- A venda "oficial" está aberta?
create or replace function public._primary_open(i public.items)
returns boolean language sql stable set search_path = public as $$
  select i.price is not null
     and (i.available_until is null or i.available_until > now())
     and not coalesce(i.limited_kind = 'unique' and i.sold >= coalesce(i.stock, 0), false);
$$;
revoke all on function public._primary_open(public.items) from public, anon, authenticated;

-- Base de todas as listas: itens não apagados, com o que a pessoa p_uid tem.
create or replace function public._cards(p_uid uuid)
returns setof public.item_card language sql stable security definer set search_path = public as $$
  select i.id, i.kind, i.accessory_type, i.name, i.price, i.image_path, i.mesh_path,
         i.creator_id, c.username, c.verified, (v.user_id is not null), coalesce(v.equipped, false), i.created_at,
         i.offset_x, i.offset_y, i.offset_z,
         i.limited_kind, i.stock, i.sold, v.serial, i.available_until,
         public._primary_open(i),
         (public._primary_open(i) or coalesce(r.cnt, 0) > 0),
         r.low, coalesce(r.cnt, 0)::integer
  from public.items i
  join public.profiles c on c.id = i.creator_id
  left join public.inventory v on v.item_id = i.id and v.user_id = p_uid
  left join lateral (select min(s.price)::integer as low, count(*) as cnt from public.resales s where s.item_id = i.id) r on true
  where not i.deleted;
$$;
revoke all on function public._cards(uuid) from public, anon, authenticated;

-- ============ LISTAS ============
-- p_show_offsale = false (padrão): esconde o que não está à venda (Offsale, prazo acabado, esgotado sem revendedor).
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
-- Posição do acessório (offset), Limited / Limited Unique, estoque e prazo: os três últimos só a conta admin (Owoxy).
drop function if exists public.create_item(text, text, text, integer, text, text, integer);
create or replace function public.create_item(p_kind text, p_accessory_type text, p_name text, p_price integer,
                                              p_image_path text, p_mesh_path text, p_triangles integer default null,
                                              p_off_x real default 0, p_off_y real default 0, p_off_z real default 0,
                                              p_limited text default null, p_stock integer default null,
                                              p_until timestamptz default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  nm     text := trim(coalesce(p_name, ''));
  folder text;
  new_id bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  folder := '^' || me::text || '/[A-Za-z0-9._-]{1,80}$';
  if p_kind not in ('shirt', 'pants', 'accessory') then raise exception 'invalid kind'; end if;
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

  -- Limited, Limited Unique e prazo de venda: só a conta oficial
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
                            offset_x, offset_y, offset_z, limited_kind, stock, available_until)
  values (me, p_kind, p_accessory_type, nm, p_price, p_image_path, p_mesh_path, p_triangles,
          coalesce(p_off_x, 0), coalesce(p_off_y, 0), coalesce(p_off_z, 0), p_limited, p_stock, p_until)
  returning id into new_id;

  insert into public.inventory (user_id, item_id) values (me, new_id);   -- a cópia de quem cria não gasta o estoque
  return new_id;
end $$;

-- ============ COMPRAR (venda oficial) ============
create or replace function public.buy_item(p_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  it  public.items;
  bal bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  select balance into bal from public.profiles where id = me for update;   -- trava: evita compra dupla
  select * into it from public.items where id = p_id and not deleted for update;   -- trava: não vende além do estoque
  if not found then raise exception 'item not found'; end if;
  if it.price is null then raise exception 'item is offsale'; end if;
  if it.available_until is not null and it.available_until <= now() then raise exception 'sale ended'; end if;
  if it.limited_kind = 'unique' and it.sold >= coalesce(it.stock, 0) then raise exception 'sold out'; end if;
  if exists (select 1 from public.inventory where user_id = me and item_id = it.id) then
    raise exception 'already owned';
  end if;
  if bal < it.price then raise exception 'not enough owos'; end if;
  update public.profiles set balance = balance - it.price where id = me returning balance into bal;
  if it.limited_kind = 'unique' then
    update public.items set sold = sold + 1 where id = it.id returning sold into it.sold;
    insert into public.inventory (user_id, item_id, serial) values (me, it.id, it.sold);
  else
    update public.items set sold = sold + 1 where id = it.id;
    insert into public.inventory (user_id, item_id) values (me, it.id);
  end if;
  return bal;
end $$;

-- ============ REVENDA (só Limited e Limited Unique) ============
create or replace function public.list_resale(p_id bigint, p_price integer)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_price is null or p_price not between 1 and 1000000 then raise exception 'invalid price'; end if;
  if not exists (select 1 from public.items where id = p_id and not deleted and limited_kind is not null) then
    raise exception 'not resellable';
  end if;
  if not exists (select 1 from public.inventory where user_id = me and item_id = p_id) then
    raise exception 'you do not own this item';
  end if;
  insert into public.resales (item_id, seller_id, price) values (p_id, me, p_price)
  on conflict (item_id, seller_id) do update set price = excluded.price, created_at = now();
  update public.inventory set equipped = false where user_id = me and item_id = p_id;
end $$;

create or replace function public.cancel_resale(p_id bigint)
returns void language sql security definer set search_path = public as $$
  delete from public.resales where item_id = p_id and seller_id = auth.uid();
$$;

create or replace function public.item_resales(p_id bigint)
returns table (seller_id uuid, seller_name text, seller_verified boolean, price integer, serial integer)
language sql security definer stable set search_path = public as $$
  select s.seller_id, p.username, p.verified, s.price, v.serial
  from public.resales s
  join public.profiles p on p.id = s.seller_id
  join public.inventory v on v.item_id = s.item_id and v.user_id = s.seller_id
  join public.items i on i.id = s.item_id and not i.deleted
  where s.item_id = p_id
  order by s.price, s.created_at
  limit 50;
$$;

-- Comprar a cópia de outra pessoa. O vendedor recebe 70% (30% de taxa do Owoxy). Devolve o saldo novo.
create or replace function public.buy_resale(p_id bigint, p_seller uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  l   public.resales;
  bal bigint;
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
  update public.profiles set balance = balance - l.price where id = me returning balance into bal;
  update public.profiles set balance = balance + (l.price * 7 / 10) where id = p_seller;
  delete from public.resales where item_id = p_id and seller_id = p_seller;
  update public.inventory set user_id = me, equipped = false, acquired_at = now() where user_id = p_seller and item_id = p_id;
  return bal;
end $$;

-- ============ AVATAR (agora com a posição dos acessórios) ============
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
    'accessories', coalesce((select jsonb_agg(jsonb_build_object('id', i.id, 'type', i.accessory_type,
                                                                  'mesh_path', i.mesh_path, 'image_path', i.image_path,
                                                                  'offset_x', i.offset_x, 'offset_y', i.offset_y, 'offset_z', i.offset_z))
                               from public.inventory v join public.items i on i.id = v.item_id
                              where v.user_id = p.id and v.equipped and not i.deleted and i.kind = 'accessory'), '[]'::jsonb)
  )
  from public.profiles p where p.id = p_user;
$$;

-- ============ OWOS DIÁRIAS (Premium ganha 100, os outros 25) ============
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  last_t timestamptz;
  prem   timestamptz;
  bal    bigint;
  amt    integer;
begin
  if me is null then raise exception 'not signed in'; end if;
  select last_daily, premium_until, balance into last_t, prem, bal from public.profiles where id = me for update;
  amt := case when prem is not null and prem > now() then 100 else 25 end;
  if last_t is null or now() - last_t >= interval '24 hours' then
    update public.profiles set balance = balance + amt, last_daily = now() where id = me returning balance into bal;
    return jsonb_build_object('claimed', true, 'amount', amt, 'balance', bal, 'next_at', now() + interval '24 hours');
  end if;
  return jsonb_build_object('claimed', false, 'amount', 0, 'balance', bal, 'next_at', last_t + interval '24 hours');
end $$;

-- ============ SÓ A CONTA OFICIAL (admin) ============
-- Dar Premium por N dias (0 = tirar o Premium).
create or replace function public.admin_set_premium(p_username text, p_days integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  if p_days is null or p_days not between 0 and 3650 then raise exception 'invalid days'; end if;
  if p_days = 0 then
    update public.profiles set premium_until = null where lower(username) = lower(p_username);
  else
    update public.profiles set premium_until = greatest(coalesce(premium_until, now()), now()) + make_interval(days => p_days)
     where lower(username) = lower(p_username);
  end if;
  if not found then raise exception 'no such user'; end if;
end $$;

-- Mudar até quando o item fica à venda (null = sem prazo).
create or replace function public.set_item_availability(p_id bigint, p_until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  update public.items set available_until = p_until where id = p_id and not deleted;
  if not found then raise exception 'item not found'; end if;
end $$;

-- ============ PERMISSÕES ============
do $$
declare f text;
begin
  foreach f in array array[
    'catalog_list(text, text, integer, integer, boolean)', 'get_item(bigint)', 'my_inventory(text)', 'my_creations(text)',
    'create_item(text, text, text, integer, text, text, integer, real, real, real, text, integer, timestamptz)',
    'buy_item(bigint)', 'list_resale(bigint, integer)', 'cancel_resale(bigint)', 'item_resales(bigint)',
    'buy_resale(bigint, uuid)', 'avatar_look(uuid)', 'claim_daily()',
    'admin_set_premium(text, integer)', 'set_item_availability(bigint, timestamptz)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Avisa a API do Supabase para recarregar as funções novas
notify pgrst, 'reload schema';
