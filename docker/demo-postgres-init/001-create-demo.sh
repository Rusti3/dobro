#!/bin/sh
set -eu

if [ -z "${DEMO_POSTGRES_PASSWORD:-}" ]; then
  echo "DEMO_POSTGRES_PASSWORD is required" >&2
  exit 1
fi

psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=app_password="$DEMO_POSTGRES_PASSWORD" <<'SQL'
create role helpi_demo_app
  login
  password :'app_password'
  nosuperuser
  nocreatedb
  nocreaterole
  noinherit;

revoke all on database helpi_demo from public;
grant connect on database helpi_demo to helpi_demo_app;
revoke all on schema public from public;
create schema app authorization helpi_demo_app;
alter role helpi_demo_app in database helpi_demo set search_path = app, public;
SQL
