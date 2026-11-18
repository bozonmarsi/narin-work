-- Kovka 1 и Kovka 2: новые композиции, фото заменены (в Tilda уже заменены 2026-11-18).
-- Kovky постоянно меняются, поэтому номера не растут: Kovka 1 и Kovka 2 просто получают новые фото.
update product_stickers set image_url = 'https://static.tildacdn.com/tila3164-3039-4663-b635-323461636536/kovka-1.webp' where product_name = 'Kovka 1' and category = 'banky';
update product_stickers set image_url = 'https://static.tildacdn.com/tila3065-6136-4561-b339-663134363030/kovka-2.webp' where product_name = 'Kovka 2' and category = 'banky';
