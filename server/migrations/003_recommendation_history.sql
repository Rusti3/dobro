create table recommendation_interactions (
  id bigint generated always as identity primary key,
  user_id text not null references app_users(id) on delete cascade,
  event_id text not null,
  action text not null check (action in ('like','skip','open_detail','plan','cancel_plan','completed')),
  context text not null,
  idempotency_key text not null,
  feature_version integer not null default 2,
  features jsonb not null default '{}'::jsonb check (jsonb_typeof(features) = 'object'),
  occurred_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index recommendation_interactions_user_time_idx on recommendation_interactions(user_id, occurred_at, id);

create table user_locations (
  user_id text primary key references app_users(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  shared_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours',
  check (lat <> 0 or lng <> 0)
);
create index user_locations_expiry_idx on user_locations(expires_at);

-- Preserve old reactions; snapshots are populated lazily from current catalog facts.
insert into recommendation_interactions(user_id,event_id,action,context,idempotency_key,feature_version,occurred_at)
select u.id, i->>'eventId',
  case when i->>'context' = 'visit' then 'completed' when i->>'context' = 'plan' then 'plan' else i->>'action' end,
  i->>'context', coalesce(i->>'key',i->>'context') || ':' || (i->>'eventId'), 1,
  coalesce((i->>'at')::timestamptz,u.created_at)
from app_users u cross join lateral jsonb_array_elements(coalesce(u.data#>'{recommendation,interactions}','[]'::jsonb)) i
where i->>'action' in ('like','skip') and i->>'eventId' is not null
on conflict do nothing;

-- Historical plans can have been cancelled without recording a negative reaction.
insert into recommendation_interactions(user_id,event_id,action,context,idempotency_key,feature_version,occurred_at)
select owner_id,event_id,case when status='done' then 'completed' else 'cancel_plan' end,
  case when status='done' then 'visit' else 'plan' end,'migrated-plan:'||id::text||':'||status,1,updated_at
from plans where status in ('done','cancelled')
on conflict do nothing;

-- Coordinates are not retained inside profile or preference history.
insert into user_locations(user_id,lat,lng,shared_at,expires_at)
select id,(data#>>'{sharedLocation,lat}')::double precision,(data#>>'{sharedLocation,lng}')::double precision,
  (data#>>'{sharedLocation,at}')::timestamptz,(data#>>'{sharedLocation,at}')::timestamptz+interval '24 hours'
from app_users where jsonb_typeof(data#>'{sharedLocation,lat}')='number'
  and jsonb_typeof(data#>'{sharedLocation,lng}')='number' and data#>>'{sharedLocation,at}' is not null
  and (data#>>'{sharedLocation,at}')::timestamptz > now()-interval '24 hours'
  and (data#>>'{sharedLocation,lat}')::double precision between -90 and 90
  and (data#>>'{sharedLocation,lng}')::double precision between -180 and 180
  and ((data#>>'{sharedLocation,lat}')::double precision<>0 or (data#>>'{sharedLocation,lng}')::double precision<>0)
on conflict do nothing;
update app_users set data = data - 'sharedLocation';

alter table annotation_jobs add column input_hash text;
alter table annotation_jobs add column lease_token text;
update annotation_jobs j set input_hash = v.input_hash from vacancies v where v.id = j.vacancy_id;
alter table annotation_jobs alter column input_hash set not null;
