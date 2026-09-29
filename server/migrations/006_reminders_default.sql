-- Change the default for new accounts; preserve every existing opt-out.
alter table app_users alter column reminders set default true;
