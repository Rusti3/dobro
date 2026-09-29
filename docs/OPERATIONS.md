# Проверка и эксплуатация

## PostgreSQL-тесты

Не использовать production DATABASE_URL. Создать отдельную БД:

```bash
docker compose exec postgres createdb -U postgres -O dobrie_dela_app helpi_test
docker compose exec postgres psql -U postgres -d helpi_test -c "CREATE SCHEMA app AUTHORIZATION dobrie_dela_app"
```

Linux/macOS:

```bash
TEST_DATABASE_URL=postgresql://dobrie_dela_app:local-app-password@127.0.0.1:54329/helpi_test npm test
TEST_DATABASE_URL=postgresql://dobrie_dela_app:local-app-password@127.0.0.1:54329/helpi_test npm run integration:postgres
```

PowerShell: сначала задать `$env:TEST_DATABASE_URL` той же строкой, затем выполнить команды npm. При других паролях/портах заменить их. Тестовые записи удаляются по завершении; БД можно оставить для следующего запуска.

## Production

Не запускать демо поверх production-конфигурации. В `.env`: `DOCKER_DEMO_MODE=false`, `DEMO_MODE=false`, `DEMO_DATA=false`, отдельные пароли БД, настройки MAX и HTTPS URL. Внешняя разметка по умолчанию выключена.

`compose.production.yaml` добавляет Caddy и требует:

- `secrets/private-data.key`: отдельный 32-байтный ключ AES в base64, доступный только владельцу;
- `secrets/postgres-tls/ca.crt`, `server.crt`, `server.key`: сертификат PostgreSQL с SAN `postgres`, подписанный собственным CA; ключ доступен пользователю PostgreSQL;
- `deploy/postgres-pg_hba.conf`: только TLS/SCRAM для TCP;
- HTTPS-домен в `deploy/Caddyfile` и настройках мини-приложения MAX.

Ключ шифрования, приватный ключ CA и `.env` не добавляются в Git и образ. Потеря ключа приложения делает зашифрованные поля недоступными. Смена паролей существующего volume выполняется SQL-командой отдельно: изменение `.env` само по себе их не меняет. Checksums нового кластера включены; для старого кластера нужна отдельная остановка и `pg_checksums`, не миграция приложения.

```bash
docker compose -f compose.yaml -f compose.production.yaml up -d --no-build
npm run bot:setup
npm run webhook:setup
```

Webhook и polling не включать одновременно. Проверить MAX вручную: приглашение пересылается с картинкой выбранного дела, ссылка открывает карточку; геопозиция запрашивается в чате с согласия; `/deals`, `/plan`, `/nearby`, старые callback-кнопки не выполняют действий; `/start` и `/stop` управляют только подборкой. Утром приходит подборка из того же рекомендателя, без повторной отправки при перезапуске.

## Обновление и откат

Перед обновлением сохранить предыдущий image ID, используемые Compose-файлы, `.env`, ключи и БД в закрытый каталог (`umask 077`). БД выгружать через `pg_dump -Fc` внутри postgres-контейнера. Резервную копию шифровать, ключ держать отдельно; не публиковать её в релизе.

Обновлять только `app` и `worker`: `docker compose ... up -d --no-build --no-deps app worker`. Не пересоздавать PostgreSQL и не удалять volume. Добавочные миграции запускаются автоматически с транзакционной блокировкой. После обновления проверить image revision, `/api/health`, TLS, checksums и количество профилей/планов до и после.

Откат: вернуть сохранённые Compose-файлы и предыдущий образ, затем снова запустить только `app` и `worker`. Столбец `garden_intro_seen` старому приложению не мешает, удалять его и историю не нужно. Для отката только рейтинга использовать `RECOMMENDATION_V2_ENABLED=false`.
