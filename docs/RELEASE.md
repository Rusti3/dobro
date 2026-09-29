# v2026.09.29

Сад без ручного изменения счётчика, два стартовых дерева, одноразовое пояснение. Личные планы и завершение визита с защитой от повторов. Демо на 672 карточках, воспроизводимый Docker-запуск. Бот — только ежедневная подборка.

Скачать `helpi-v2026.09.29.tar.gz` и `helpi-v2026.09.29.tar.gz.sha256` из релиза. В каталоге исходников:

```bash
sha256sum -c helpi-v2026.09.29.tar.gz.sha256
docker load -i helpi-v2026.09.29.tar.gz
APP_IMAGE=helpi:v2026.09.29 docker compose up -d --no-build
```

PowerShell: перед последней командой задать `$env:APP_IMAGE='helpi:v2026.09.29'`; контрольная сумма — `Get-FileHash helpi-v2026.09.29.tar.gz -Algorithm SHA256`.

Открыть http://localhost:3210. Локально токены не нужны. MAX-интеграции проверяются внутри MAX. PostgreSQL/Caddy загружаются отдельно Compose, образ релиза содержит приложение и worker. Настройки production и откат — `docs/OPERATIONS.md`.
