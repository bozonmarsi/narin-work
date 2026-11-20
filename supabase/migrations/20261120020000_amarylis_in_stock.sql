-- Amarylis ve vosku je skladem: 8 ks. Uz ne "pod objednavku" - web pise Dorucime dnes
-- a sklad se odecita s kazdou objednavkou jako u ostatnich kusu.
update product_stickers
   set quantity = 8, special_order = false
 where tilda_uid = '612327651384';
