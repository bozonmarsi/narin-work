-- New Tilda products reach the site's order and popup data within 10 minutes instead of an hour.
select cron.alter_job((select jobid from cron.job where jobname = 'catalog-sync'), schedule := '7-59/10 * * * *');
