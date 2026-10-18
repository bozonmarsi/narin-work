-- Uzavreni verejne funkce sync_product_price (2026-10-19).
--
-- !!! Aplikovat AZ PO tom, co catalog-sync dokazatelne bezi:
--       select at, ok, items, error from catalog_sync_log order by id desc limit 3;
--     (aspon jeden radek ok = true). Pred tim by se ceny pro sklad prestaly
--     aktualizovat, protoze prohlizece uz je prepisovat nesmi.
--
-- Skripty na strankach katalogu volaji sync_product_price s anonymnim klicem
-- (jakykoli navstevnik mohl poslat libovolnou cenu). Funkce zustava (stranky ji
-- volaji, nesmi spadnout), ale:
--   * zbozi, ktere zna catalog_prices (cena primo z Tilda), ignoruje;
--   * u zbozi, ktere catalog_prices jeste nezna (nova polozka), jen vyplni
--     prazdnou cenu, nikdy neprepise existujici.
create or replace function public.sync_product_price(p_product_name text, p_price numeric, p_order_unit_size integer)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if p_price is null or p_price <= 0 then
    return;
  end if;

  if exists (select 1 from catalog_prices cp where cp.active and cp.title = p_product_name) then
    return;
  end if;

  update product_stickers
     set price = p_price,
         order_unit_size = coalesce(nullif(p_order_unit_size, 0), order_unit_size)
   where decode_html_entities(product_name) = p_product_name
     and price is null;
end;
$function$;
