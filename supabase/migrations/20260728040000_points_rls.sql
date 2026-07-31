-- Points tables (from the loyalty-program work in another chat) have RLS
-- enabled with no policies for our staff roles — same blocker we already
-- hit on tilda_orders and product_stickers. Manager needs full access to
-- manually award/deduct points from the new points management page.

alter table "Tilda points" enable row level security;

drop policy if exists "manager_all_tilda_points" on "Tilda points";
create policy "manager_all_tilda_points" on "Tilda points"
  for all using (is_manager());

alter table points_transactions enable row level security;

drop policy if exists "manager_all_points_transactions" on points_transactions;
create policy "manager_all_points_transactions" on points_transactions
  for all using (is_manager());
