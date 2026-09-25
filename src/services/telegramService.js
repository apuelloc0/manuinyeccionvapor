/**
 * Servicio de notificaciones por Telegram.
 *
  * Requiere en el .env:
 *   TELEGRAM_TOKEN      -> token que da @BotFather
 *   TELEGRAM_CHAT_ID    -> tu chat id (o el de un grupo)
 *
 * Si alguna de las dos no está configurada, el servicio queda en modo
 * "deshabilitado" y no lanza errores (simplemente no envía nada).
 */

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/** ¿Está configurado Telegram? */
export const isTelegramEnabled = () => Boolean(TELEGRAM_TOKEN && TELEGRAM_CHAT_ID);

/** Escapa caracteres especiales para el parse_mode HTML de Telegram */
const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/**
 * Envía un mensaje de texto plano (con formato HTML seguro).
 * @returns {Promise<object>} respuesta de la API, o { skipped: true } si no está configurado
 */
export async function sendTelegramMessage(text) {
  if (!isTelegramEnabled()) {
    console.warn('⚠️ Telegram no configurado (TELEGRAM_TOKEN / TELEGRAM_CHAT_ID). Mensaje omitido.');
    return { ok: false, skipped: true };
  }

  const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });

  const json = await res.json().catch(() => null);

  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram API error: ${res.status} ${json?.description || ''}`.trim());
  }

  return json;
}

/**
 * Envía una alerta de stock bajo.
 * @param {{ item: {name: string, code?: string}, stock: number, minStock: number }} params
 */
export async function sendStockAlert({ item, stock, minStock }) {
  const text =
    `<b>⚠️ Alerta de Stock Bajo</b>\n\n` +
    `📦 Material: <b>${esc(item.name)}</b>\n` +
    (item.code ? `🏷️ Código: ${esc(item.code)}\n` : '') +
    `🔢 Stock actual: <b>${stock}</b>\n` +
    `📉 Mínimo: ${minStock}\n\n` +
    `Revisa el módulo de Inventario.`;

  return sendTelegramMessage(text);
}

/** Envía un mensaje de prueba para verificar la configuración */
export async function sendTestMessage() {
  const text =
    `<b>✅ Prueba de alertas SteamTrack</b>\n\n` +
    `Si ves este mensaje, las notificaciones por Telegram están funcionando correctamente.`;
  return sendTelegramMessage(text);
}

/**
 * Envía un recordatorio diario resumiendo TODOS los materiales en stock crítico
 * en un solo mensaje (evita spam).
 * @param {Array<{name:string, code?:string, stock:number, min_stock:number}>} items
 */
export async function sendLowStockDigest(items) {
  const list = items
    .map((i) => {
      const code = i.code ? ` (${esc(i.code)})` : '';
      return `• <b>${esc(i.name)}</b>${code}: <b>${i.stock}</b> / mín. ${i.min_stock}`;
    })
    .join('\n');

  const text =
    `<b>⚠️ Recordatorio diario — Stock bajo</b>\n\n` +
    `Estos materiales siguen por debajo del mínimo:\n\n` +
    `${list}\n\n` +
    `👉 Actualiza el inventario para dejar de recibir este recordatorio.`;

  return sendTelegramMessage(text);
}
