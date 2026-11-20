-- Owoxy: migração 3 (perfil "About", amizades, busca, mensagens + mensagem de boas-vindas).
-- Rode uma vez no SQL Editor do Supabase (depois do schema.sql e do 002).

-- ============ PERFIL ============
alter table public.profiles add column if not exists about text not null default '';

create or replace function public.get_profile(p_name text)
returns table (id uuid, username text, avatar_model text, avatar_colors jsonb, verified boolean, about text, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_model, p.avatar_colors, p.verified, p.about, p.created_at
  from public.profiles p
  where lower(p.username) = lower(p_name)
  limit 1;
$$;

create or replace function public.save_about(p_text text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  update public.profiles set about = left(trim(coalesce(p_text, '')), 1000) where id = auth.uid();
end $$;

-- ============ BUSCA ============
create or replace function public.search_users(p_q text)
returns table (id uuid, username text, avatar_colors jsonb, verified boolean)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_colors, p.verified
  from public.profiles p
  where length(trim(p_q)) between 1 and 20
    and strpos(lower(p.username), lower(trim(p_q))) > 0
  order by (lower(p.username) = lower(trim(p_q))) desc,
           (strpos(lower(p.username), lower(trim(p_q))) = 1) desc,
           p.verified desc, p.username
  limit 30;
$$;

-- ============ AMIZADES ============
create table if not exists public.friendships (
  id         bigint generated always as identity primary key,
  requester  uuid not null references public.profiles(id) on delete cascade,
  addressee  uuid not null references public.profiles(id) on delete cascade,
  status     text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  check (requester <> addressee)
);
-- só uma relação por par de pessoas (em qualquer direção)
create unique index if not exists friendships_pair_key
  on public.friendships (least(requester, addressee), greatest(requester, addressee));

alter table public.friendships enable row level security;   -- sem policies: o navegador só acessa pelas funções abaixo
revoke all on public.friendships from anon, authenticated;

-- 'self' | 'none' | 'sent' (eu pedi) | 'received' (me pediram) | 'friends'
create or replace function public.friend_status(p_target uuid)
returns text language plpgsql security definer stable set search_path = public as $$
declare me uuid := auth.uid(); f public.friendships;
begin
  if me is null then return 'none'; end if;
  if me = p_target then return 'self'; end if;
  select * into f from public.friendships
   where least(requester, addressee) = least(me, p_target) and greatest(requester, addressee) = greatest(me, p_target);
  if not found then return 'none'; end if;
  if f.status = 'accepted' then return 'friends'; end if;
  if f.requester = me then return 'sent'; end if;
  return 'received';
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
    -- a outra pessoa já tinha me pedido: vira amizade
    if f.status = 'pending' and f.addressee = me then
      update public.friendships set status = 'accepted' where id = f.id;
      return 'friends';
    end if;
    return public.friend_status(p_target);
  end if;
  if (select count(*) from public.friendships where requester = me and status = 'pending') >= 100 then
    raise exception 'too many pending requests';
  end if;
  insert into public.friendships (requester, addressee) values (me, p_target);
  return 'sent';
end $$;

create or replace function public.respond_friend_request(p_from_user uuid, p_accept boolean)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_accept then
    update public.friendships set status = 'accepted'
     where requester = p_from_user and addressee = me and status = 'pending';
  else
    delete from public.friendships
     where requester = p_from_user and addressee = me and status = 'pending';
  end if;
end $$;

-- desfazer amizade ou cancelar um pedido que eu mandei
create or replace function public.remove_friend(p_target uuid)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  delete from public.friendships
   where least(requester, addressee) = least(me, p_target) and greatest(requester, addressee) = greatest(me, p_target)
     and (status = 'accepted' or requester = me);
end $$;

create or replace function public.list_friends(p_target uuid)
returns table (id uuid, username text, avatar_colors jsonb, verified boolean)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_colors, p.verified
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = p_target then f.addressee else f.requester end
  where f.status = 'accepted' and p_target in (f.requester, f.addressee)
  order by p.username;
$$;

create or replace function public.friend_requests()
returns table (id uuid, username text, avatar_colors jsonb, verified boolean, created_at timestamptz)
language sql security definer stable set search_path = public as $$
  select p.id, p.username, p.avatar_colors, p.verified, f.created_at
  from public.friendships f
  join public.profiles p on p.id = f.requester
  where f.addressee = auth.uid() and f.status = 'pending'
  order by f.created_at desc;
$$;

-- ============ MENSAGENS ============
create table if not exists public.messages (
  id           bigint generated always as identity primary key,
  sender_id    uuid references public.profiles(id) on delete set null,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  is_system    boolean not null default false,   -- true = mensagem oficial do "Owoxy"
  subject      text not null default '',
  body         text not null,
  created_at   timestamptz not null default now(),
  read_at      timestamptz
);
create index if not exists messages_recipient_idx on public.messages (recipient_id, created_at desc);

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;

create or replace function public.inbox()
returns table (id bigint, sender_id uuid, sender_username text, sender_verified boolean, is_system boolean,
               subject text, body text, created_at timestamptz, is_read boolean)
language sql security definer stable set search_path = public as $$
  select m.id, m.sender_id,
         case when m.is_system then 'Owoxy' else coalesce(p.username, '[deleted]') end,
         m.is_system or coalesce(p.verified, false),
         m.is_system, m.subject, m.body, m.created_at, m.read_at is not null
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.recipient_id = auth.uid()
  order by m.created_at desc
  limit 200;
$$;

create or replace function public.unread_count()
returns integer language sql security definer stable set search_path = public as $$
  select count(*)::integer from public.messages where recipient_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_read(p_msg_id bigint)
returns void language sql security definer set search_path = public as $$
  update public.messages set read_at = now() where id = p_msg_id and recipient_id = auth.uid() and read_at is null;
$$;

-- só dá para mandar mensagem para amigos (evita spam)
create or replace function public.send_message(p_to_user uuid, p_subject text, p_body text)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 1000 then raise exception 'invalid message'; end if;
  if length(coalesce(p_subject, '')) > 100 then raise exception 'subject too long'; end if;
  if public.friend_status(p_to_user) <> 'friends' then raise exception 'you can only message friends'; end if;
  if (select count(*) from public.messages where sender_id = me and created_at > now() - interval '1 minute') >= 10 then
    raise exception 'slow down';
  end if;
  insert into public.messages (sender_id, recipient_id, subject, body)
  values (me, p_to_user, trim(coalesce(p_subject, '')), trim(p_body));
end $$;

-- ============ PERMISSÕES DAS FUNÇÕES (só quem está logado) ============
do $$
declare f text;
begin
  foreach f in array array[
    'get_profile(text)', 'save_about(text)', 'search_users(text)',
    'friend_status(uuid)', 'send_friend_request(uuid)', 'respond_friend_request(uuid, boolean)',
    'remove_friend(uuid)', 'list_friends(uuid)', 'friend_requests()',
    'inbox()', 'unread_count()', 'mark_read(bigint)', 'send_message(uuid, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ============ BOAS-VINDAS ============
-- Texto da mensagem de boas-vindas (pode editar aqui; usa o nome de usuário no lugar do %s).
create or replace function public.welcome_body(p_username text)
returns text language sql immutable as $$
  select format(E'Hi %s!\n\nWelcome to Owoxy, and thank you for signing up! We are really happy to have you here.\n\nYour avatar is ready: visit the Avatar page to change its colors, search for people and add them as friends.\n\nMore features are on the way. Have fun!\n\n- The Owoxy Team', p_username);
$$;

-- Recria o gatilho de criação de conta: cria o perfil e manda a mensagem de boas-vindas.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  uname text := new.raw_user_meta_data ->> 'username';
  bday  date := (new.raw_user_meta_data ->> 'birthday')::date;
  g     text := nullif(new.raw_user_meta_data ->> 'gender', '');
begin
  if uname is null or uname !~ '^[A-Za-z0-9_]{3,20}$' or uname ~ '^_|_$' or uname ~ '_.*_' then
    raise exception 'invalid username';
  end if;
  if bday is null or bday > (current_date - interval '13 years') then
    raise exception 'invalid birthday';
  end if;
  insert into public.profiles (id, username, birthday, gender) values (new.id, uname, bday, g);
  insert into public.messages (recipient_id, is_system, subject, body)
  values (new.id, true, 'Welcome to Owoxy!', public.welcome_body(uname));
  return new;
end $$;

-- Quem já tem conta também recebe a mensagem (uma vez só).
insert into public.messages (recipient_id, is_system, subject, body)
select p.id, true, 'Welcome to Owoxy!', public.welcome_body(p.username)
from public.profiles p
where not exists (
  select 1 from public.messages m where m.recipient_id = p.id and m.is_system and m.subject = 'Welcome to Owoxy!'
);
