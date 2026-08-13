-- The Tilda catalog page (public, anonymous visitors) needs to read which
-- products are available today, but product_availability's RLS restricts
-- SELECT to staff only. Rather than opening the table itself to anon (which
-- would also expose updated_by staff IDs), expose just the product names
-- through a narrow SECURITY DEFINER function.
create or replace function public.get_available_products()
returns table(product_name text)
language sql
security definer
set search_path = public
stable
as $$
  select product_name from product_availability;
$$;

grant execute on function public.get_available_products() to anon, authenticated;
