import { Router } from 'express';
import { handleUpdate } from '../services/telegramBot.js';

const router = Router();

/**
 * Webhook de Telegram.
 * Telegram hace POST aquí cada vez que el bot recibe un mensaje/callback.
 * Se valida con el header X-Telegram-Bot-Api-Secret-Token (si hay secreto).
 */
router.post('/webhook', (req, res) => {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (secret) {
    const received = req.get('X-Telegram-Bot-Api-Secret-Token');
    if (received !== secret) {
      console.warn('⛔ Telegram webhook: secreto inválido. Petición rechazada.');
      return res.status(401).json({ ok: false });
    }
  }

  // Responder 200 inmediatamente y procesar en segundo plano
  res.status(200).json({ ok: true });
  handleUpdate(req.body).catch((e) => console.error('❌ Error procesando update de Telegram:', e.message));
});

export default router;
