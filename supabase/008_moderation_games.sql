-- Owoxy 008: moderação (banir/desbanir, deletar/restaurar contas), denúncias e dados dos jogos (curtidas, favoritos, visitas).
-- Rode no Supabase: SQL Editor > New query > cole tudo > Run. Rode DEPOIS do 007. Pode rodar de novo sem problema.
-- Só a conta admin ("Owoxy") consegue banir/deletar. O ban usa auth.users.banned_until do próprio Supabase:
-- a pessoa não consegue mais entrar e as sessões abertas são derrubadas.

-- ============ colunas ============
alter table public.profiles add column if not exists banned_at  timestamptz;
alter table public.profiles add column if not exists ban_until  timestamptz;   -- null com banned_at = permanente
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.my_profile()
returns public.profiles language sql security definer stable set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

-- ban/exclusão em vigor?
create or replace function public._blocked(p public.profiles)
returns boolean language sql immutable as $$
  select p.deleted_at is not null or (p.banned_at is not null and (p.ban_until is null or p.ban_until > now()));
$$;
revoke all on function public._blocked(public.profiles) from public, anon, authenticated;

-- ============ buscas não mostram contas banidas/deletadas ============
create or replace function public.search_users(p_q text)
returns table (id uuid, username text, avatar_colors jsonb, verified boolean)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_colors, p.verified
  from public.profiles p
  where length(trim(p_q)) between 1 and 20
    and strpos(lower(p.username), lower(trim(p_q))) > 0
    and not public._blocked(p)
  order by (lower(p.username) = lower(trim(p_q))) desc,
           (strpos(lower(p.username), lower(trim(p_q))) = 1) desc,
           p.verified desc, p.username
  limit 30;
$$;
create or replace function public.get_profile(p_name text)
returns table (id uuid, username text, avatar_model text, avatar_colors jsonb, verified boolean, about text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_model, p.avatar_colors, p.verified, p.about, p.created_at
  from public.profiles p
  where lower(p.username) = lower(p_name) and not public._blocked(p)
  limit 1;
$$;
create or replace function public.list_friends(p_target uuid)
returns table (id uuid, username text, avatar_colors jsonb, verified boolean)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_colors, p.verified
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = p_target then f.addressee else f.requester end
  where f.status = 'accepted' and p_target in (f.requester, f.addressee) and not public._blocked(p)
  order by p.username;
$$;
create or replace function public.friend_requests()
returns table (id uuid, username text, avatar_colors jsonb, verified boolean, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_colors, p.verified, f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester
  where f.addressee = auth.uid() and f.status = 'pending' and not public._blocked(p)
  order by f.created_at desc;
$$;

-- ============ moderação (só admin) ============
create or replace function public._moderation_target(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  if p_user = auth.uid() then raise exception 'cannot moderate yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_user) then raise exception 'no such user'; end if;
  if (select is_admin from public.profiles where id = p_user) then raise exception 'cannot moderate an admin'; end if;
end $$;
revoke all on function public._moderation_target(uuid) from public, anon, authenticated;

-- aplica no Supabase Auth: bloqueado = não entra mais e as sessões caem
create or replace function public._sync_auth_block(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.profiles;
begin
  select * into p from public.profiles where id = p_user;
  if p.deleted_at is not null then
    update auth.users set banned_until = 'infinity' where id = p_user;
  elsif p.banned_at is not null then
    update auth.users set banned_until = coalesce(p.ban_until, 'infinity') where id = p_user;
  else
    update auth.users set banned_until = null where id = p_user;
  end if;
  if public._blocked(p) then delete from auth.sessions where user_id = p_user; end if;
end $$;
revoke all on function public._sync_auth_block(uuid) from public, anon, authenticated;

create or replace function public.admin_set_ban(p_user uuid, p_banned boolean, p_reason text default null, p_days integer default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._moderation_target(p_user);
  if p_banned then
    if p_days is not null and (p_days < 0 or p_days > 3650) then raise exception 'invalid days'; end if;
    update public.profiles
       set banned_at = now(),
           ban_until = case when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days) end,
           ban_reason = nullif(left(trim(coalesce(p_reason, '')), 200), '')
     where id = p_user;
  else
    update public.profiles set banned_at = null, ban_until = null, ban_reason = null where id = p_user;
  end if;
  perform public._sync_auth_block(p_user);
end $$;

create or replace function public.admin_set_deleted(p_user uuid, p_deleted boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._moderation_target(p_user);
  update public.profiles set deleted_at = case when p_deleted then now() end where id = p_user;
  perform public._sync_auth_block(p_user);
end $$;

-- lista de contas (substitui a do 007: agora com situação)
drop function if exists public.admin_list_accounts(int, int, text);
create or replace function public.admin_list_accounts(p_limit int default 100, p_offset int default 0, p_query text default null, p_status text default 'all')
returns table (id uuid, username text, created_at timestamptz, gender text, balance bigint, verified boolean, premium_until timestamptz,
               is_admin boolean, banned_at timestamptz, ban_until timestamptz, ban_reason text, deleted_at timestamptz, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, p.username, p.created_at, p.gender, p.balance, p.verified, p.premium_until,
           p.is_admin, p.banned_at, p.ban_until, p.ban_reason, p.deleted_at, count(*) over () as total
      from public.profiles p
     where (p_query is null or p_query = '' or p.username ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%')
       and case coalesce(p_status, 'all')
             when 'deleted' then p.deleted_at is not null
             when 'banned'  then p.deleted_at is null and public._blocked(p)
             when 'active'  then not public._blocked(p)
             else true end
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;

-- ============ denúncias ============
create table if not exists public.reports (
  id         bigserial primary key,
  reporter   uuid not null references public.profiles(id) on delete cascade,
  target     uuid not null references public.profiles(id) on delete cascade,
  reason     text not null,
  details    text,
  context    text,                                    -- ex.: "Talk To Others, server 2"
  status     text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  handled_by uuid,
  handled_at timestamptz
);
alter table public.reports enable row level security;
revoke all on public.reports from anon, authenticated;
revoke all on sequence public.reports_id_seq from anon, authenticated;

create or replace function public.submit_report(p_target uuid, p_reason text, p_details text default null, p_context text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_target = auth.uid() then raise exception 'cannot report yourself'; end if;
  if p_reason not in ('Inappropriate chat', 'Harassment or bullying', 'Scam or phishing', 'Cheating or exploiting', 'Inappropriate username', 'Other') then raise exception 'invalid reason'; end if;
  if not exists (select 1 from public.profiles where id = p_target) then raise exception 'no such user'; end if;
  if (select count(*) from public.reports where reporter = auth.uid() and created_at > now() - interval '1 day') >= 10 then raise exception 'too many reports'; end if;
  if exists (select 1 from public.reports where reporter = auth.uid() and target = p_target and status = 'open' and created_at > now() - interval '1 hour') then return; end if;
  insert into public.reports (reporter, target, reason, details, context)
  values (auth.uid(), p_target, p_reason, nullif(left(trim(coalesce(p_details, '')), 500), ''), nullif(left(trim(coalesce(p_context, '')), 80), ''));
end $$;

create or replace function public.admin_list_reports(p_status text default 'open', p_limit integer default 100)
returns table (id bigint, reporter_name text, target_id uuid, target_name text, reason text, details text, context text, status text,
               created_at timestamptz, target_banned boolean, target_deleted boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  return query
    select r.id, rp.username, r.target, tp.username, r.reason, r.details, r.context, r.status, r.created_at,
           (tp.banned_at is not null and public._blocked(tp)), tp.deleted_at is not null
      from public.reports r
      join public.profiles rp on rp.id = r.reporter
      join public.profiles tp on tp.id = r.target
     where p_status = 'all' or r.status = p_status
     order by r.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 300));
end $$;

create or replace function public.admin_close_report(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  update public.reports set status = 'closed', handled_by = auth.uid(), handled_at = now() where id = p_id;
end $$;

-- ============ jogos: curtidas, favoritos, visitas ============
create table if not exists public.game_votes (user_id uuid not null references public.profiles(id) on delete cascade, game text not null, vote smallint not null check (vote in (-1, 1)), primary key (user_id, game));
create table if not exists public.game_favs  (user_id uuid not null references public.profiles(id) on delete cascade, game text not null, primary key (user_id, game));
create table if not exists public.game_stats (game text primary key, visits bigint not null default 0);
alter table public.game_votes enable row level security; alter table public.game_favs enable row level security; alter table public.game_stats enable row level security;
revoke all on public.game_votes, public.game_favs, public.game_stats from anon, authenticated;

create or replace function public._check_game(p_game text) returns void language plpgsql immutable as $$
begin if p_game not in ('ttos', 'nds') then raise exception 'unknown game'; end if; end $$;

create or replace function public.game_info(p_game text)
returns table (likes bigint, dislikes bigint, favorites bigint, visits bigint, my_vote integer, my_fav boolean)
language plpgsql security definer stable set search_path = public as $$
begin
  perform public._check_game(p_game);
  return query select
    (select count(*) from public.game_votes where game = p_game and vote = 1),
    (select count(*) from public.game_votes where game = p_game and vote = -1),
    (select count(*) from public.game_favs  where game = p_game),
    coalesce((select s.visits from public.game_stats s where s.game = p_game), 0),
    coalesce((select v.vote::int from public.game_votes v where v.game = p_game and v.user_id = auth.uid()), 0),
    exists (select 1 from public.game_favs f where f.game = p_game and f.user_id = auth.uid());
end $$;

create or replace function public.vote_game(p_game text, p_vote integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._check_game(p_game);
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if p_vote not in (-1, 0, 1) then raise exception 'invalid vote'; end if;
  if p_vote = 0 then delete from public.game_votes where user_id = auth.uid() and game = p_game;
  else insert into public.game_votes (user_id, game, vote) values (auth.uid(), p_game, p_vote)
       on conflict (user_id, game) do update set vote = excluded.vote; end if;
end $$;

create or replace function public.toggle_fav_game(p_game text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  perform public._check_game(p_game);
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if exists (select 1 from public.game_favs where user_id = auth.uid() and game = p_game) then
    delete from public.game_favs where user_id = auth.uid() and game = p_game; return false;
  end if;
  insert into public.game_favs (user_id, game) values (auth.uid(), p_game);
  return true;
end $$;

create or replace function public.my_fav_games()
returns table (game text) language sql security definer stable set search_path = public as $$
  select game from public.game_favs where user_id = auth.uid();
$$;

create or replace function public.record_visit(p_game text)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public._check_game(p_game);
  if auth.uid() is null then return; end if;
  insert into public.game_stats (game, visits) values (p_game, 1) on conflict (game) do update set visits = public.game_stats.visits + 1;
end $$;

-- ============ permissões: só quem está logado chama as funções públicas ============
do $$
declare f text;
begin
  foreach f in array array[
    'my_profile()', 'search_users(text)', 'get_profile(text)', 'list_friends(uuid)', 'friend_requests()',
    'admin_set_ban(uuid, boolean, text, integer)', 'admin_set_deleted(uuid, boolean)', 'admin_list_accounts(int, int, text, text)',
    'submit_report(uuid, text, text, text)', 'admin_list_reports(text, integer)', 'admin_close_report(bigint)',
    'game_info(text)', 'vote_game(text, integer)', 'toggle_fav_game(text)', 'my_fav_games()', 'record_visit(text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
