-- Owoxy 012: novo tipo de UGC "Neck" (pescoço) e até 3 chapéus (Hats) vestidos ao mesmo tempo.
-- Rode depois da 011.

do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'public.items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%''hat''%' loop
    execute format('alter table public.items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.items add constraint items_accessory_type_check check (accessory_type is null or accessory_type in ('hat', 'hair', 'face', 'back', 'gear', 'neck'));

do $$ declare def text; begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_item' limit 1;
  if def is null or position('''gear''' in def) = 0 then raise exception 'run migration 011 first'; end if;
  def := replace(def, '(''hat'', ''hair'', ''face'', ''back'', ''gear'')', '(''hat'', ''hair'', ''face'', ''back'', ''gear'', ''neck'')');
  execute def;
end $$;

-- quando cada item foi vestido (para trocar o mais antigo quando passa de 3 chapéus)
alter table public.inventory add column if not exists equipped_at timestamptz;

create or replace function public.equip_item(p_id bigint)
returns void language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); it public.items;
begin
  if me is null then raise exception 'not signed in'; end if;
  select i.* into it from public.items i
   where i.id = p_id and not i.deleted
     and exists (select 1 from public.inventory v where v.user_id = me and v.item_id = i.id);
  if not found then raise exception 'you do not own this item'; end if;

  if it.kind = 'accessory' and it.accessory_type = 'hat' then
    -- até 3 chapéus: se já há 3 vestidos, tira o mais antigo (ficam só os 2 mais novos + este)
    update public.inventory v set equipped = false
     where v.user_id = me and v.item_id in (
       select v2.item_id from public.inventory v2 join public.items i on i.id = v2.item_id
        where v2.user_id = me and v2.equipped and i.kind = 'accessory' and i.accessory_type = 'hat' and i.id <> it.id
        order by v2.equipped_at desc nulls last offset 2);
  else
    -- tira o que ocupa o mesmo lugar (outra camisa, outra calça, outro acessório do mesmo tipo)
    update public.inventory v set equipped = false
      from public.items i
     where v.item_id = i.id and v.user_id = me and v.equipped and i.id <> it.id
       and i.kind = it.kind and (it.kind <> 'accessory' or i.accessory_type = it.accessory_type);
  end if;
  update public.inventory set equipped = true, equipped_at = now() where user_id = me and item_id = it.id;
end $$;

revoke all on function public.equip_item(bigint) from public, anon;
grant execute on function public.equip_item(bigint) to authenticated;
notify pgrst, 'reload schema';
