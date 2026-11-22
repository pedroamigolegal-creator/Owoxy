-- Owoxy 007: lista "Created Accounts" (só a conta admin "Owoxy" enxerga).
-- Rode no Supabase: SQL Editor > New query > cole tudo > Run. Pode rodar de novo sem problema.
-- Senhas NÃO aparecem aqui de propósito: o Supabase só guarda um hash que não dá para desfazer,
-- e guardar senhas em texto puro deixaria todas as contas vulneráveis.

create or replace function public.admin_list_accounts(p_limit int default 100, p_offset int default 0, p_query text default null)
returns table (id uuid, username text, created_at timestamptz, gender text, balance bigint, verified boolean, premium_until timestamptz, total bigint)
language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  return query
    select p.id, p.username, p.created_at, p.gender, p.balance, p.verified, p.premium_until,
           count(*) over () as total
      from public.profiles p
     where p_query is null or p_query = '' or p.username ilike '%' || replace(replace(p_query, '%', ''), '_', '') || '%'
     order by p.created_at desc
     limit greatest(1, least(coalesce(p_limit, 100), 500)) offset greatest(0, coalesce(p_offset, 0));
end $$;
revoke all on function public.admin_list_accounts(int, int, text) from public, anon;
grant execute on function public.admin_list_accounts(int, int, text) to authenticated;

notify pgrst, 'reload schema';
