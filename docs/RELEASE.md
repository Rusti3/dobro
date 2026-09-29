# v2026.09.30

По адресу `/api` доступна интерактивная Swagger UI-документация; `/api/openapi.yaml` и `/api/index.json` доступны без MAX. Личные методы по-прежнему требуют подписанные данные запуска MAX. Интерфейс, рекомендации и данные сохранены без изменений относительно v2026.09.29.1.

Скачать `helpi-v2026.09.30.tar.gz` и `helpi-v2026.09.30.tar.gz.sha256` из релиза. В каталоге исходников:

```bash
sha256sum -c helpi-v2026.09.30.tar.gz.sha256
docker load -i helpi-v2026.09.30.tar.gz
APP_IMAGE=helpi:v2026.09.30 docker compose up -d --no-build
```

PowerShell: перед последней командой задать `$env:APP_IMAGE='helpi:v2026.09.30'`; контрольная сумма — `Get-FileHash helpi-v2026.09.30.tar.gz -Algorithm SHA256`.

Открыть http://localhost:3210. Локально токены не нужны. MAX-интеграции проверяются внутри MAX. PostgreSQL/Caddy загружаются отдельно Compose, образ релиза содержит приложение и worker. Настройки production и откат — `docs/OPERATIONS.md`.
