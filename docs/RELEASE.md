# v2026.09.29.1

Исправлено открытие в веб-версии MAX: встраивание разрешено только самому приложению и https://web.max.ru. Убран конфликтующий X-Frame-Options: DENY. Проверка подписи MAX, остальные защиты, данные и функции релиза v2026.09.29 сохранены.

Скачать `helpi-v2026.09.29.1.tar.gz` и `helpi-v2026.09.29.1.tar.gz.sha256` из релиза. В каталоге исходников:

```bash
sha256sum -c helpi-v2026.09.29.1.tar.gz.sha256
docker load -i helpi-v2026.09.29.1.tar.gz
APP_IMAGE=helpi:v2026.09.29.1 docker compose up -d --no-build
```

PowerShell: перед последней командой задать `$env:APP_IMAGE='helpi:v2026.09.29.1'`; контрольная сумма — `Get-FileHash helpi-v2026.09.29.1.tar.gz -Algorithm SHA256`.

Открыть http://localhost:3210. Локально токены не нужны. MAX-интеграции проверяются внутри MAX. PostgreSQL/Caddy загружаются отдельно Compose, образ релиза содержит приложение и worker. Настройки production и откат — `docs/OPERATIONS.md`.
