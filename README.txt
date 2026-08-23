RAILWAY TELEGRAM HTML HOST
==========================

NATIJA
------
Botga test.html yuborasiz.
Bot darhol masalan:
  https://your-app.up.railway.app/5831047
link beradi.

URL DA .html YO'Q.
Har bir faylga yangi 7 xonali random raqam beriladi.
Asosiy URL / ataylab 404 qaytaradi.
Har bir yangi HTML uchun REDEPLOY KERAK EMAS.

1) RAILWAYGA DEPLOY
-------------------
- Railway -> New Project -> Deploy from GitHub yoki upload usulidan foydalaning.
- ZIP ichidagi fayllarni GitHub repositoryga push qilish eng oson.
- Root directory shu loyiha papkasi bo'lsin.
- Start command avtomatik: npm start

2) RAILWAY VARIABLES
--------------------
Railway -> Service -> Variables:

BOT_TOKEN=Telegram bot tokeningiz
OWNER_CHAT_ID=Sizning Telegram chat ID (ixtiyoriy)
DATA_DIR=/app/data

PUBLIC_URL ni qo'ymasangiz ham bo'ladi: bot kelgan request hostidan o'zi link yasaydi.
Agar xohlasangiz:
PUBLIC_URL=https://your-app.up.railway.app

3) RAILWAY VOLUME (TAVSIYA ETILADI)
-----------------------------------
Railway -> Service -> Volumes -> New Volume
Mount Path:
  /app/data

Bu juda muhim: HTML fayllari restart/redeploydan keyin ham saqlanib qolishi uchun.

4) DOMAIN
---------
Railway -> Service -> Settings -> Networking -> Generate Domain

Natijada masalan:
  https://abc-production.up.railway.app

Shu hostdan bot link yasaydi.

5) BOT ISHLATISH
----------------
Botga /start yuboring.
Keyin .html faylni Document qilib yuboring.

Masalan:
  index.html

Natija:
  https://abc-production.up.railway.app/5831047

6) OWNER CHAT ID
----------------
OWNER_CHAT_ID ni bilmasangiz, botga /id yuboring.
Bot sizga Chat ID qaytaradi.
Keyin Railway Variables ichida:
  OWNER_CHAT_ID=raqam
qilib saqlang.

Agar OWNER_CHAT_ID bo'sh qoldirilsa, botga kelgan .html faylni istalgan foydalanuvchi ishlatishi mumkin.

MUHIM
-----
- Telegram Bot API orqali bot faylni 20 MB gacha yuklab oladi.
- Bot long polling ishlatadi, Telegram webhook alohida sozlanmaydi.
- Railwayga bir marta deploy qilgandan keyin yangi HTML fayllar uchun deploy kerak emas.
- Fayl URL faqat 7 xonali raqam: /1234567
