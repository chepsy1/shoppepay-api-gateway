# digitalEVO — DANA Dynamic QRIS

## Arsitektur
Frontend -> `create-qris` -> DANA Generate QRIS -> QR displayed.
DANA -> `qris-webhook` -> `payments.status = PAID`.
Frontend -> `check-qris` polls payment status.

DANA documents QRIS MPM Generate QRIS at `/v1.0/qr/qr-mpm-generate.htm`, and Finish Notify at `/v1.0/debit/notify`.
The implementation uses DANA SNAP asymmetric RSA-SHA256 signatures. Request timestamps and QRIS validity timestamps are formatted in Jakarta time with the required `+07:00` offset. See official docs linked below.

## Supabase setup
1. Run `supabase.sql`.
2. Deploy:
   - `supabase functions deploy create-qris --no-verify-jwt`
   - `supabase functions deploy check-qris --no-verify-jwt`
   - `supabase functions deploy qris-webhook --no-verify-jwt`
3. Configure Edge Function secrets (do NOT put these in frontend):
   - `DANA_BASE_URL=https://api.sandbox.dana.id`
   - `DANA_MERCHANT_ID=...`
   - `DANA_PARTNER_ID=...`
   - `DANA_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----...`
   - `DANA_PUBLIC_KEY=-----BEGIN PUBLIC KEY-----...` (DANA public key for webhook verification)
   - `DANA_STORE_ID=...`
   - `DANA_CHANNEL_ID=...` (required; use the channel/device ID confirmed for your DANA integration. Do not copy the sample value from API documentation.)
   - `DANA_ORIGIN=https://your-domain.example` (if required by your DANA setup)
4. Configure DANA Finish Notify URL:
   `https://<SUPABASE_PROJECT_REF>.supabase.co/functions/v1/qris-webhook`
5. Start with DANA Sandbox and its Sandbox Tools. Switch `DANA_BASE_URL` and production credentials only after DANA approves/activates production access.

## Important
The frontend only sends category/qty and customer fields. The amount is looked up from `products` inside the Edge Function, preventing the browser from changing the price.
The private key is never included in this project bundle.

## Official DANA docs
- https://dashboard.dana.id/api-docs-v2/api/qris-acquirer/generate-qris
- https://dashboard.dana.id/api-docs-v2/api/qris-acquirer/finish-notify
- https://dashboard.dana.id/api-docs-v2/guide/authentication/authentication-asymmetric
