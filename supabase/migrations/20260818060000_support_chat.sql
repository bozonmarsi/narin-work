-- Customer support chat: customers write from the site (verified by email
-- OTP, via the personal-dates/customer-deposit style edge function using a
-- service-role key), managers read/reply directly from the dashboard.

create table if not exists support_conversations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  unread_by_manager boolean not null default true
);
create index if not exists support_conversations_email_idx on support_conversations (email);
create index if not exists support_conversations_last_message_idx on support_conversations (last_message_at desc);

create table if not exists support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references support_conversations(id) on delete cascade,
  sender_type text not null check (sender_type in ('customer', 'manager')),
  body text not null check (char_length(body) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists support_messages_conversation_idx on support_messages (conversation_id, created_at);

alter table support_conversations enable row level security;
alter table support_messages enable row level security;

drop policy if exists "manager_all_support_conversations" on support_conversations;
create policy "manager_all_support_conversations" on support_conversations
  for all using (is_manager());

drop policy if exists "manager_all_support_messages" on support_messages;
create policy "manager_all_support_messages" on support_messages
  for all using (is_manager());
