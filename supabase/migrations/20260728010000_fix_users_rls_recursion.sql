-- Fix: "infinite recursion detected in policy for relation users" (42P17)
-- The manager_all_users policy queried `users` from within a policy ON `users`,
-- which Postgres can't expand. A SECURITY DEFINER helper breaks the self-reference
-- because it bypasses RLS internally.

create or replace function public.is_manager()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from users where id = auth.uid() and role = 'manager'
  );
$$;

drop policy if exists "manager_all_users" on users;
create policy "manager_all_users" on users
  for all using (is_manager());
