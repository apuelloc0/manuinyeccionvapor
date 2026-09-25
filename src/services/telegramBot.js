/**
 * Bot de Telegram bidireccional para gestionar el inventario.
 *
 * Permite (solo a chats autorizados):
 *   /ayuda                         -> lista de comandos
 *   /stock                         -> materiales en stock crítico
 *   /buscar <texto>                -> buscar materiales
 *   /entrada <cantidad> <material> -> registrar entrada (con confirmación)
 *   /salida  <cantidad> <material> -> registrar salida  (con confirmación)
 *
 * NO permite eliminar ni editar materiales (solo movimientos de stock).
 *
 * Configuración (.env):
 *   TELEGRAM_TOKEN              -> token del bot
 *   TELEGRAM_WHITELIST_IDS      -> chat ids autorizados, separados por coma
 *   TELEGRAM_ACTOR_USERNAME     -> usuario del sistema que firma las acciones (auditoría)
 *   TELEGRAM_WEBHOOK_URL        -> base pública (ej. https://mi-backend.onrender.com)
 *   TELEGRAM_WEBHOOK_SECRET     -> secreto aleatorio para validar el webhook
 *   TELEGRAM_POLLING=true       -> (opcional) usar polling en vez de webhook (local)
 */

import supabase from '../config/db.js';
import { USERS_TABLE } from '../models/User.js';
import { INVENTORY_TABLE } from '../models/Inventory.js';
import { applyMovement } from '../controllers/inventoryController.js';

const TOKEN = process.env.TELEGRAM_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET || '';
const ACTOR_USERNAME = process.env.TELEGRAM_ACTOR_USERNAME || 'admin';

// Chats autorizados a dar órdenes (por defecto, el chat configurado para alertas)
const WHITELIST = String(process.env.TELEGRAM_WHITELIST_IDS || process.env.TELEGRAM_CHAT_ID || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const isAllowed = (chatId) => WHITELIST.includes(String(chatId));

const esc = (s) =>
  String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---------- API de Telegram ----------
const apiUrl = (method) => `https://api.telegram.org/bot${TOKEN}/${method}`;

async function callApi(method, payload) {
  const res = await fetch(apiUrl(method), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => null);
}

const sendText = (chatId, text, replyMarkup) =>
  callApi('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
  });

const answerCallback = (id, text) =>
  callApi('answerCallbackQuery', { callback_query_id: id, ...(text ? { text } : {}) });

const editMessage = (cq, text) =>
  callApi('editMessageText', {
    chat_id: cq.message.chat.id,
    message_id: cq.message.message_id,
    text,
    parse_mode: 'HTML',
    reply_markup: { inline_keyboard: [] },
  });

// ---------- Usuario "actor" para la auditoría ----------
let actorCache;
async function getActorId() {
  if (actorCache !== undefined) return actorCache;
  const { data } = await supabase
    .from(USERS_TABLE)
    .select('id')
    .eq('username', ACTOR_USERNAME)
    .maybeSingle();
  if (data) {
    actorCache = data.id;
  } else {
    // Respaldo: primer usuario con rol Administrador
    const { data: admins } = await supabase
      .from(USERS_TABLE)
      .select('id')
      .ilike('role', 'administrador')
      .limit(1);
    actorCache = admins?.[0]?.id || null;
  }
  return actorCache;
}

// ---------- Búsqueda de materiales ----------
async function searchItems(q) {
  const safe = String(q).replace(/[,()%]/g, ' ').trim();
  if (!safe) return [];
  const { data, error } = await supabase
    .from(INVENTORY_TABLE)
    .select('id, name, code, stock, min_stock')
    .eq('activo', true)
    .or(`code.ilike.%${safe}%,name.ilike.%${safe}%`)
    .order('name', { ascending: true })
    .limit(6);
  if (error) throw error;
  return data || [];
}

// ---------- Comandos ----------
function sendHelp(chatId) {
  const text =
    `<b>🤖 Bot de Inventario — Comandos</b>\n\n` +
    `/inventario — todos los materiales y su stock\n` +
    `/stock — solo los que están en stock crítico\n` +
    `/buscar &lt;texto&gt; — buscar materiales\n` +
    `/entrada &lt;cantidad&gt; &lt;código o nombre&gt;\n` +
    `/salida &lt;cantidad&gt; &lt;código o nombre&gt;\n\n` +
    `<i>Ejemplo:</i> /salida 5 FLT-01`;
  return sendText(chatId, text);
}

async function sendStock(chatId) {
  const { data } = await supabase
    .from(INVENTORY_TABLE)
    .select('name, code, stock, min_stock')
    .eq('activo', true)
    .order('name', { ascending: true });

  const low = (data || []).filter(
    (i) => Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock)
  );

  if (!low.length) return sendText(chatId, '✅ No hay materiales en stock crítico.');

  const list = low
    .map((i) => `• <b>${esc(i.name)}</b>${i.code ? ` (${esc(i.code)})` : ''}: <b>${i.stock}</b> / mín. ${i.min_stock}`)
    .join('\n');

  return sendText(chatId, `<b>⚠️ Stock crítico (${low.length})</b>\n\n${list}`);
}

/**
 * Envía un texto largo troceado en varios mensajes (límite de Telegram: 4096).
 * El encabezado se incluye solo en el primer mensaje.
 */
async function sendLongText(chatId, header, lines) {
  const MAX = 3500;
  let chunk = header;
  let anySent = false;

  for (const line of lines) {
    if (chunk && (chunk.length + 1 + line.length) > MAX) {
      await sendText(chatId, chunk);
      anySent = true;
      chunk = '';
    }
    chunk += (chunk ? '\n' : '') + line;
  }

  if (chunk.trim()) {
    await sendText(chatId, chunk);
    anySent = true;
  }
  return anySent;
}

/** Lista TODOS los materiales activos del inventario */
async function sendInventory(chatId) {
  const { data, error } = await supabase
    .from(INVENTORY_TABLE)
    .select('name, code, stock, min_stock, category')
    .eq('activo', true)
    .order('name', { ascending: true });

  if (error) throw error;

  if (!data || data.length === 0) {
    return sendText(chatId, '📦 No hay materiales activos en el inventario.');
  }

  const low = data.filter(
    (i) => Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock)
  );

  const lines = data.map((i) => {
    const isLow = Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock);
    const code = i.code ? ` (${esc(i.code)})` : '';
    const min = Number(i.min_stock) > 0 ? ` / mín. ${i.min_stock}` : '';
    return `${isLow ? '🔴' : '🟢'} <b>${esc(i.name)}</b>${code}: <b>${i.stock}</b>${min}`;
  });

  const header =
    `<b>📦 Inventario (${data.length} materiales)</b>\n` +
    (low.length ? `🔴 En crítico: <b>${low.length}</b>\n` : '✅ Nada en crítico\n') +
    `🟢 = OK   🔴 = bajo mínimo\n\n`;

  return sendLongText(chatId, header, lines);
}

async function sendSearch(chatId, q) {
  if (!q) return sendText(chatId, 'Uso: /buscar &lt;texto&gt;');
  const items = await searchItems(q);
  if (!items.length) return sendText(chatId, `No encontré materiales con "<b>${esc(q)}</b>".`);
  const list = items
    .map((i) => `• <b>${esc(i.name)}</b>${i.code ? ` (${esc(i.code)})` : ''} — stock: <b>${i.stock}</b>`)
    .join('\n');
  return sendText(chatId, `<b>Resultados:</b>\n\n${list}`);
}

function confirmKeyboard(tipo, qty, itemId) {
  return {
    inline_keyboard: [[
      { text: '✅ Confirmar', callback_data: `mv|${tipo}|${qty}|${itemId}` },
      { text: '❌ Cancelar', callback_data: 'cancel' },
    ]],
  };
}

function askConfirm(chatId, tipo, qty, item) {
  const emoji = tipo === 'entrada' ? '📥' : '📤';
  const text =
    `<b>${emoji} Confirmar ${tipo.toUpperCase()}</b>\n\n` +
    `Material: <b>${esc(item.name)}</b>${item.code ? ` (${esc(item.code)})` : ''}\n` +
    `Stock actual: ${item.stock}\n` +
    `Cantidad: <b>${qty}</b>`;
  return sendText(chatId, text, confirmKeyboard(tipo, qty, item.id));
}

async function prepareMovement(chatId, tipo, args) {
  const qtyToken = args.find((a) => /^\d+$/.test(a));
  const qty = qtyToken ? parseInt(qtyToken, 10) : NaN;
  const query = args.filter((a) => a !== qtyToken).join(' ').trim();

  if (!Number.isFinite(qty) || qty <= 0 || !query) {
    return sendText(
      chatId,
      `Uso: /${tipo} &lt;cantidad&gt; &lt;código o nombre&gt;\n<i>Ejemplo:</i> /${tipo} 5 FLT-01`
    );
  }

  const items = await searchItems(query);
  if (!items.length) return sendText(chatId, `No encontré ningún material con "<b>${esc(query)}</b>".`);

  if (items.length > 1) {
    const keyboard = {
      inline_keyboard: items.map((i) => [{
        text: `${i.name}${i.code ? ` (${i.code})` : ''} · ${i.stock} u.`,
        callback_data: `pick|${tipo}|${qty}|${i.id}`,
      }]),
    };
    return sendText(chatId, 'Encontré varios materiales. ¿Cuál quieres mover?', keyboard);
  }

  return askConfirm(chatId, tipo, qty, items[0]);
}

async function executeMovement(cq, tipo, qty, itemId) {
  const chatId = cq.message.chat.id;
  const userId = await getActorId();
  try {
    const { stock, item } = await applyMovement({
      id: itemId,
      tipo,
      cantidad: qty,
      motivo: 'Telegram',
      notas: `Registrado desde el bot (chat ${chatId})`,
      userId,
    });
    await answerCallback(cq.id, '✅ Listo');
    await editMessage(
      cq,
      `✅ <b>${tipo.toUpperCase()}</b> registrada\n` +
        `<b>${esc(item.name)}</b>${item.code ? ` (${esc(item.code)})` : ''}\n` +
        `Nuevo stock: <b>${stock}</b>`
    );
  } catch (e) {
    await answerCallback(cq.id, '⚠️ Error');
    await editMessage(cq, `⚠️ No se pudo registrar: ${esc(e.message)}`);
  }
}

// ---------- Manejo de updates ----------
async function handleMessage(msg) {
  const chatId = msg.chat.id;
  if (!isAllowed(chatId)) {
    console.warn(`⛔ Bot: mensaje de chat NO autorizado (${chatId}). Ignorado.`);
    return;
  }
  const text = (msg.text || '').trim();
  if (!text) return;

  const [rawCmd, ...args] = text.split(/\s+/);
  const cmd = rawCmd.toLowerCase().replace(/@\w+$/, '');

  switch (cmd) {
    case '/start':
    case '/ayuda':
    case '/help':
      return sendHelp(chatId);
    case '/stock':
      return sendStock(chatId);
    case '/inventario':
    case '/todo':
    case '/todos':
    case '/lista':
    case '/materiales':
      return sendInventory(chatId);
    case '/buscar':
      return sendSearch(chatId, args.join(' '));
    case '/entrada':
      return prepareMovement(chatId, 'entrada', args);
    case '/salida':
      return prepareMovement(chatId, 'salida', args);
    default:
      return sendText(chatId, 'No reconozco ese comando. Usa /ayuda.');
  }
}

async function handleCallback(cq) {
  const chatId = cq.message?.chat?.id;
  if (!isAllowed(chatId)) {
    console.warn(`⛔ Bot: callback de chat NO autorizado (${chatId}). Ignorado.`);
    return answerCallback(cq.id, 'No autorizado.');
  }

  const [action, tipo, qtyStr, itemId] = (cq.data || '').split('|');

  if (action === 'cancel') {
    await answerCallback(cq.id, 'Cancelado');
    return editMessage(cq, '❌ Operación cancelada.');
  }

  if (action === 'pick') {
    const { data: item } = await supabase
      .from(INVENTORY_TABLE)
      .select('id, name, code, stock')
      .eq('id', itemId)
      .maybeSingle();
    await answerCallback(cq.id, item ? 'Seleccionado' : 'No encontrado');
    if (!item) return;
    return askConfirm(chatId, tipo, parseInt(qtyStr, 10), item);
  }

  if (action === 'mv') {
    return executeMovement(cq, tipo, parseInt(qtyStr, 10), itemId);
  }

  await answerCallback(cq.id, 'Acción no reconocida');
}

/** Procesa un update de Telegram (desde webhook o polling) */
export async function handleUpdate(update) {
  try {
    if (update?.message) return await handleMessage(update.message);
    if (update?.callback_query) return await handleCallback(update.callback_query);
  } catch (e) {
    console.error('❌ Bot error:', e.message);
  }
}

// ---------- Transporte: webhook o polling ----------
let pollingActive = false;
let pollOffset = 0;

async function pollLoop() {
  pollingActive = true;
  console.log('🤖 Bot de Telegram en modo polling.');
  while (pollingActive) {
    try {
      const r = await callApi('getUpdates', {
        offset: pollOffset,
        timeout: 25,
        allowed_updates: ['message', 'callback_query'],
      });
      if (r?.ok && Array.isArray(r.result)) {
        for (const u of r.result) {
          pollOffset = u.update_id + 1;
          await handleUpdate(u);
        }
      }
    } catch (e) {
      console.error('⚠️ Error en polling de Telegram:', e.message);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Arranca el bot según la configuración:
 *  - Si hay TELEGRAM_WEBHOOK_URL -> registra el webhook.
 *  - Si TELEGRAM_POLLING=true    -> usa polling (ideal para local).
 *  - Si no hay nada -> no hace nada.
 */
export async function startTelegram() {
  if (!TOKEN) {
    console.log('ℹ️ Bot de Telegram no configurado (falta TELEGRAM_TOKEN).');
    return;
  }

  const baseUrl = process.env.TELEGRAM_WEBHOOK_URL;

  if (baseUrl) {
    const fullUrl = baseUrl.replace(/\/$/, '') + '/api/telegram/webhook';
    const r = await callApi('setWebhook', {
      url: fullUrl,
      allowed_updates: ['message', 'callback_query'],
      ...(WEBHOOK_SECRET ? { secret_token: WEBHOOK_SECRET } : {}),
    });
    console.log(
      r?.ok
        ? `🤖 Webhook de Telegram configurado: ${fullUrl}`
        : `⚠️ No se pudo configurar el webhook de Telegram: ${JSON.stringify(r)}`
    );
    return;
  }

  if (String(process.env.TELEGRAM_POLLING).toLowerCase() === 'true') {
    const r = await callApi('deleteWebhook', {});
    if (!r?.ok) console.warn('⚠️ No se pudo borrar el webhook previo.');
    pollLoop();
    return;
  }

  console.log('ℹ️ Bot de Telegram sin transporte (define TELEGRAM_WEBHOOK_URL o TELEGRAM_POLLING=true).');
}

export function stopPolling() {
  pollingActive = false;
}
