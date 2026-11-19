-- Owoxy: esquema do banco (Supabase). Rode tudo isto uma vez no SQL Editor do Supabase.

-- 1) Perfis (1 por conta). Os dados de login (senha) ficam no Supabase Auth, nunca aqui.
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text not null,
  birthday     date not null,
  gender       text check (gender in ('male', 'female')),
  balance      bigint not null default 0,                       -- moeda do site
  avatar_model text not null default 'assets/noob/scene.gltf',  -- todo mundo começa com o noob
  created_at   timestamptz not null default now()
);

-- nome de usuário único, sem diferenciar maiúsculas/minúsculas
create unique index if not exists profiles_username_key on public.profiles (lower(username));

-- 2) Segurança: ninguém altera perfil/saldo pelo navegador (só o servidor).
alter table public.profiles enable row level security;

drop policy if exists "signed-in users can read profiles" on public.profiles;
create policy "signed-in users can read profiles" on public.profiles
  for select to authenticated using (true);
-- (sem policies de insert/update/delete de propósito)

-- Aniversário, gênero e saldo são privados: outros usuários só enxergam estas colunas.
revoke all on public.profiles from anon, authenticated;
grant select (id, username, avatar_model, created_at) on public.profiles to authenticated;

-- 3) Cria o perfil automaticamente quando a conta é criada (e revalida tudo no servidor).
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
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4) Funções que o site chama.
-- O nome de usuário está livre? (pode ser chamada antes de criar a conta)
create or replace function public.username_available(name text)
returns boolean language sql security definer stable set search_path = public as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;
grant execute on function public.username_available(text) to anon, authenticated;

-- Meu perfil completo (inclui saldo e aniversário, só do próprio usuário).
create or replace function public.my_profile()
returns public.profiles language sql security definer stable set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;
