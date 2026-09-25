/**
 * Programador de tareas internas (sin dependencias externas).
 *
 * Actualmente: recordatorio diario de stock bajo.
 *   - Se ejecuta todos los días a la hora configurada.
 *   - Solo envía el mensaje si hay materiales en stock crítico.
 *   - Se reprograma solo para el día siguiente (bucle hasta que se corrija).
 *
 * Configuración (.env):
 *   ALERTS_DAILY_ENABLED=true   -> activar/desactivar
 *   ALERTS_DAILY_HOUR=8         -> hora del día (0-23, hora local del servidor)
 */

import { sendDailyLowStockAlerts } from '../controllers/inventoryController.js';

const ENABLED = String(process.env.ALERTS_DAILY_ENABLED ?? 'false').toLowerCase() === 'true';
const HOUR = Math.min(Math.max(Number(process.env.ALERTS_DAILY_HOUR ?? 8), 0), 23);

let timer = null;

/** Milisegundos hasta la próxima ocurrencia de la hora indicada */
function msUntilNext(hour) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

/** Programa la siguiente ejecución */
function scheduleNext() {
  const ms = msUntilNext(HOUR);
  const nextDate = new Date(Date.now() + ms);
  console.log(`⏰ Recordatorio diario de stock programado para ${nextDate.toLocaleString()}.`);
  timer = setTimeout(run, ms);
}

/** Ejecuta el recordatorio y se reprograma para el día siguiente */
async function run() {
  try {
    console.log('🔔 Enviando recordatorio diario de stock bajo...');
    const r = await sendDailyLowStockAlerts();
    console.log(
      r.skipped
        ? '🔔 Recordatorio diario: no hay materiales en stock crítico (nada que enviar).'
        : `🔔 Recordatorio diario enviado (${r.count} material(es)).`
    );
  } catch (e) {
    console.error('❌ Error en el recordatorio diario de stock:', e.message);
  } finally {
    scheduleNext();
  }
}

/** Arranca el programador (solo si está habilitado en el .env) */
export function startScheduler() {
  if (!ENABLED) {
    console.log('ℹ️ Recordatorio diario de stock deshabilitado (ALERTS_DAILY_ENABLED != true).');
    return;
  }
  scheduleNext();
}

/** Detiene el programador */
export function stopScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}
