create table if not exists browser_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  user_id text not null references app_users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint browser_session_user check (user_id like 'web:%')
);
create index if not exists browser_sessions_user_idx on browser_sessions(user_id);
create index if not exists browser_sessions_expiry_idx on browser_sessions(expires_at);
