-- Zashchita ot podbora kodov poukazov: kazhdaya popytka pogasheniya
-- (udachnaya ili net) pishetsya syuda; edge funkciya voucher-claim ne puskaet
-- klienta, u kotorogo 5 neudach za 15 minut.
create table if not exists voucher_claim_attempts (
  id bigserial primary key,
  email text not null,
  ok boolean not null,
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists voucher_claim_attempts_idx on voucher_claim_attempts (lower(email), created_at);
alter table voucher_claim_attempts enable row level security;
drop policy if exists "manager_all_voucher_claim_attempts" on voucher_claim_attempts;
create policy "manager_all_voucher_claim_attempts" on voucher_claim_attempts for all using (is_manager());
