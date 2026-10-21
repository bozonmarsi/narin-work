-- Reminder e-mails when a part of the deposit (a gift card amount, 12 months) is about to expire.
-- Two stages per lot: when it has 30 days left and when it has 7 days left. A lot that is credited
-- with less than 7 days left gets only the 7 day stage. Each stage is sent once (log table).

create table if not exists public.deposit_expiry_reminders (
  lot_id uuid not null,
  stage int not null,
  sent_at timestamptz not null default now(),
  primary key (lot_id, stage)
);
alter table public.deposit_expiry_reminders enable row level security;

create or replace function public.send_deposit_expiry_reminders()
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  rec record;
  n int := 0;
begin
  for rec in
    with due as (
      select l.id, lower(l.email) as email, l.remaining, l.expires_at,
             case when l.expires_at <= now() + interval '7 days' then 7 else 30 end as stage
        from deposit_lots l
       where l.expires_at is not null
         and l.expired_at is null
         and l.remaining > 0
         and l.expires_at > now()
         and l.expires_at <= now() + interval '30 days'
         and l.email like '%@%'
    ),
    fresh as (
      insert into deposit_expiry_reminders (lot_id, stage)
      select id, stage from due
      on conflict do nothing
      returning lot_id, stage
    )
    select d.email,
           min(d.stage) as stage,
           jsonb_agg(jsonb_build_object('remaining', d.remaining, 'expires_at', d.expires_at) order by d.expires_at) as lots,
           sum(d.remaining) as total
      from due d join fresh f on f.lot_id = d.id and f.stage = d.stage
     group by d.email
  loop
    perform notify_brevo(jsonb_build_object(
      'event', 'deposit_expiring',
      'order_id', 'deposit',
      'email', rec.email,
      'days', rec.stage,
      'total', rec.total,
      'lots', rec.lots
    ));
    n := n + 1;
  end loop;

  delete from deposit_expiry_reminders where sent_at < now() - interval '400 days';
  return n;
end;
$function$;

-- Once a day at 07:40 UTC (09:40 in Prague in summer, 08:40 in winter).
select cron.unschedule('deposit-expiry-reminders') where exists (select 1 from cron.job where jobname = 'deposit-expiry-reminders');
select cron.schedule('deposit-expiry-reminders', '40 7 * * *', 'select public.send_deposit_expiry_reminders()');
