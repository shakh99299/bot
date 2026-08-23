const MAX_TELEGRAM_FILE_BYTES = 20 * 1024 * 1024;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8' },
  });
}

function makeRandomId() {
  return String(Math.floor(1000000 + Math.random() * 9000000));
}

function isHtmlFile(name) {
  return /\.html?$/i.test(String(name || '').trim());
}

async function telegram(env, method, body) {
  const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!data.ok) throw new Error(`Telegram ${method}: ${JSON.stringify(data)}`);
  return data.result;
}

async function handleTelegram(update, env, request) {
  const message = update?.message;
  if (!message?.chat?.id) return new Response('ok');

  const chatId = String(message.chat.id);
  const text = message.text || message.caption || '';

  // Lets the owner discover their chat id before setting OWNER_CHAT_ID.
  if (text.trim() === '/id') {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: `Chat ID: ${chatId}`,
    });
    return new Response('ok');
  }

  if (env.OWNER_CHAT_ID && chatId !== String(env.OWNER_CHAT_ID).trim()) {
    return new Response('ok');
  }

  if (text.trim() === '/start') {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: 'HTML hosting bot tayyor. .html fayl yuboring — men darhol 7 xonali public link beraman.',
    });
    return new Response('ok');
  }

  if (!message.document) return new Response('ok');

  const originalName = message.document.file_name || 'page.html';
  if (!isHtmlFile(originalName)) {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: 'Faqat .html yoki .htm fayl yuboring.',
    });
    return new Response('ok');
  }

  const size = Number(message.document.file_size || 0);
  if (size > MAX_TELEGRAM_FILE_BYTES) {
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: 'Fayl 20 MB dan katta. Telegram Bot API hozircha botlar uchun 20 MB gacha yuklab olishni qo‘llaydi.',
    });
    return new Response('ok');
  }

  try {
    // 1) Ask Telegram for a temporary file path.
    const file = await telegram(env, 'getFile', { file_id: message.document.file_id });
    if (!file?.file_path) throw new Error('Telegram file_path missing');

    // 2) Stream Telegram's file directly into R2 (no redeploy, no local server).
    const tgFile = await fetch(`https://api.telegram.org/file/bot${env.BOT_TOKEN}/${file.file_path}`);
    if (!tgFile.ok || !tgFile.body) throw new Error(`Telegram file download failed: ${tgFile.status}`);

    // Store under a random 7-digit ID. The public URL has no .html suffix.
    let id;
    for (let i = 0; i < 10; i++) {
      const candidate = makeRandomId();
      const existing = await env.HTML_BUCKET.head(candidate);
      if (!existing) {
        id = candidate;
        break;
      }
    }
    if (!id) throw new Error('Unique link ID could not be generated');

    await env.HTML_BUCKET.put(id, tgFile.body, {
      httpMetadata: {
        contentType: 'text/html; charset=UTF-8',
        cacheControl: 'public, max-age=60',
      },
      customMetadata: {
        uploadedBy: chatId,
        originalName,
      },
    });

    const publicUrl = new URL('/' + id, request.url).href;

    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      disable_web_page_preview: true,
      text: `✅ Tayyor!\n\n${publicUrl}`,
    });
  } catch (err) {
    console.error(err);
    await telegram(env, 'sendMessage', {
      chat_id: message.chat.id,
      text: `❌ Yuklashda xato: ${err.message || 'unknown error'}`,
    });
  }

  return new Response('ok');
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // Telegram webhook endpoint. The random secret is part of the URL.
      if (request.method === 'POST' && url.pathname === `/webhook/${env.WEBHOOK_SECRET}`) {
        const secretHeader = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (env.WEBHOOK_SECRET && secretHeader !== env.WEBHOOK_SECRET) {
          return new Response('forbidden', { status: 403 });
        }
        const update = await request.json();
        return handleTelegram(update, env, request);
      }

      if (request.method !== 'GET' && request.method !== 'HEAD') {
        return new Response('Method Not Allowed', { status: 405 });
      }

      // Main URL intentionally returns 404.
      if (url.pathname === '/') {
        return new Response('404 Not Found', { status: 404 });
      }

      const key = decodeURIComponent(url.pathname.slice(1));
      if (!key || key.includes('/') || key.includes('\\')) {
        return new Response('404 Not Found', { status: 404 });
      }

      const object = await env.HTML_BUCKET.get(key);
      if (!object) return new Response('404 Not Found', { status: 404 });

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('x-content-type-options', 'nosniff');

      if (request.method === 'HEAD') return new Response(null, { headers });
      return new Response(object.body, { headers });
    } catch (err) {
      console.error(err);
      return json({ error: 'Internal server error' }, 500);
    }
  },
};
