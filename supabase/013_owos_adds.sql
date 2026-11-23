-- Owoxy 013: "Owos Adds" — só a conta Owoxy (admin) adiciona Owos para si ou presenteia outra pessoa pelo nome de usuário.
-- Rode depois da 012.

create table if not exists public.owos_grants (
  id         bigint generated always as identity primary key,
  admin_id   uuid not null references public.profiles(id) on delete cascade,
  target_id  uuid not null references public.profiles(id) on delete cascade,
  amount     bigint not null check (amount > 0),
  created_at timestamptz not null default now()
);
alter table public.owos_grants enable row level security;
revoke all on public.owos_grants from anon, authenticated;

-- p_username vazio = para você mesmo. Devolve o saldo novo de quem recebeu.
create or replace function public.admin_add_owos(p_username text, p_amount bigint)
returns table (username text, balance bigint, is_self boolean)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); t public.profiles; nm text := btrim(coalesce(p_username, ''));
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  if p_amount is null or p_amount < 1 or p_amount > 1000000000000 then raise exception 'invalid amount'; end if;
  if nm = '' then
    select * into t from public.profiles where id = me;
  else
    select * into t from public.profiles where lower(profiles.username) = lower(nm) and not public._blocked(profiles);
    if not found then raise exception 'user not found'; end if;
  end if;
  update public.profiles set balance = profiles.balance + p_amount where id = t.id returning profiles.balance into balance;
  insert into public.owos_grants (admin_id, target_id, amount) values (me, t.id, p_amount);
  username := t.username; is_self := (t.id = me);
  return next;
end $$;

revoke all on function public.admin_add_owos(text, bigint) from public, anon;
grant execute on function public.admin_add_owos(text, bigint) to authenticated;
notify pgrst, 'reload schema';
