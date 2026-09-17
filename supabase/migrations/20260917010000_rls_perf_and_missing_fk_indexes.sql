-- Производительность базы: два реальных узких места, найденных через
-- Supabase Performance Advisor.
--
-- 1) 21 RLS-политика вызывала auth.uid() заново на каждой строке вместо
--    одного раза на весь запрос (Postgres не кэширует голый auth.uid()
--    внутри политики — только обёрнутый в (select ...) подзапрос).
--    На таблицах, которые грузятся почти на каждой странице
--    (tilda_orders, order_status_history, product_stickers) это самая
--    весомая причина медленной загрузки при росте числа заказов.
--    Логика доступа не меняется — кто что видит/может менять, то же
--    самое, только считается один раз вместо N.
--
-- 2) 34 внешних ключа без индекса — без него Postgres сканирует всю
--    таблицу там, где мог бы найти строку мгновенно.
--
-- Осознанно не трогаем: "unused index" (25 шт) — при таком объёме
-- трафика статистика использования ещё не показательна, удалять рано;
-- "multiple permissive policies" — требует пересмотра логики политик
-- по каждой таблице отдельно, не механическая правка, оставляем на
-- отдельный заход.

-- ── 1. RLS: auth.uid() -> (select auth.uid()) ──────────────────────

alter policy users_self on users
  using ((select auth.uid()) = id);

alter policy courier_orders on tilda_orders
  using (
    (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'courier'::user_role))
    and (assigned_courier_id = (select auth.uid()) or status = 'confirmed'::delivery_status)
  );

alter policy warehouse_orders on tilda_orders
  using (
    (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'warehouse'::user_role))
    and status = any (array['confirmed'::delivery_status,'courier_assigned'::delivery_status,'assembling'::delivery_status,'assembled'::delivery_status,'in_transit'::delivery_status])
  );

alter policy manager_orders on tilda_orders
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy courier_orders_update on tilda_orders
  using (
    (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'courier'::user_role))
    and (assigned_courier_id = (select auth.uid()) or (status = 'confirmed'::delivery_status and assigned_courier_id is null))
  )
  with check (
    (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'courier'::user_role))
    and assigned_courier_id = (select auth.uid())
  );

alter policy warehouse_orders_update on tilda_orders
  using (
    (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'warehouse'::user_role))
    and status = any (array['confirmed'::delivery_status,'courier_assigned'::delivery_status,'assembling'::delivery_status,'assembled'::delivery_status,'in_transit'::delivery_status])
  )
  with check (
    (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'warehouse'::user_role))
    and status = any (array['confirmed'::delivery_status,'courier_assigned'::delivery_status,'assembling'::delivery_status,'assembled'::delivery_status,'in_transit'::delivery_status])
  );

alter policy history_courier on order_status_history
  using (
    exists (select 1 from tilda_orders o where o.id = order_status_history.order_id
      and (o.assigned_courier_id = (select auth.uid()) or o.status = 'confirmed'::delivery_status))
  );

alter policy history_courier_insert on order_status_history
  with check (
    exists (select 1 from tilda_orders o where o.id = order_status_history.order_id
      and o.assigned_courier_id = (select auth.uid()))
  );

alter policy history_manager on order_status_history
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy history_warehouse on order_status_history
  using (
    exists (
      select 1 from tilda_orders o join users u on u.id = (select auth.uid())
      where o.id = order_status_history.order_id
        and u.role = 'warehouse'::user_role
        and o.status = any (array['confirmed'::delivery_status,'courier_assigned'::delivery_status,'assembling'::delivery_status,'assembled'::delivery_status,'in_transit'::delivery_status])
    )
  );

alter policy history_warehouse_insert on order_status_history
  with check (
    exists (
      select 1 from tilda_orders o join users u on u.id = (select auth.uid())
      where o.id = order_status_history.order_id
        and u.role = 'warehouse'::user_role
        and o.status = any (array['confirmed'::delivery_status,'courier_assigned'::delivery_status,'assembling'::delivery_status,'assembled'::delivery_status,'in_transit'::delivery_status])
    )
  );

alter policy staff_read_product_availability on product_availability
  using (exists (select 1 from users where users.id = (select auth.uid())));

alter policy staff_read_product_stickers on product_stickers
  using (exists (select 1 from users where users.id = (select auth.uid())));

alter policy manager_all_categories on subscription_categories
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy manager_all_tiers on subscription_frequency_tiers
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy manager_all_subscription_history on subscription_history
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy manager_all_lines on subscription_lines
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy manager_all_occurrences on subscription_occurrences
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy manager_all_plans on subscription_plans
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy manager_all_subscriptions on subscriptions
  using (exists (select 1 from users where users.id = (select auth.uid()) and users.role = 'manager'::user_role));

alter policy warehouse_own_florist_flower_requests on florist_flower_requests
  using (is_warehouse() and requested_by = (select auth.uid()))
  with check (is_warehouse() and requested_by = (select auth.uid()));

-- ── 2. Индексы на внешние ключи ─────────────────────────────────────

create index if not exists idx_batches_created_by on batches(created_by);
create index if not exists idx_batches_purchase_order_id on batches(purchase_order_id);
create index if not exists idx_batches_supplier_id on batches(supplier_id);
create index if not exists idx_business_expenses_created_by on business_expenses(created_by);
create index if not exists idx_company_registration_requests_company_id on company_registration_requests(company_id);
create index if not exists idx_customer_activity_log_actor_user_id on customer_activity_log(actor_user_id);
create index if not exists idx_florist_flower_requests_product_sticker_id on florist_flower_requests(product_sticker_id);
create index if not exists idx_florist_flower_requests_requested_by on florist_flower_requests(requested_by);
create index if not exists idx_inventory_checks_batch_id on inventory_checks(batch_id);
create index if not exists idx_inventory_checks_created_by on inventory_checks(created_by);
create index if not exists idx_invoice_drafts_confirmed_by on invoice_drafts(confirmed_by);
create index if not exists idx_invoice_drafts_supplier_id on invoice_drafts(supplier_id);
create index if not exists idx_order_status_history_changed_by on order_status_history(changed_by);
create index if not exists idx_product_availability_updated_by on product_availability(updated_by);
create index if not exists idx_product_name_aliases_product_sticker_id on product_name_aliases(product_sticker_id);
create index if not exists idx_product_recipes_ingredient_sticker_id on product_recipes(ingredient_sticker_id);
create index if not exists idx_purchase_order_items_product_sticker_id on purchase_order_items(product_sticker_id);
create index if not exists idx_purchase_order_items_purchase_order_id on purchase_order_items(purchase_order_id);
create index if not exists idx_purchase_orders_created_by on purchase_orders(created_by);
create index if not exists idx_purchase_orders_supplier_id on purchase_orders(supplier_id);
create index if not exists idx_stock_movements_created_by on stock_movements(created_by);
create index if not exists idx_subscription_history_changed_by on subscription_history(changed_by);
create index if not exists idx_subscription_lines_category_id on subscription_lines(category_id);
create index if not exists idx_subscription_occurrences_order_id on subscription_occurrences(order_id);
create index if not exists idx_subscriptions_company_id on subscriptions(company_id);
create index if not exists idx_subscriptions_line_id on subscriptions(line_id);
create index if not exists idx_tilda_orders_company_id on tilda_orders(company_id);
create index if not exists idx_tilda_orders_confirmed_by on tilda_orders(confirmed_by);
create index if not exists idx_tilda_orders_problem_reported_by on tilda_orders(problem_reported_by);
create index if not exists idx_tilda_orders_subscription_id on tilda_orders(subscription_id);
create index if not exists idx_vanvliet_purchases_ordered_by on vanvliet_purchases(ordered_by);
create index if not exists idx_vanvliet_purchases_product_sticker_id on vanvliet_purchases(product_sticker_id);
create index if not exists idx_write_offs_batch_id on write_offs(batch_id);
create index if not exists idx_write_offs_created_by on write_offs(created_by);
