# Первый шаг — MAX

Полная MAX-версия проекта «Первый шаг»: чат-бот MAX + Mini App для человека, который хочет начать помогать, но откладывает первый визит. Внутри сохранены каталог ДОБРО, персональная лента, план визита, приглашение друга, «сад» и напоминания.

Проект отделён от `dobrie_dela_first` и не изменяет исходную папку.

## Что изменено для MAX

- MAX Bridge подключается через `https://st.max.ru/js/max-web-app.js`.
- `window.WebApp.initData` передаётся в `X-Max-Init-Data` и проверяется на сервере по HMAC-SHA256 по алгоритму MAX.
- Bot API использует только `https://platform-api2.max.ru` и заголовок `Authorization`.
- Для бота есть Long Polling для разработки и HTTPS Webhook через `POST /subscriptions` для production.
- В проект включён корневой сертификат Минцифры `russiantrustedca.pem`; путь можно переопределить через `MAX_CA_BUNDLE`.
- Диплинки приглашений используют `https://max.ru/<bot_username>?startapp=i_<code>`.

## Локальный запуск

Нужен Node.js 24+.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Откройте `http://127.0.0.1:3210`. Без токена работает demo-режим с HttpOnly cookie и SQLite в `var/app.sqlite`.

Проверки:

```powershell
npm test
npm run build
```

С токеном MAX для разработки:

```powershell
$env:MAX_BOT_TOKEN = "токен_из_MAX_для_бизнеса"
$env:MAX_BOT_USERNAME = "your_bot"
$env:MAX_MINI_APP_URL = "https://ваш-домен.example"
$env:MAX_POLLING = "true"
npm run bot:setup
npm start
```

Long Polling предназначен для разработки. При одном запущенном процессе бот отвечает на `/start`, `/help`, `/plan`, `/garden`, `/stop`, `/delete` и открывает Mini App кнопкой MAX.

Если Webhook уже был настроен на удалённый адрес, запускайте локальный режим так — он сначала отключит подписку Webhook и только потом включит Long Polling:

```powershell
npm run bot:polling
```

Обычный `npm start` при заданном `MAX_WEBHOOK_URL` не переключает транспорт автоматически: Webhook должен обслуживаться процессом на публичном HTTPS-сервере, а не локальным `127.0.0.1`.

## Production Webhook

Mini App должен быть опубликован по HTTPS и добавлен в настройках чат-бота MAX для партнёров. Для Webhook нужен доверенный TLS-сертификат; с 25 мая 2026 MAX прекращает поддержку HTTP и самоподписных сертификатов.

В `.env` задайте:

```dotenv
DEMO_MODE=false
MAX_BOT_TOKEN=...
MAX_BOT_USERNAME=your_bot
MAX_MINI_APP_URL=https://example.ru
MAX_WEBHOOK_URL=https://example.ru/api/max/webhook
MAX_WEBHOOK_SECRET=длинный-случайный-секрет
MAX_POLLING=false
```

После первого запуска приложения установите подписку:

```powershell
npm run webhook:setup
npm start
```

`POST /api/max/webhook` проверяет `X-Max-Bot-Api-Secret`, сохраняет пользователя и отправляет ответ через `POST /messages`. Long Polling и Webhook нельзя использовать одновременно.

### Vercel

Проект содержит чистый MAX-handler `api/[[...path]].js` и `vercel.json`. После добавления перечисленных выше `MAX_*` переменных в настройках Vercel выполните новый production deploy именно из папки `max_bot`. Старый Telegram-деплой использовать нельзя.

## Docker

```powershell
docker compose up --build -d
```

SQLite хранится в volume `max-bot-data`. Перед production настройте переменные окружения в compose или секрет-хранилище. Сертификат Минцифры копируется в контейнер и подключается автоматически.

## Документация MAX

- [MAX Bot API](https://dev.max.ru/docs-api)
- [Отправка сообщений](https://dev.max.ru/docs-api/methods/POST/messages)
- [Подписка Webhook](https://dev.max.ru/docs-api/methods/POST/subscriptions)
- [MAX Bridge](https://dev.max.ru/docs/webapps/bridge)
- [Валидация WebAppData](https://dev.max.ru/docs/webapps/validation)
- [Подключение Mini App](https://dev.max.ru/docs/webapps/introduction)

Токены не хранятся в репозитории и не входят в проект. Перед публичным запуском замените `MAX_WEBHOOK_SECRET`, настройте HTTPS и проверьте ответ `GET /api/health`.
