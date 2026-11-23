-- Owoxy 011: novo tipo de UGC "Gear". Quem veste um Gear levanta o braço direito apontando para a frente.
-- Rode depois da 010.

-- o tipo de acessório passa a aceitar 'gear'
do $$ declare c record; begin
  for c in select conname from pg_constraint
            where conrelid = 'public.items'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%''hat''%' loop
    execute format('alter table public.items drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.items add constraint items_accessory_type_check check (accessory_type is null or accessory_type in ('hat', 'hair', 'face', 'back', 'gear'));

-- create_item: mesma função de hoje, só com 'gear' na lista de tipos válidos
do $$ declare def text; begin
  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_item' limit 1;
  if def is null then raise exception 'create_item not found: run migrations 004 to 010 first'; end if;
  def := replace(def, '(''hat'', ''hair'', ''face'', ''back'')', '(''hat'', ''hair'', ''face'', ''back'', ''gear'')');
  execute def;
end $$;

notify pgrst, 'reload schema';
