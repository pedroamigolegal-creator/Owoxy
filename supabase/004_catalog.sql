-- Owoxy: migração 4 (catálogo, Create: camisas/calças/UGC, inventário, compras, Owos diárias).
-- Rode uma vez no SQL Editor do Supabase (depois do 003). Pode rodar de novo sem estragar nada.

-- ============ ARQUIVOS (camisas, calças, UGC) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('items', 'items', true, 5242880, array['image/png', 'text/plain', 'application/octet-stream', 'model/obj'])
on conflict (id) do update
  set public = true, file_size_limit = 5242880, allowed_mime_types = excluded.allowed_mime_types;

-- Cada pessoa só envia arquivos para a própria pasta (nome da pasta = id do usuário).
drop policy if exists "owoxy items: upload to own folder" on storage.objects;
create policy "owoxy items: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'items' and (storage.foldername(name))[1] = auth.uid()::text);

-- ============ PERFIL: admin e Owos diárias (colunas privadas) ============
alter table public.profiles add column if not exists is_admin   boolean not null default false;
alter table public.profiles add column if not exists last_daily timestamptz;

create or replace function public.my_profile()
returns public.profiles language sql security definer stable set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

create or replace function public._is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;
revoke all on function public._is_admin() from public, anon;

-- ============ TABELAS ============
create table if not exists public.items (
  id             bigint generated always as identity primary key,
  creator_id     uuid not null references public.profiles(id) on delete cascade,
  kind           text not null check (kind in ('shirt', 'pants', 'accessory')),
  accessory_type text check (accessory_type in ('hat', 'hair', 'face', 'back')),
  name           text not null check (char_length(name) between 3 and 50),
  price          integer check (price is null or price between 0 and 1000000),   -- null = Offsale, 0 = Free
  image_path     text,     -- camisa/calça: o molde PNG; acessório: textura PNG (opcional)
  mesh_path      text,     -- acessório: arquivo .obj
  triangles      integer,
  deleted        boolean not null default false,
  created_at     timestamptz not null default now(),
  check ((kind = 'accessory') = (accessory_type is not null))
);
create index if not exists items_catalog_idx on public.items (created_at desc) where not deleted;

create table if not exists public.inventory (
  user_id     uuid not null references public.profiles(id) on delete cascade,
  item_id     bigint not null references public.items(id) on delete cascade,
  equipped    boolean not null default false,
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

alter table public.items     enable row level security;
alter table public.inventory enable row level security;
revoke all on public.items, public.inventory from anon, authenticated;   -- só pelas funções abaixo

-- Formato dos cartões de item (catálogo, inventário, Create)
drop type if exists public.item_card cascade;
create type public.item_card as (
  id bigint, kind text, accessory_type text, name text, price integer, image_path text, mesh_path text,
  creator_id uuid, creator_name text, creator_verified boolean, owned boolean, equipped boolean, created_at timestamptz
);

-- ============ CATÁLOGO ============
-- p_kind: null (tudo) | shirt | pants | accessory | hat | hair | face | back
create or replace function public.catalog_list(p_kind text default null, p_q text default null,
                                               p_limit integer default 48, p_offset integer default 0)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select i.id, i.kind, i.accessory_type, i.name, i.price, i.image_path, i.mesh_path,
         i.creator_id, c.username, c.verified, (v.user_id is not null), coalesce(v.equipped, false), i.created_at
  from public.items i
  join public.profiles c on c.id = i.creator_id
  left join public.inventory v on v.item_id = i.id and v.user_id = auth.uid()
  where not i.deleted
    and (p_kind is null or i.kind = p_kind or i.accessory_type = p_kind)
    and (coalesce(trim(p_q), '') = '' or strpos(lower(i.name), lower(trim(p_q))) > 0)
  order by i.created_at desc
  limit least(greatest(p_limit, 1), 60) offset greatest(p_offset, 0);
$$;

create or replace function public.get_item(p_id bigint)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select i.id, i.kind, i.accessory_type, i.name, i.price, i.image_path, i.mesh_path,
         i.creator_id, c.username, c.verified, (v.user_id is not null), coalesce(v.equipped, false), i.created_at
  from public.items i
  join public.profiles c on c.id = i.creator_id
  left join public.inventory v on v.item_id = i.id and v.user_id = auth.uid()
  where i.id = p_id and not i.deleted;
$$;

create or replace function public.my_inventory(p_kind text default null)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select i.id, i.kind, i.accessory_type, i.name, i.price, i.image_path, i.mesh_path,
         i.creator_id, c.username, c.verified, true, v.equipped, i.created_at
  from public.inventory v
  join public.items i on i.id = v.item_id
  join public.profiles c on c.id = i.creator_id
  where v.user_id = auth.uid() and not i.deleted
    and (p_kind is null or i.kind = p_kind or i.accessory_type = p_kind)
  order by v.acquired_at desc
  limit 200;
$$;

create or replace function public.my_creations(p_kind text default null)
returns setof public.item_card language sql security definer stable set search_path = public as $$
  select i.id, i.kind, i.accessory_type, i.name, i.price, i.image_path, i.mesh_path,
         i.creator_id, c.username, c.verified, (v.user_id is not null), coalesce(v.equipped, false), i.created_at
  from public.items i
  join public.profiles c on c.id = i.creator_id
  left join public.inventory v on v.item_id = i.id and v.user_id = auth.uid()
  where i.creator_id = auth.uid() and not i.deleted
    and (p_kind is null or i.kind = p_kind or i.accessory_type = p_kind)
  order by i.created_at desc
  limit 200;
$$;

-- ============ CRIAR ============
-- Preço null = Offsale (não está à venda); 0 = Free. Quem cria recebe o item no inventário.
create or replace function public.create_item(p_kind text, p_accessory_type text, p_name text, p_price integer,
                                              p_image_path text, p_mesh_path text, p_triangles integer default null)
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

  if (select count(*) from public.items where creator_id = me and created_at > now() - interval '1 day') >= 30 then
    raise exception 'daily upload limit reached';
  end if;

  insert into public.items (creator_id, kind, accessory_type, name, price, image_path, mesh_path, triangles)
  values (me, p_kind, p_accessory_type, nm, p_price, p_image_path, p_mesh_path, p_triangles)
  returning id into new_id;

  insert into public.inventory (user_id, item_id) values (me, new_id);
  return new_id;
end $$;

-- Mudar o preço (ou tirar de venda com null): só quem criou.
create or replace function public.set_item_price(p_id bigint, p_price integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_price is not null and p_price not between 0 and 1000000 then raise exception 'invalid price'; end if;
  update public.items set price = p_price where id = p_id and creator_id = auth.uid() and not deleted;
  if not found then raise exception 'not your item'; end if;
end $$;

-- ============ COMPRAR ============
-- Tira as Owos e põe no inventário, tudo na mesma transação. Devolve o saldo novo.
create or replace function public.buy_item(p_id bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  me  uuid := auth.uid();
  it  public.items;
  bal bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  select balance into bal from public.profiles where id = me for update;   -- trava: evita compra dupla
  select * into it from public.items where id = p_id and not deleted;
  if not found then raise exception 'item not found'; end if;
  if it.price is null then raise exception 'item is offsale'; end if;
  if exists (select 1 from public.inventory where user_id = me and item_id = it.id) then
    raise exception 'already owned';
  end if;
  if bal < it.price then raise exception 'not enough owos'; end if;
  update public.profiles set balance = balance - it.price where id = me returning balance into bal;
  insert into public.inventory (user_id, item_id) values (me, it.id);
  return bal;
end $$;

-- ============ VESTIR ============
create or replace function public.equip_item(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); it public.items;
begin
  if me is null then raise exception 'not signed in'; end if;
  select i.* into it from public.items i
   where i.id = p_id and not i.deleted
     and exists (select 1 from public.inventory v where v.user_id = me and v.item_id = i.id);
  if not found then raise exception 'you do not own this item'; end if;
  -- tira o que ocupa o mesmo lugar (outra camisa, outra calça, outro acessório do mesmo tipo)
  update public.inventory v set equipped = false
    from public.items i
   where v.item_id = i.id and v.user_id = me and v.equipped and i.id <> it.id
     and i.kind = it.kind and (it.kind <> 'accessory' or i.accessory_type = it.accessory_type);
  update public.inventory set equipped = true where user_id = me and item_id = it.id;
end $$;

create or replace function public.unequip_item(p_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.inventory set equipped = false where user_id = auth.uid() and item_id = p_id;
$$;

-- O que uma pessoa está vestindo (cores + camisa + calça + acessórios), para desenhar o avatar 3D
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
                                                                  'mesh_path', i.mesh_path, 'image_path', i.image_path))
                               from public.inventory v join public.items i on i.id = v.item_id
                              where v.user_id = p.id and v.equipped and not i.deleted and i.kind = 'accessory'), '[]'::jsonb)
  )
  from public.profiles p where p.id = p_user;
$$;

-- ============ OWOS DIÁRIAS ============
-- 25 Owos a cada 24 horas (para todo mundo poder comprar alguma coisa).
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me     uuid := auth.uid();
  last_t timestamptz;
  bal    bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  select last_daily, balance into last_t, bal from public.profiles where id = me for update;
  if last_t is null or now() - last_t >= interval '24 hours' then
    update public.profiles set balance = balance + 25, last_daily = now() where id = me returning balance into bal;
    return jsonb_build_object('claimed', true, 'amount', 25, 'balance', bal, 'next_at', now() + interval '24 hours');
  end if;
  return jsonb_build_object('claimed', false, 'amount', 0, 'balance', bal, 'next_at', last_t + interval '24 hours');
end $$;

-- ============ SÓ A CONTA OFICIAL (admin) ============
-- Tirar qualquer item do catálogo (some do catálogo, dos inventários e dos avatares).
create or replace function public.delete_item(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  update public.items set deleted = true where id = p_id;
end $$;

-- Dar (ou tirar, com valor negativo) Owos de alguém, pelo nome de usuário.
create or replace function public.admin_grant(p_username text, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  if p_amount not between -1000000 and 1000000 then raise exception 'invalid amount'; end if;
  update public.profiles set balance = greatest(balance + p_amount, 0) where lower(username) = lower(p_username);
  if not found then raise exception 'no such user'; end if;
end $$;

-- ============ PERMISSÕES (só quem está logado) ============
do $$
declare f text;
begin
  foreach f in array array[
    'catalog_list(text, text, integer, integer)', 'get_item(bigint)', 'my_inventory(text)', 'my_creations(text)',
    'create_item(text, text, text, integer, text, text, integer)', 'set_item_price(bigint, integer)',
    'buy_item(bigint)', 'equip_item(bigint)', 'unequip_item(bigint)', 'avatar_look(uuid)', 'claim_daily()',
    'delete_item(bigint)', 'admin_grant(text, integer)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============ CONTA ADMIN ============
-- Rode SEPARADO, depois de criar a conta "Owoxy" no site (confira que é a sua!):
--   update public.profiles set is_admin = true where lower(username) = 'owoxy';
