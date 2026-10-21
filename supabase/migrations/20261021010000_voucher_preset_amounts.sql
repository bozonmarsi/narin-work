-- Printed gift cards carry their amount. Record it in the database and refuse to activate a card for a different amount.
-- Only cards that are still inactive and have no amount yet are touched.

update public.gift_vouchers g
   set amount = v.amount
  from (values
    ('NR-GU7J-YJF5', 500),
    ('NR-FX5W-6KXB', 500),
    ('NR-VVXF-MDZ3', 500),
    ('NR-PMC2-U9HT', 500),
    ('NR-U6C3-9TBR', 500),
    ('NR-UJNU-VABS', 500),
    ('NR-GEPJ-XPS4', 1000),
    ('NR-D2KX-CTJA', 1000),
    ('NR-6TJJ-UR5S', 1000),
    ('NR-QA24-QCCT', 1000),
    ('NR-T7N2-6RCK', 1000),
    ('NR-KSQ2-FKCK', 1000),
    ('NR-XSGR-RBAU', 1500),
    ('NR-9HBK-5H6Y', 1500),
    ('NR-FFJE-JF4N', 1500),
    ('NR-KPRG-638J', 1500),
    ('NR-FG6X-GWFQ', 2000),
    ('NR-NKDA-GZN7', 2000),
    ('NR-CK2M-HKZQ', 2000),
    ('NR-RYDP-P94G', 2000)
  ) as v(code, amount)
 where g.code = v.code
   and g.status = 'inactive'
   and g.amount is null;

create or replace function public.activate_voucher(
  p_code text,
  p_amount numeric default null,
  p_method text default 'cash',
  p_purchaser_email text default null,
  p_note text default null
) returns public.gift_vouchers
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v gift_vouchers;
  v_key text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_amount numeric;
begin
  if not is_manager() then raise exception 'forbidden'; end if;
  select * into v from gift_vouchers where code_key = v_key for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if v.status <> 'inactive' then raise exception 'voucher_not_inactive_%', v.status; end if;
  if v.amount is not null and p_amount is not null and p_amount <> v.amount then
    raise exception 'amount_mismatch';
  end if;
  v_amount := coalesce(p_amount, v.amount);
  if v_amount is null or v_amount <= 0 then raise exception 'amount_required'; end if;
  update gift_vouchers
     set amount = v_amount,
         status = 'active',
         activated_at = now(),
         activated_by = auth.uid(),
         activation_method = coalesce(nullif(p_method, ''), 'cash'),
         expires_at = now() + interval '12 months',
         purchaser_email = coalesce(nullif(lower(btrim(coalesce(p_purchaser_email, ''))), ''), purchaser_email),
         note = coalesce(nullif(p_note, ''), note)
   where id = v.id
  returning * into v;
  return v;
end;
$function$;

select amount, count(*) as cards, count(*) filter (where status = 'inactive') as inactive
  from public.gift_vouchers group by amount order by amount;
