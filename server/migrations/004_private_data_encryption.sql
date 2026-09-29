alter table app_users add column if not exists name_ciphertext text;
alter table app_users add column if not exists data_ciphertext text;
alter table plans add column if not exists data_ciphertext text;
alter table plan_members add column if not exists display_name_ciphertext text;
alter table user_locations add column if not exists location_ciphertext text;
alter table user_locations alter column lat drop not null;
alter table user_locations alter column lng drop not null;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'user_locations'::regclass
      and conname = 'user_locations_encrypted_or_plain'
  ) then
    alter table user_locations add constraint user_locations_encrypted_or_plain check (
      location_ciphertext is not null or (lat is not null and lng is not null)
    );
  end if;
end $$;
