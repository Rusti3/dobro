#!/bin/sh
set -eu
cd /opt/helpi
umask 077
tls_dir=secrets/postgres-tls
mkdir -p "$tls_dir"
if [ ! -s "$tls_dir/server.key" ]; then
  openssl req -x509 -newkey rsa:3072 -nodes -sha256 -days 3650 \
    -subj '/CN=helpi-postgres-private-ca' -keyout "$tls_dir/ca.key" -out "$tls_dir/ca.crt"
  openssl req -new -newkey rsa:3072 -nodes -sha256 -subj '/CN=postgres' \
    -keyout "$tls_dir/server.key" -out "$tls_dir/server.csr" \
    -addext 'subjectAltName=DNS:postgres,DNS:localhost,IP:127.0.0.1'
  openssl x509 -req -sha256 -days 365 -in "$tls_dir/server.csr" \
    -CA "$tls_dir/ca.crt" -CAkey "$tls_dir/ca.key" -CAcreateserial \
    -copy_extensions copy -out "$tls_dir/server.crt"
fi
openssl verify -CAfile "$tls_dir/ca.crt" "$tls_dir/server.crt"
if docker inspect dobrie-dela-max-postgres-1 >/dev/null 2>&1; then
  postgres_uid=$(docker exec dobrie-dela-max-postgres-1 id -u postgres)
  postgres_gid=$(docker exec dobrie-dela-max-postgres-1 id -g postgres)
else
  postgres_uid=$(docker run --rm --entrypoint id postgres:17-alpine -u postgres)
  postgres_gid=$(docker run --rm --entrypoint id postgres:17-alpine -g postgres)
fi
chown "$postgres_uid:$postgres_gid" "$tls_dir/server.key"
chmod 600 "$tls_dir/server.key" "$tls_dir/ca.key"
chmod 644 "$tls_dir/server.crt" "$tls_dir/ca.crt"
chmod 755 "$tls_dir"
