import {createHmac} from 'node:crypto';

// Shared by deployment setup and request verification; never sent to the client.
export function webhookSecret(token, explicit) {
  if (explicit?.trim()) return explicit.trim();
  if (!token?.trim()) throw new Error('TELEGRAM_BOT_TOKEN is required');
  return createHmac('sha256',token.trim()).update('first-step:telegram-webhook:v1').digest('hex');
}
