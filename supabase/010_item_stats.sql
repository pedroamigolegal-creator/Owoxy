-- Owoxy 010: Sales (quantas vezes o item foi vendido) e Owners (quantas pessoas têm o item).
-- Rode depois da 009.

alter table public.items add column if not exists sales integer not null default 0;

-- itens que já existem: conta como venda cada cópia que está com alguém que não é o criador
update public.items i set sales = coalesce((select count(*) from public.inventory v where v.item_id = i.id and v.user_id <> i.creator_id), 0);

-- compra na loja = cópia nova no inventário de quem não é o criador
create or replace function public._count_sale_insert() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.items set sales = sales + 1 where id = new.item_id and creator_id <> new.user_id;
  return new;
end $$;
drop trigger if exists inventory_count_sale on public.inventory;
create trigger inventory_count_sale after insert on public.inventory for each row execute function public._count_sale_insert();

-- compra de revenda = a cópia muda de dono
create or replace function public._count_sale_transfer() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is distinct from old.user_id then update public.items set sales = sales + 1 where id = new.item_id; end if;
  return new;
end $$;
drop trigger if exists inventory_count_resale on public.inventory;
create trigger inventory_count_resale after update of user_id on public.inventory for each row execute function public._count_sale_transfer();

-- números de vários itens de uma vez (catálogo) ou de um só (página do item)
create or replace function public.items_stats(p_ids bigint[])
returns table (id bigint, sales integer, owners bigint)
language sql security definer stable set search_path = public as $$
  select i.id, i.sales, (select count(*) from public.inventory v where v.item_id = i.id)
  from public.items i where i.id = any(coalesce(p_ids, '{}')) and not i.deleted;
$$;

revoke all on function public.items_stats(bigint[]) from public, anon;
grant execute on function public.items_stats(bigint[]) to authenticated;
revoke all on function public._count_sale_insert(), public._count_sale_transfer() from public, anon, authenticated;
notify pgrst, 'reload schema';
