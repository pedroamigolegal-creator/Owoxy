-- Owoxy 009: presença (Online / In game), seguidores, comunidades (Groups do Roblox).
-- Rode depois da 008.

alter table public.profiles add column if not exists last_seen timestamptz;
alter table public.profiles add column if not exists last_game text;
alter table public.profiles add column if not exists last_game_at timestamptz;

-- batimento: o site chama a cada ~60 s. p_game = jogo em que está agora (ou null).
create or replace function public.touch_presence(p_game text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  if p_game is not null and p_game not in ('ttos', 'nds') then p_game := null; end if;
  update public.profiles set last_seen = now(),
         last_game = p_game, last_game_at = case when p_game is null then null else now() end
   where id = auth.uid();
end $$;

-- status de uma pessoa: 'online' (visto < 3 min), 'ingame', 'offline'. Respeita bloqueio/ban.
create or replace function public._presence_of(p public.profiles)
returns text language sql stable as $$
  select case when p.last_seen is null or p.last_seen < now() - interval '3 minutes' then 'offline'
              when p.last_game is not null and p.last_game_at > now() - interval '3 minutes' then 'ingame'
              else 'online' end
$$;

create or replace function public.friends_presence()
returns table (id uuid, status text, game text, last_seen timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, public._presence_of(p), case when public._presence_of(p) = 'ingame' then p.last_game end, p.last_seen
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where f.status = 'accepted' and auth.uid() in (f.requester, f.addressee) and not public._blocked(p);
$$;

create or replace function public.user_presence(p_user uuid)
returns table (status text, game text, last_seen timestamptz)
language sql security definer stable set search_path = public as $$
  select public._presence_of(p), case when public._presence_of(p) = 'ingame' then p.last_game end, p.last_seen
  from public.profiles p where p.id = p_user and not public._blocked(p);
$$;

-- ============ seguidores ============
create table if not exists public.follows (
  follower  uuid not null references public.profiles(id) on delete cascade,
  following uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower, following),
  check (follower <> following)
);
alter table public.follows enable row level security;

create or replace function public.toggle_follow(p_target uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if me = p_target then raise exception 'cannot follow yourself'; end if;
  if not exists (select 1 from public.profiles p where p.id = p_target and not public._blocked(p)) then raise exception 'user not found'; end if;
  if exists (select 1 from public.follows where follower = me and following = p_target) then
    delete from public.follows where follower = me and following = p_target; return false;
  end if;
  insert into public.follows (follower, following) values (me, p_target); return true;
end $$;

create or replace function public.social_counts(p_user uuid)
returns table (friends bigint, followers bigint, following bigint, i_follow boolean)
language sql security definer stable set search_path = public as $$
  select (select count(*) from public.friendships f join public.profiles o on o.id = case when f.requester = p_user then f.addressee else f.requester end
           where f.status = 'accepted' and p_user in (f.requester, f.addressee) and not public._blocked(o)),
         (select count(*) from public.follows x join public.profiles o on o.id = x.follower where x.following = p_user and not public._blocked(o)),
         (select count(*) from public.follows x join public.profiles o on o.id = x.following where x.follower = p_user and not public._blocked(o)),
         exists (select 1 from public.follows where follower = auth.uid() and following = p_user);
$$;

-- ============ comunidades ============
create table if not exists public.communities (
  id          bigint generated always as identity primary key,
  name        text not null check (char_length(name) between 3 and 30),
  description text not null default '' check (char_length(description) <= 500),
  owner_id    uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create unique index if not exists communities_name_key on public.communities (lower(name));
create table if not exists public.community_members (
  community_id bigint not null references public.communities(id) on delete cascade,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  role         text not null default 'Member' check (role in ('Owner', 'Member')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user_idx on public.community_members (user_id);
alter table public.communities enable row level security;
alter table public.community_members enable row level security;

-- criar custa 100 Owos (como no Roblox); quem é Premium cria de graça? não: o preço é igual para todos.
create or replace function public.create_community(p_name text, p_description text default '')
returns bigint language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); n text := btrim(coalesce(p_name, '')); cid bigint; bal bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  if n !~ '^[A-Za-z0-9 _.-]{3,30}$' then raise exception 'invalid community name'; end if;
  if exists (select 1 from public.communities where lower(name) = lower(n)) then raise exception 'community name taken'; end if;
  if (select count(*) from public.communities where owner_id = me) >= 10 then raise exception 'too many communities'; end if;
  select balance into bal from public.profiles where id = me for update;
  if bal < 100 then raise exception 'not enough Owos'; end if;
  update public.profiles set balance = balance - 100 where id = me;
  insert into public.communities (name, description, owner_id) values (n, left(coalesce(p_description, ''), 500), me) returning id into cid;
  insert into public.community_members (community_id, user_id, role) values (cid, me, 'Owner');
  return cid;
end $$;

create or replace function public.search_communities(p_q text default null, p_limit integer default 30)
returns table (id bigint, name text, description text, owner_name text, members bigint, joined boolean)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.description, o.username,
         (select count(*) from public.community_members m where m.community_id = c.id),
         exists (select 1 from public.community_members m where m.community_id = c.id and m.user_id = auth.uid())
  from public.communities c join public.profiles o on o.id = c.owner_id
  where p_q is null or p_q = '' or c.name ilike '%' || replace(replace(p_q, '%', ''), '_', '') || '%'
  order by 5 desc, c.created_at desc limit least(coalesce(p_limit, 30), 100);
$$;

create or replace function public.my_communities(p_user uuid default null)
returns table (id bigint, name text, members bigint, role text)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, (select count(*) from public.community_members x where x.community_id = c.id), m.role
  from public.community_members m join public.communities c on c.id = m.community_id
  where m.user_id = coalesce(p_user, auth.uid()) order by c.name;
$$;

create or replace function public.get_community(p_id bigint)
returns table (id bigint, name text, description text, owner_id uuid, owner_name text, created_at timestamptz, members bigint, my_role text)
language sql security definer stable set search_path = public as $$
  select c.id, c.name, c.description, c.owner_id, o.username, c.created_at,
         (select count(*) from public.community_members x where x.community_id = c.id),
         (select m.role from public.community_members m where m.community_id = c.id and m.user_id = auth.uid())
  from public.communities c join public.profiles o on o.id = c.owner_id where c.id = p_id;
$$;

create or replace function public.community_members_list(p_id bigint, p_limit integer default 50, p_offset integer default 0)
returns table (id uuid, username text, role text, verified boolean, avatar_colors jsonb)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, m.role, p.verified, p.avatar_colors
  from public.community_members m join public.profiles p on p.id = m.user_id
  where m.community_id = p_id and not public._blocked(p)
  order by (m.role = 'Owner') desc, m.joined_at limit least(coalesce(p_limit, 50), 200) offset greatest(coalesce(p_offset, 0), 0);
$$;

create or replace function public.join_community(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.communities where id = p_id) then raise exception 'community not found'; end if;
  if (select count(*) from public.community_members where user_id = auth.uid()) >= 100 then raise exception 'too many communities'; end if;
  insert into public.community_members (community_id, user_id) values (p_id, auth.uid()) on conflict do nothing;
end $$;

create or replace function public.leave_community(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.communities where id = p_id and owner_id = auth.uid()) then raise exception 'owner cannot leave'; end if;
  delete from public.community_members where community_id = p_id and user_id = auth.uid();
end $$;

create or replace function public.update_community(p_id bigint, p_description text)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.communities set description = left(coalesce(p_description, ''), 500) where id = p_id and owner_id = auth.uid();
  if not found then raise exception 'not the owner'; end if;
end $$;

-- dono apaga a comunidade; admin (Owoxy) também pode
create or replace function public.delete_community(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.communities where id = p_id and (owner_id = auth.uid() or public._is_admin());
  if not found then raise exception 'not the owner'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array[
    'touch_presence(text)', 'friends_presence()', 'user_presence(uuid)', 'toggle_follow(uuid)', 'social_counts(uuid)',
    'create_community(text, text)', 'search_communities(text, integer)', 'my_communities(uuid)', 'get_community(bigint)',
    'community_members_list(bigint, integer, integer)', 'join_community(bigint)', 'leave_community(bigint)', 'update_community(bigint, text)', 'delete_community(bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
revoke all on function public._presence_of(public.profiles) from public, anon, authenticated;
notify pgrst, 'reload schema';
