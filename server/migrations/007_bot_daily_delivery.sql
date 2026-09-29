-- One digest per MAX user and Moscow calendar day. The state survives worker restarts.
create table if not exists bot_daily_deliveries (
  user_id text not null references app_users(id) on delete cascade,
  day date not null,
  status text not null check (status in ('sending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  lease_until timestamptz,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  primary key (user_id, day)
);

create index if not exists bot_daily_deliveries_retry_idx
  on bot_daily_deliveries (next_attempt_at)
  where status <> 'sent';
