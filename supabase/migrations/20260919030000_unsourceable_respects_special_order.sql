-- Кнопка "🚚 Под заказ" у менеджера должна спасать товар от скрытия —
-- менеджер лично берёт на себя обещание привезти (описано на сайте
-- отдельным бейджем "Doručíme <дата +2 раб.дня>"), даже если у нас 0
-- и Van Vliet не подтверждён. Раньше get_unsourceable_products() этот
-- флаг вообще не проверяла и прятала товар независимо от него.
CREATE OR REPLACE FUNCTION public.get_unsourceable_products()
RETURNS TABLE(product_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT product_name FROM product_stickers
  WHERE category = 'ohapka'
    AND archived = false
    AND special_order = false
    AND COALESCE(quantity, 0) <= 0
    AND COALESCE(vanvliet_in_stock, false) = false;
$$;
