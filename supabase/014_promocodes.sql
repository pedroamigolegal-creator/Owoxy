-- Owoxy 014: Promo Codes (todos usam; a conta Owoxy cria), 100 Owos para toda conta nova,
-- e o "daily" passa a ser só do Premium (100 Owos por dia). Rode depois da 013.

-- ===== contas novas ganham 100 Owos =====
alter table public.profiles alter column balance set default 100;

-- ===== daily: só Premium =====
create or replace function public.claim_daily()
returns jsonb language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); last_t timestamptz; prem timestamptz; bal bigint;
begin
  if me is null then raise exception 'not signed in'; end if;
  select last_daily, premium_until, balance into last_t, prem, bal from public.profiles where id = me for update;
  if prem is null or prem <= now() then raise exception 'premium only'; end if;
  if last_t is null or now() - last_t >= interval '24 hours' then
    update public.profiles set balance = balance + 100, last_daily = now() where id = me returning balance into bal;
    return jsonb_build_object('claimed', true, 'amount', 100, 'balance', bal, 'next_at', now() + interval '24 hours');
  end if;
  return jsonb_build_object('claimed', false, 'amount', 0, 'balance', bal, 'next_at', last_t + interval '24 hours');
end $$;

-- ===== promo codes =====
create table if not exists public.promo_codes (
  code       text primary key check (code ~ '^[A-Za-z0-9_-]{3,30}$'),
  owos       bigint not null check (owos between 1 and 1000000000),
  max_uses   integer check (max_uses is null or max_uses >= 1),
  uses       integer not null default 0,
  expires_at timestamptz,
  active     boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists promo_codes_lower_key on public.promo_codes (lower(code));
create table if not exists public.promo_redemptions (
  code        text not null references public.promo_codes(code) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  primary key (code, user_id)
);
create table if not exists public.promo_attempts (user_id uuid not null references public.profiles(id) on delete cascade, at timestamptz not null default now());
alter table public.promo_codes enable row level security;
alter table public.promo_redemptions enable row level security;
alter table public.promo_attempts enable row level security;
revoke all on public.promo_codes, public.promo_redemptions, public.promo_attempts from anon, authenticated;

create or replace function public.redeem_promo(p_code text)
returns table (code text, owos bigint, balance bigint)
language plpgsql security definer set search_path = public as $$
declare me uuid := auth.uid(); c public.promo_codes; bal bigint; typed text := btrim(coalesce(p_code, ''));
begin
  if me is null then raise exception 'not signed in'; end if;
  if (select count(*) from public.promo_attempts a where a.user_id = me and a.at > now() - interval '1 minute') >= 8 then raise exception 'too many attempts'; end if;
  select * into c from public.promo_codes pc where lower(pc.code) = lower(typed) and pc.active for update;
  if not found then
    insert into public.promo_attempts (user_id) values (me);
    raise exception 'invalid code';
  end if;
  if c.expires_at is not null and c.expires_at <= now() then raise exception 'code expired'; end if;
  if exists (select 1 from public.promo_redemptions r where r.code = c.code and r.user_id = me) then raise exception 'code already redeemed'; end if;
  if c.max_uses is not null and c.uses >= c.max_uses then raise exception 'code fully used'; end if;
  insert into public.promo_redemptions (code, user_id) values (c.code, me);
  update public.promo_codes set uses = uses + 1 where promo_codes.code = c.code;
  update public.profiles set balance = profiles.balance + c.owos where id = me returning profiles.balance into bal;
  code := c.code; owos := c.owos; balance := bal;
  return next;
end $$;

create or replace function public.admin_create_promo(p_code text, p_owos bigint, p_max_uses integer default null, p_days integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare cd text := btrim(coalesce(p_code, ''));
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  if cd !~ '^[A-Za-z0-9_-]{3,30}$' then raise exception 'invalid code format'; end if;
  if p_owos is null or p_owos not between 1 and 1000000000 then raise exception 'invalid amount'; end if;
  if p_max_uses is not null and p_max_uses < 1 then raise exception 'invalid uses'; end if;
  if exists (select 1 from public.promo_codes where lower(promo_codes.code) = lower(cd)) then raise exception 'code exists'; end if;
  insert into public.promo_codes (code, owos, max_uses, expires_at, created_by)
  values (cd, p_owos, p_max_uses, case when coalesce(p_days, 0) > 0 then now() + make_interval(days => p_days) end, auth.uid());
end $$;

create or replace function public.admin_list_promos()
returns table (code text, owos bigint, max_uses integer, uses integer, expires_at timestamptz, active boolean, created_at timestamptz)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  return query select c.code, c.owos, c.max_uses, c.uses, c.expires_at, c.active, c.created_at from public.promo_codes c order by c.created_at desc limit 200;
end $$;

create or replace function public.admin_set_promo_active(p_code text, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public._is_admin() then raise exception 'admins only'; end if;
  update public.promo_codes set active = coalesce(p_active, true) where lower(promo_codes.code) = lower(p_code);
  if not found then raise exception 'invalid code'; end if;
end $$;

do $$ declare f text; begin
  foreach f in array array['claim_daily()', 'redeem_promo(text)', 'admin_create_promo(text, bigint, integer, integer)', 'admin_list_promos()', 'admin_set_promo_active(text, boolean)'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
notify pgrst, 'reload schema';
