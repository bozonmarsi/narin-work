-- Jediny duveryhodny zdroj cen: catalog_prices (2026-10-19).
--
-- Dosud se cena do product_stickers.price dostavala z prohlizecu navstevniku
-- (skript na strance katalogu cte cenu z karty a vola verejnou funkci
-- sync_product_price s anonymnim klicem) - tzn. cenu mohl prepsat kdokoli
-- a pokryti bylo jen u zbozi s radkem v product_stickers.
--
-- Ted:
--   * catalog_prices = kopie cen primo z Tilda (cena za baleni + kusu v baleni),
--     plni ji vyhradne server (edge funkce catalog-sync kazdou hodinu a
--     checkout-order) pres apply_catalog_snapshot;
--   * apply_catalog_snapshot zaroven aktualizuje product_stickers.price /
--     order_unit_size (to, co vidi sklad v aplikaci) a tilda_uid;
--   * ochrany: snapshot < 30 polozek, neplatne radky nebo vypadnuti > 30 %
--     aktivnich polozek se odmitne (necela/rozbita odpoved Tilda);
--   * historie zmen cen, log synchronizaci, upozorneni do Telegramu po 3
--     neuspesnych bězich za sebou a kdyz data zestarla > 6 hodin.
--
-- Verejna funkce sync_product_price zatim zustava beze zmeny - uzavre se az
-- samostatnou migraci 20261019010000 poté, co catalog-sync dokazatelne bezi.

-- 1. tabulky
create table if not exists catalog_prices (
  uid text primary key,
  title text not null,
  price numeric not null check (price > 0),     -- cena za baleni
  portion int not null default 0,               -- kusu v baleni; 0 = cena je za kus
  active boolean not null default true,
  updated_at timestamptz not null default now(),   -- posledni zmena ceny/baleni
  seen_at timestamptz not null default now()       -- posledni potvrzeni z Tilda
);
alter table catalog_prices enable row level security;
drop policy if exists "manager_read_catalog_prices" on catalog_prices;
create policy "manager_read_catalog_prices" on catalog_prices for select using (is_manager());

create table if not exists catalog_price_history (
  id bigserial primary key,
  at timestamptz not null default now(),
  uid text not null,
  title text not null,
  old_price numeric,
  new_price numeric,
  old_portion int,
  new_portion int
);
create index if not exists catalog_price_history_uid_idx on catalog_price_history (uid, at desc);
alter table catalog_price_history enable row level security;
drop policy if exists "manager_read_catalog_price_history" on catalog_price_history;
create policy "manager_read_catalog_price_history" on catalog_price_history for select using (is_manager());

create table if not exists catalog_sync_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  ok boolean not null,
  items int,
  error text,
  summary jsonb,
  alerted boolean not null default false
);
alter table catalog_sync_log enable row level security;
drop policy if exists "manager_read_catalog_sync_log" on catalog_sync_log;
create policy "manager_read_catalog_sync_log" on catalog_sync_log for select using (is_manager());

-- 2. prijem snapshotu z Tilda (vola jen service_role)
-- p_items: [{"uid":"123","title":"Dahlia bilá","price":520,"portion":10}, ...]
create or replace function public.apply_catalog_snapshot(p_items jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_n int;
  v_active int;
  v_missing int;
  v_history int := 0;
  v_deactivated int := 0;
  v_stickers int := 0;
  v_now timestamptz := now();
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'snapshot_not_array';
  end if;
  v_n := jsonb_array_length(p_items);
  if v_n < 30 then
    raise exception 'snapshot_too_small:%', v_n;
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(uid text, title text, price numeric, portion int)
     where x.uid is null or btrim(x.uid) = '' or x.title is null or btrim(x.title) = ''
        or x.price is null or x.price <= 0 or coalesce(x.portion, 0) < 0
  ) then
    raise exception 'snapshot_invalid_rows';
  end if;

  select count(*) into v_active from catalog_prices where active;
  select count(*) into v_missing
    from catalog_prices cp
   where cp.active
     and not exists (
       select 1 from jsonb_to_recordset(p_items) as x(uid text) where x.uid = cp.uid
     );
  if v_active > 0 and v_missing > greatest(10, v_active * 0.3) then
    raise exception 'snapshot_drops_too_many:%/%', v_missing, v_active;
  end if;

  -- historie zmen (nove polozky, zmena ceny nebo baleni, znovuaktivace)
  insert into catalog_price_history (uid, title, old_price, new_price, old_portion, new_portion)
  select x.uid, x.title, cp.price, x.price, cp.portion, coalesce(x.portion, 0)
    from jsonb_to_recordset(p_items) as x(uid text, title text, price numeric, portion int)
    left join catalog_prices cp on cp.uid = x.uid
   where cp.uid is null
      or cp.price is distinct from x.price
      or cp.portion is distinct from coalesce(x.portion, 0)
      or cp.active = false;
  get diagnostics v_history = row_count;

  insert into catalog_prices (uid, title, price, portion, active, updated_at, seen_at)
  select x.uid, x.title, x.price, coalesce(x.portion, 0), true, v_now, v_now
    from jsonb_to_recordset(p_items) as x(uid text, title text, price numeric, portion int)
  on conflict (uid) do update
    set title = excluded.title,
        price = excluded.price,
        portion = excluded.portion,
        active = true,
        updated_at = case
          when catalog_prices.price is distinct from excluded.price
            or catalog_prices.portion is distinct from excluded.portion
            or catalog_prices.active = false
          then v_now else catalog_prices.updated_at end,
        seen_at = v_now;

  -- co v Tilda uz neni, se vypne (nejde objednat); kopie zustava pro historii
  update catalog_prices set active = false
   where active and seen_at < v_now;
  get diagnostics v_deactivated = row_count;

  -- sklad v aplikaci: product_stickers dostane stejne ceny (po jmenu, jako dosud)
  update product_stickers ps
     set price = cp.price,
         order_unit_size = case when cp.portion > 1 then cp.portion else ps.order_unit_size end,
         tilda_uid = coalesce(ps.tilda_uid, cp.uid)
    from catalog_prices cp
   where cp.active
     and decode_html_entities(ps.product_name) = cp.title
     and (
       ps.price is distinct from cp.price
       or (cp.portion > 1 and ps.order_unit_size is distinct from cp.portion)
       or ps.tilda_uid is null
     );
  get diagnostics v_stickers = row_count;

  return jsonb_build_object(
    'items', v_n,
    'changed', v_history,
    'deactivated', v_deactivated,
    'stickers_updated', v_stickers
  );
end;
$function$;

-- 3. log synchronizace + upozorneni
create or replace function public.record_catalog_sync(p_ok boolean, p_items int, p_error text, p_summary jsonb default null)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_id bigint;
  v_failed int;
  v_already boolean;
begin
  insert into catalog_sync_log (ok, items, error, summary)
  values (p_ok, p_items, left(p_error, 500), p_summary)
  returning id into v_id;

  delete from catalog_sync_log where at < now() - interval '30 days';

  if not p_ok then
    select count(*) filter (where not l.ok), bool_or(l.alerted)
      into v_failed, v_already
      from (select ok, alerted from catalog_sync_log where error is distinct from 'stale_alert' order by id desc limit 3) l;
    if v_failed = 3 and not coalesce(v_already, false) then
      update catalog_sync_log set alerted = true where id = v_id;
      perform notify_telegram_role('manager',
        '⚠️ <b>Цены каталога не обновляются</b>: 3 синхронизации с Tilda подряд неудачны. ' ||
        'Последняя ошибка: ' || coalesce(left(p_error, 200), '?') ||
        '. Цены остаются прежними; оплата депозитом и склад продолжают работать по последним данным.');
    end if;
  end if;
end;
$function$;

-- каждый час: если данные не подтверждались из Tilda > 6 часов (например,
-- не работает расписание или секрет), один раз в сутки сообщаем менеджерам
create or replace function public.check_catalog_freshness()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_seen timestamptz;
  v_last_alert timestamptz;
begin
  select max(seen_at) into v_seen from catalog_prices;
  if v_seen is null or v_seen > now() - interval '6 hours' then
    return;
  end if;
  select max(at) into v_last_alert from catalog_sync_log where error = 'stale_alert';
  if v_last_alert is not null and v_last_alert > now() - interval '24 hours' then
    return;
  end if;
  insert into catalog_sync_log (ok, items, error) values (false, 0, 'stale_alert');
  perform notify_telegram_role('manager',
    '⚠️ <b>Цены каталога устарели</b>: последнее подтверждение из Tilda было ' ||
    to_char(v_seen at time zone 'Europe/Prague', 'DD.MM HH24:MI') ||
    '. Проверьте расписание catalog-sync и секрет catalog_sync_secret.');
end;
$function$;

revoke all on function public.apply_catalog_snapshot(jsonb) from public, anon, authenticated;
revoke all on function public.record_catalog_sync(boolean, int, text, jsonb) from public, anon, authenticated;
revoke all on function public.check_catalog_freshness() from public, anon, authenticated;
grant execute on function public.apply_catalog_snapshot(jsonb) to service_role;
grant execute on function public.record_catalog_sync(boolean, int, text, jsonb) to service_role;
grant execute on function public.check_catalog_freshness() to service_role;

-- 4. pocatecni naplneni (cena z Tilda 2026-10-19, velikost baleni z product_stickers;
--    sety a prislusenstvi bez baleni = 0). Prvni beh catalog-sync hodnoty potvrdi/opravi.
select public.apply_catalog_snapshot((
  select jsonb_agg(jsonb_build_object(
    'uid', v.uid, 'title', v.title, 'price', v.price,
    'portion', coalesce((
      select case when ps.order_unit_size > 1 then ps.order_unit_size else 0 end
        from product_stickers ps
       where decode_html_entities(ps.product_name) = v.title
       limit 1
    ), 0)
  ))
  from (values
  ('984843790224', 'SET Jarní', 2400),
  ('875039819364', 'SET Květnový', 2170),
  ('533579528704', 'SET Slunečný', 1680),
  ('433899122534', 'SET Bilý', 1800),
  ('548551220284', 'Pivoňka Sarah Bernard', 400),
  ('308716797514', 'Pivoňka bilá', 960),
  ('850474817824', 'Dahlia wizzard', 490),
  ('751727463504', 'Moluccella', 400),
  ('171700842964', 'Dahlia bordo', 470),
  ('636097479844', 'Dahlia sunny boy', 470),
  ('713650839914', 'Dahlia queen', 500),
  ('353040386354', 'Dahlia caitlins', 470),
  ('814897482974', 'Dahlia bilá', 520),
  ('965689494084', 'Pivoňka Coral Charm', 2150),
  ('814926079464', 'Pivoňka Red Charm', 1100),
  ('617986607354', 'Tulipan růžový', 2100),
  ('433298943584', 'Amarylis ferrari', 380),
  ('570577802934', 'Tulipan bilý', 1550),
  ('886242981034', 'Růže Bombastik spray', 500),
  ('633022464054', 'Růže pink express', 1980),
  ('665941409814', 'Ranunculus bílý', 850),
  ('457705847914', 'Gerbera Nola', 530),
  ('352589235374', 'Gerbera cream springs', 530),
  ('617464236744', 'Gerbera Claudemir', 450),
  ('996371485614', 'Gerbera Mayball', 450),
  ('745136945574', 'Gerbera Magic', 450),
  ('503976290794', 'Gerbera Stich', 520),
  ('179778298294', 'Ranunculus růžový', 890),
  ('758183765004', 'Matthiola růžová', 620),
  ('137499940354', 'Matthiola bilá', 620),
  ('740404252364', 'Hyacint modrý', 350),
  ('648914168684', 'Kala Zazu', 640),
  ('588331244394', 'Kala picasso', 640),
  ('161047847644', 'Kala bilá', 1210),
  ('842171548494', 'Karafiát bilý (spray)', 290),
  ('784481462704', 'Karafiát burgundi', 720),
  ('475251790614', 'Karafiat Kino', 580),
  ('640521210934', 'Karafiát růžový', 580),
  ('705294410954', 'Karafiat červený (mini)', 290),
  ('635994147514', 'Karafiat Kiwi', 480),
  ('377551986494', 'Allium fialový', 420),
  ('583912072744', 'Delphinium modrý', 820),
  ('110124804274', 'Hortenzie růžová', 720),
  ('217656894354', 'Hortenzie světle-modrá', 720),
  ('220149625414', 'Hortenezie bilá', 720),
  ('972738031644', 'Slunečnice', 610),
  ('407631212824', 'Heřmánek', 990),
  ('198666273724', 'Fressia červená', 390),
  ('711090832174', 'Fressia žlutá', 390),
  ('793586616424', 'Freesia bilá', 390),
  ('716497270774', 'Chryzantéma zelená', 920),
  ('127894464754', 'Eukalyptus', 250),
  ('486735324254', 'Eustoma bilá', 870),
  ('617387331994', 'Eustoma fialová', 920),
  ('778723261544', 'Lilie růžová mix', 1240),
  ('632485843534', 'Leucadendron', 490),
  ('780332703944', 'Eryngium', 480),
  ('940778073744', 'Leucospermum', 520),
  ('713060849694', 'Anturium', 400),
  ('179280018114', 'Protea', 810),
  ('158611577824', 'Pohlednice Modrá', 40),
  ('339564285354', 'Pohlednice Růžová', 40),
  ('177311464364', 'Kenzan 5.5cm x 3.8cm', 340),
  ('115899135364', 'Kenzan Ø 6сm', 300),
  ('986779895264', 'Čistící kartáček pro kenzan', 160),
  ('776369898234', 'Rovnátko na jehly pro kenzan', 100),
  ('743428321314', 'Vaza 7.5x16 cm pro kenzan', 290),
  ('978807406694', 'Přečepelové nůžky', 110),
  ('420306073564', 'Jednočepelové nůžky', 110),
  ('378944187904', 'Kovka 1', 320)
  ) as v(uid, title, price)
));

-- 5. rozvrh: kazdou hodinu catalog-sync, kazdou hodinu kontrola cerstvosti.
-- Tajny klic: Supabase Vault 'catalog_sync_secret' (stejna hodnota je v
-- promenne prostredi funkce CATALOG_SYNC_SECRET) - zaklada se zvlast, do
-- tohoto souboru se nedostava. Bez klice funkce vrati 401 a po 6 hodinach
-- prijde upozorneni z check_catalog_freshness.
select cron.schedule(
  'catalog-sync',
  '17 * * * *',
  $$
  select net.http_post(
    url := 'https://wqburlamuipxmenqsjnx.supabase.co/functions/v1/catalog-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'catalog_sync_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
select cron.schedule('catalog-freshness', '47 * * * *', $$select public.check_catalog_freshness()$$);
