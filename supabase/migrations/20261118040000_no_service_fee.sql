-- Сервисный сбор 80 Kč отменён (2026-11-18): курьер = только доставка 159 Kč (+ км за 14 км),
-- самовывоз бесплатно. Проверка недоплаты доставки считает так же, как сайт.
create or replace function public.expected_delivery_fee(p_lat double precision, p_lng double precision)
returns table(km numeric, fee numeric, too_far boolean)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  c_base constant numeric := 159;
  c_service constant numeric := 0;
  c_radius constant numeric := 14;
  c_per_km constant numeric := 18;
  c_max constant numeric := 40;
  w record;
  v_km numeric;
begin
  select lat, lng into w from warehouse_location where id = true;
  v_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat - w.lat) / 2), 2) +
    cos(radians(w.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - w.lng) / 2), 2)
  ));
  km := round(v_km, 1);
  too_far := v_km > c_max;
  fee := c_base + c_service + case when v_km > c_radius then ceil(v_km - c_radius) * c_per_km else 0 end;
  return next;
end;
$function$;

do $$
declare d text;
begin
  d := pg_get_functiondef('public.tg_check_delivery_fee'::regproc);
  if d like '%THEN 80 ELSE 0%' then
    execute replace(d, 'THEN 80 ELSE 0', 'THEN 0 ELSE 0');
  end if;
end $$;
