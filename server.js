import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN?.trim();
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID?.trim() || '';
const DATA_DIR = process.env.DATA_DIR?.trim() || '/app/data';
const PUBLIC_URL = process.env.PUBLIC_URL?.trim().replace(/\/$/, '') || '';
const RAILWAY_PUBLIC_DOMAIN = process.env.RAILWAY_PUBLIC_DOMAIN?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '') || '';

if (!BOT_TOKEN) {
  console.error('BOT_TOKEN is missing. Set it in Railway Variables.');
  process.exit(1);
}

await fs.mkdir(DATA_DIR, { recursive: true });

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function text(res, status, body, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
  res.end(body);
}

function random7() {
  return String(crypto.randomInt(1_000_000, 10_000_000));
}

async function uniqueId() {
  for (let i = 0; i < 50; i++) {
    const id = random7();
    try {
      await fs.access(path.join(DATA_DIR, id));
    } catch {
      return id;
    }
  }
  throw new Error('Could not generate a unique 7-digit ID');
}

async function tg(method, body) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`${method}: ${JSON.stringify(data)}`);
  return data.result;
}

async function send(chatId, message) {
  return tg('sendMessage', {
    chat_id: chatId,
    text: message,
    disable_web_page_preview: true
  });
}

function getPublicBase(request) {
  if (PUBLIC_URL) return PUBLIC_URL;
  if (RAILWAY_PUBLIC_DOMAIN) return `https://${RAILWAY_PUBLIC_DOMAIN}`;
  const host = request.headers.host;
  if (!host) throw new Error('Public hostname not available. Set PUBLIC_URL in Railway Variables.');
  const proto = request.headers['x-forwarded-proto'] || 'https';
  return `${proto}://${host}`;
}

// Telegram retries webhook deliveries in some failure cases. Keep a process-local
// update cache so one update can never be handled twice by this process.
const seenUpdates = new Set();
const MAX_SEEN_UPDATES = 5000;

function markUpdateSeen(updateId) {
  if (seenUpdates.has(updateId)) return false;
  seenUpdates.add(updateId);
  if (seenUpdates.size > MAX_SEEN_UPDATES) {
    const first = seenUpdates.values().next().value;
    seenUpdates.delete(first);
  }
  return true;
}

async function handleUpdate(update, request) {
  const updateId = update?.update_id;
  if (Number.isInteger(updateId) && !markUpdateSeen(updateId)) {
    console.log(`Duplicate update ignored: ${updateId}`);
    return;
  }

  const m = update?.message;
  if (!m?.chat?.id) return;

  const chatId = String(m.chat.id);
  const textValue = String(m.text || '').trim();

  if (textValue === '/id') {
    await send(chatId, `Chat ID: ${chatId}`);
    return;
  }

  if (OWNER_CHAT_ID && chatId !== OWNER_CHAT_ID) return;

  if (textValue === '/start') {
    await send(chatId, '✅ Tayyor. .html faylni Document qilib yuboring. Men 7 xonali random link qaytaraman.');
    return;
  }

  const doc = m.document;
  if (!doc) return;

  const name = String(doc.file_name || '').trim();
  if (!/\.(html|htm)$/i.test(name)) {
    await send(chatId, '❌ Faqat .html yoki .htm fayl yuboring.');
    return;
  }

  const size = Number(doc.file_size || 0);
  if (size > 20 * 1024 * 1024) {
    await send(chatId, '❌ Fayl 20 MB dan katta.');
    return;
  }

  try {
    const file = await tg('getFile', { file_id: doc.file_id });
    if (!file?.file_path) throw new Error('Telegram file path topilmadi');

    const r = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`);
    if (!r.ok) throw new Error(`Faylni Telegramdan olishda xato: ${r.status}`);

    const id = await uniqueId();
    const target = path.join(DATA_DIR, id);
    const buffer = Buffer.from(await r.arrayBuffer());
    await fs.writeFile(target, buffer, { flag: 'wx' });

    const base = getPublicBase(request);
    await send(chatId, `✅ Tayyor!\n\n${base}/${id}`);
    console.log(`Created ${id} for update ${updateId ?? 'unknown'}`);
  } catch (err) {
    console.error(err);
    await send(chatId, `❌ Xato: ${err?.message || 'unknown error'}`);
  }
}

async function setupWebhook() {
  const domain = RAILWAY_PUBLIC_DOMAIN || (PUBLIC_URL ? new URL(PUBLIC_URL).host : '');
  if (!domain) {
    throw new Error('Railway public domain not found. Generate a Railway domain first, or set PUBLIC_URL.');
  }

  const webhookUrl = `${PUBLIC_URL || `https://${domain}`}/telegram/webhook`;
  const result = await tg('setWebhook', {
    url: webhookUrl,
    allowed_updates: ['message'],
    drop_pending_updates: true,
    max_connections: 40
  });
  console.log(`Telegram webhook set: ${webhookUrl}`, result);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, { ok: true });
    }

    if (req.method === 'POST' && url.pathname === '/telegram/webhook') {
      let body = '';
      for await (const chunk of req) body += chunk;

      let update;
      try {
        update = JSON.parse(body);
      } catch {
        return text(res, 400, 'Bad Request');
      }

      // Acknowledge Telegram immediately. This prevents slow file downloads from
      // causing Telegram to retry the same update.
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('OK');

      // Process asynchronously after the HTTP 200 response.
      void handleUpdate(update, req).catch(err => {
        console.error('Webhook update error:', err?.message || err);
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return text(res, 405, 'Method Not Allowed');
    }

    if (url.pathname === '/') {
      return text(res, 404, '404 Not Found');
    }

    const id = decodeURIComponent(url.pathname.slice(1));
    if (!/^\d{7}$/.test(id)) {
      return text(res, 404, '404 Not Found');
    }

    let html;
    try {
      html = await fs.readFile(path.join(DATA_DIR, id));
    } catch {
      return text(res, 404, '404 Not Found');
    }

    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff'
    });
    if (req.method === 'HEAD') return res.end();
    res.end(html);
  } catch (e) {
    console.error(e);
    text(res, 500, 'Internal Server Error');
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`HTTP server listening on ${PORT}`);
  try {
    await setupWebhook();
  } catch (e) {
    console.error('Telegram webhook setup error:', e?.message || e);
  }
});
