-- The 12-month validity of a gift voucher starts when the client puts the money on
-- the deposit (claims the voucher), not when the card is activated / paid for.
--   * activation in the shop and the online purchase leave expires_at empty;
--   * claim_voucher sets expires_at = now() + 12 months on the voucher and on the deposit lot;
--   * a voucher that is not claimed yet never expires.
-- Everything else (reminders 30 / 7 days before the end, spending the earliest-expiring lot first)
-- already works from deposit_lots.expires_at, so it keeps working, now counted from the claim.

do $mig$
declare
  d1 text := pg_get_functiondef('public.activate_voucher(text,numeric,text,text,text)'::regprocedure);
  d2 text := pg_get_functiondef('public.issue_vouchers_for_order(text)'::regprocedure);
  n1 text;
  n2 text;
begin
  n1 := replace(d1, 'expires_at = now() + interval ''12 months'',', 'expires_at = null,');
  n2 := replace(d2, 'now() + interval ''12 months'', ''Objednavka '' || o.order_id', 'null, ''Objednavka '' || o.order_id');
  if n1 = d1 or n2 = d2 then
    raise exception 'pattern not found, nothing changed';
  end if;
  execute n1;
  execute n2;
end
$mig$;

create or replace function public.claim_voucher(p_email text, p_code text)
returns table(new_balance numeric, voucher_amount numeric, valid_until timestamptz)
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v gift_vouchers;
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_key text := regexp_replace(upper(coalesce(p_code, '')), '[^A-Z0-9]', '', 'g');
  v_row_email text;
  v_balance numeric;
  v_exp timestamptz := now() + interval '12 months';
begin
  if v_email = '' then raise exception 'email_required'; end if;
  select * into v from gift_vouchers where code_key = v_key for update;
  if not found then raise exception 'voucher_not_found'; end if;
  if v.status = 'claimed' then raise exception 'already_claimed'; end if;
  if v.status <> 'active' then raise exception 'voucher_%', v.status; end if;
  -- only vouchers that already had an end date (activated before this change) can be expired
  if v.expires_at is not null and v.expires_at <= now() then raise exception 'voucher_expired'; end if;

  perform set_config('narin.lot_sync', '1', true);

  insert into deposit_lots (email, amount, remaining, source, source_ref, expires_at)
  values (v_email, v.amount, v.amount, 'voucher', v.code, v_exp);

  select email into v_row_email from customer_deposits where lower(email) = v_email limit 1;
  if v_row_email is null then
    insert into customer_deposits (email, balance, updated_at) values (v_email, v.amount, now())
    returning balance into v_balance;
  else
    update customer_deposits set balance = balance + v.amount, updated_at = now()
     where email = v_row_email
    returning balance into v_balance;
  end if;

  insert into deposit_transactions (user_email, amount, type, order_id, description)
  values (v_email, v.amount, 'voucher', 'voucher:' || v.code, 'Dárkový poukaz ' || v.code);

  update gift_vouchers set status = 'claimed', claimed_at = now(), claimed_by_email = v_email, expires_at = v_exp
   where id = v.id;

  perform set_config('narin.lot_sync', '0', true);
  return query select v_balance, v.amount, v_exp;
end;
$function$;

-- check
select (select position('expires_at = null' in pg_get_functiondef('public.activate_voucher(text,numeric,text,text,text)'::regprocedure)) > 0) activate_ok,
       (select position('null, ''Objednavka''' in pg_get_functiondef('public.issue_vouchers_for_order(text)'::regprocedure)) > 0) issue_ok;
