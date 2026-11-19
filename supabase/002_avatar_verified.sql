-- Owoxy: migração 2 (cores do avatar + selo de verificado).
-- Rode uma vez no SQL Editor do Supabase (depois do schema.sql).

alter table public.profiles add column if not exists avatar_colors jsonb;
alter table public.profiles add column if not exists verified boolean not null default false;

-- Estas colunas são públicas (aparecem no perfil de qualquer pessoa).
grant select (avatar_colors, verified) on public.profiles to authenticated;

-- Meu perfil completo (recriada para incluir as colunas novas).
create or replace function public.my_profile()
returns public.profiles language sql security definer stable set search_path = public as $$
  select * from public.profiles where id = auth.uid();
$$;
grant execute on function public.my_profile() to authenticated;

-- Salvar as cores do avatar. O servidor valida o formato; o navegador não escreve na tabela direto.
create or replace function public.save_avatar(colors jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(colors) <> 'object' then raise exception 'invalid colors'; end if;
  for k in select jsonb_object_keys(colors) loop
    if k not in ('skin', 'torso', 'legs') then raise exception 'invalid part %', k; end if;
    if (colors ->> k) !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid color'; end if;
  end loop;
  update public.profiles set avatar_colors = colors where id = auth.uid();
end $$;
revoke all on function public.save_avatar(jsonb) from public, anon;
grant execute on function public.save_avatar(jsonb) to authenticated;

-- Dar o selo de verificado (só você, pelo SQL Editor; o site não consegue):
--   update public.profiles set verified = true where lower(username) = 'owoxy';
