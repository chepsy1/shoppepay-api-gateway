# digitalEVO — Vercel + ShopeePay Gateway

## Arsitektur
- Website: Vercel
- ShopeePay gateway: Vercel Function pada project yang sama
- Data order/payment: Supabase
- Frontend tetap memakai Edge Function `create-qris` dan `check-qris`, tetapi Edge Function meneruskan pembuatan QRIS dan pengecekan pembayaran ke gateway ShopeePay.

## Vercel Environment Variables
Set untuk Production (dan Preview bila diperlukan):
- `SHOPEE_TOKEN` = token internal merchant ShopeePay
- `API_KEY` = rahasia acak untuk gateway
- `QRIS_STATIC` = QRIS statis merchant ShopeePay
- `TELEGRAM_BOT_TOKEN` = opsional
- `TELEGRAM_CHAT_ID` = opsional

## Supabase Edge Function Secrets
Set:
- `PAYMENT_GATEWAY_URL` = URL project Vercel + `/api`, contoh `https://digitalevo.vercel.app/api`
- `PAYMENT_GATEWAY_API_KEY` = sama persis dengan `API_KEY` di Vercel

## Endpoint gateway
- `POST /api/create-qris` body `{ "amount": 15000 }`
- `GET /api/qr/:id`
- `POST /api/check-payment` body `{ "amount": 15000, "startTime": 1760000000 }`

Jangan masukkan `SHOPEE_TOKEN`, `API_KEY`, atau QRIS rahasia ke frontend atau GitHub.
