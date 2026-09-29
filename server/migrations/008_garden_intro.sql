alter table app_users
  add column if not exists garden_intro_seen boolean not null default false;
