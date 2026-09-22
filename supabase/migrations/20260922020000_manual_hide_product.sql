-- До сих пор карточка скрывалась с сайта только автоматически (нет
-- своего остатка и нет подтверждения от Van Vliet) — у менеджера не
-- было способа спрятать товар вручную по любой другой причине (плохое
-- качество партии, временно не хотим показывать и т.п.), кроме как
-- обнулить остаток, что портит складской учёт.
ALTER TABLE product_stickers ADD COLUMN IF NOT EXISTS manually_hidden boolean NOT NULL DEFAULT false;

-- Ручное скрытие работает для любой категории (не только ohapka) и
-- имеет приоритет над всем остальным — если менеджер явно скрыл товар,
-- его не должен обратно показывать никакой автоматический расчёт.
CREATE OR REPLACE FUNCTION public.get_unsourceable_products()
RETURNS TABLE(product_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT product_name FROM product_stickers
  WHERE archived = false
    AND (
      manually_hidden = true
      OR (
        category = 'ohapka'
        AND special_order = false
        AND COALESCE(quantity, 0) <= 0
        AND COALESCE(vanvliet_in_stock, false) = false
      )
    );
$$;
