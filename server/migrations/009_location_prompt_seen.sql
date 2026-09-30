alter table app_users
  add column if not exists location_prompt_seen boolean not null default false;
