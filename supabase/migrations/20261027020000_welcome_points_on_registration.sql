-- 150 welcome points are credited when the customer registers (a row appears in "Tilda points"),
-- so they can be used on the very first order. Before, they came with the first order.
-- The first-order trigger (welcome_points_trigger) already skips customers who have a welcome entry,
-- so nobody gets them twice.

create or replace function public.grant_welcome_on_registration()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if coalesce(new.email, '') like '%@%'
     and not exists (select 1 from points_transactions where lower(user_email) = lower(new.email) and type = 'welcome') then
    insert into points_transactions (user_email, amount, order_id, type, description)
    values (new.email, 150, null, 'welcome', '');
  end if;
  return new;
end;
$function$;

drop trigger if exists trigger_welcome_on_registration on public."Tilda points";
create trigger trigger_welcome_on_registration
  after insert on public."Tilda points"
  for each row execute function public.grant_welcome_on_registration();

-- householderscontact@gmail.com registered earlier and has no points yet
insert into points_transactions (user_email, amount, order_id, type, description)
select 'householderscontact@gmail.com', 150, null, 'welcome', ''
 where exists (select 1 from "Tilda points" where email = 'householderscontact@gmail.com')
   and not exists (select 1 from points_transactions where lower(user_email) = 'householderscontact@gmail.com' and type = 'welcome');

select email, balance from "Tilda points" where email = 'householderscontact@gmail.com';
