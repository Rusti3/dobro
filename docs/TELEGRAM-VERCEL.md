# Telegram на Vercel без Vercel CLI

В Vercel → Project → Settings → Environment Variables задайте для Production:

- `TELEGRAM_BOT_TOKEN`: токен того же бота, из которого открывается приложение.
- `MINI_APP_URL`: `https://dobro-lyart.vercel.app`.
- `BOT_USERNAME`: `Oxehh9_bot`.
- `DEMO_MODE`: `false`.

После изменения переменных выполните Redeploy с последним коммитом. Переменные не должны иметь префикс `VITE_`: токен нужен только серверу.

Для Vercel бот получает команды через webhook. При заданных локально переменных `TELEGRAM_BOT_TOKEN` и `MINI_APP_URL` запустите:

```powershell
node --env-file-if-exists=.env scripts/setup-webhook.js
```

Скрипт использует только Telegram API. Он устанавливает webhook, кнопку открытия приложения и команды. Не запускайте `scripts/setup-bot.js` для Vercel: тот скрипт предназначен для локального polling-сервера и снимает webhook.

`TELEGRAM_WEBHOOK_SECRET` необязателен: по умолчанию сервер и скрипт выводят одинаковый секрет из токена. Если секрет указан вручную, его значение должно совпадать на сервере и при запуске скрипта.

Открывайте Mini App кнопкой бота, а не обычной HTTPS-ссылкой в сообщении. В обычном браузере Telegram initData отсутствует. Проверка подписи на сервере обязательна и не отключается ради устранения ошибки.

Диагностика: `/api/health` проверяет доступность обработчика. `/api/bootstrap` без Telegram initData должен вернуть 401. Ответ 503 с упоминанием `TELEGRAM_BOT_TOKEN` означает отсутствие серверной переменной. Успешный `getWebhookInfo` должен показывать адрес `/api/telegram`; наличие адреса ещё не доказывает успешную обработку команд — отправьте `/start` и проверьте ответ бота.
