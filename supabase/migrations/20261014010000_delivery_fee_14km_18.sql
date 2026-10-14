-- Dostavka: do 14 km edinaya cena (159 + 80 servisnyj sbor = 239 Kc), dalshe
-- +18 Kc za kazhdyj nachatyj km, dalshe 40 km kurerom ne vozim.
-- Te zhe chisla v skripte tilda/blocks/delivery-distance-pricing.html (CFG) -
-- menyat vsegda vmeste.
CREATE OR REPLACE FUNCTION public.expected_delivery_fee(p_lat double precision, p_lng double precision)
 RETURNS TABLE(km numeric, fee numeric, too_far boolean)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  c_base constant numeric := 159;
  c_service constant numeric := 80;
  c_radius constant numeric := 14;
  c_per_km constant numeric := 18;
  c_max constant numeric := 40;
  w record;
  v_km numeric;
BEGIN
  SELECT lat, lng INTO w FROM warehouse_location WHERE id = true;
  v_km := 2 * 6371 * asin(sqrt(
    power(sin(radians(p_lat - w.lat) / 2), 2) +
    cos(radians(w.lat)) * cos(radians(p_lat)) * power(sin(radians(p_lng - w.lng) / 2), 2)
  ));
  km := round(v_km, 1);
  too_far := v_km > c_max;
  fee := c_base + c_service + CASE WHEN v_km > c_radius THEN ceil(v_km - c_radius) * c_per_km ELSE 0 END;
  RETURN NEXT;
END;
$function$;
