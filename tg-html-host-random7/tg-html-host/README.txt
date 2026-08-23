TELEGRAM HTML HOST — 1 MARTALIK SOZLASH
=======================================

Natija:
- Asosiy URL: https://<worker>.workers.dev/ -> 404
- Botga test.html yuboriladi
- Bot darhol: https://<worker>.workers.dev/test.html linkini qaytaradi
- Yangi fayl qo'shish uchun QAYTA DEPLOY KERAK EMAS.
- HTML fayllar R2'ga saqlanadi.

TALABLAR
--------
1) Cloudflare account.
2) Node.js o'rnatilgan bo'lsin.
3) Telegram bot tokeni (@BotFather'dan).

1-QADAM: INSTALL
-----------------
Terminalda:
  npm install
  npx wrangler login

2-QADAM: R2 BUCKET
------------------
  npx wrangler r2 bucket create telegram-html-host-files

3-QADAM: DEPLOY
---------------
  npx wrangler deploy

Bu buyruq oxirida sizga worker URL beradi:
  https://telegram-html-host.<subdomain>.workers.dev

Uni nusxa oling.

4-QADAM: SECRETLAR
------------------
Bot tokenini kiriting:
  npx wrangler secret put BOT_TOKEN

Keyin owner chat id:
  npx wrangler secret put OWNER_CHAT_ID

Webhook secret uchun istalgan uzun random matn kiriting, masalan:
  npx wrangler secret put WEBHOOK_SECRET

5-QADAM: WEBHOOK
----------------
PowerShell'da:
  curl.exe -X POST "https://api.telegram.org/botBOT_TOKENINGIZ/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"WORKER_URL/webhook/WEBHOOK_SECRETINGIZ\",\"secret_token\":\"WEBHOOK_SECRETINGIZ\",\"drop_pending_updates\":true}"

MASALAN:
  curl.exe -X POST "https://api.telegram.org/bot123456:ABC/setWebhook" -H "Content-Type: application/json" -d "{\"url\":\"https://telegram-html-host.example.workers.dev/webhook/MySecret123\",\"secret_token\":\"MySecret123\",\"drop_pending_updates\":true}"

6-QADAM: OWNER CHAT ID NI OLISH
--------------------------------
Avval OWNER_CHAT_ID ni hali qo'ymagan bo'lsangiz, botga /id yuboring.
Bot Chat ID ni qaytaradi.
Keyin:
  npx wrangler secret put OWNER_CHAT_ID

Shundan keyin botni ishlating.

ISH LATISH
----------
Botga:
  test.html

faylni Document sifatida yuboring.
Bot:
  ✅ Tayyor!
  https://<worker>.workers.dev/test.html

ASOSIY URL
----------
https://<worker>.workers.dev/

Bu URL ataylab 404 qaytaradi.

MUHIM
-----
- Telegram Bot API botlar uchun faylni yuklab olishni 20 MB gacha qo'llaydi.
- R2 Standard free tier: 10 GB-month storage, 1M Class A requests, 10M Class B requests/month; egress free.
- Workers Free: 100,000 requests/day.
- Bir xil fayl nomi qayta yuborilsa, o'sha URLdagi fayl yangilanadi.
- Fayl nomidagi slash/backslash xavfsizlik uchun almashtiriladi.
