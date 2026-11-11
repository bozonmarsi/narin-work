-- 1) Broken since April: compares payment_status with 'Ожидает оплаты' but the
--    enum value is '🟠 Ожидает оплаты', so it failed every minute (292k failed runs).
--    Its logic (cancel any unpaid order after 1 minute) is also unsafe. Turn it off.
select cron.unschedule(1);

-- 2) cron history: 335k rows / 178 MB out of a 204 MB database. Keep 3 days.
delete from cron.job_run_details where start_time < now() - interval '3 days';

-- 3) Clean it every night so it never grows again.
select cron.schedule('cleanup-cron-history', '30 3 * * *',
  $$delete from cron.job_run_details where start_time < now() - interval '3 days'$$);
