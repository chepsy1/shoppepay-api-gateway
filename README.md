# digitalEVO — GitHub / Vercel + Admin Panel

Website digitalEVO dengan katalog Followers Shopee dan Akun Shopee Premium.

## Perubahan versi ini
- Bagian **Cara Order** dan **FAQ** di bawah website dihapus.
- Menu navigasi Cara Order dan FAQ juga dihapus.
- Checkout tetap mengikuti revisi terakhir.
- Ditambahkan **Admin Panel** di `/admin.html`.
- Admin dapat mengubah tulisan, harga, jumlah followers, jumlah terjual, foto produk, header, banner kategori, logo, dan footer tanpa upload HTML lagi.
- Data website dapat disimpan di Supabase sehingga perubahan dari Admin Panel tampil di website.

## Setup Admin Panel (sekali saja)

### 1. Buat project Supabase
Buat project baru di Supabase.

### 2. Jalankan SQL
Buka **SQL Editor** Supabase dan jalankan isi file `supabase.sql`.

### 3. Buat akun admin
Di Supabase buka **Authentication → Users → Add user** lalu buat email + password untuk admin.

### 4. Isi koneksi Supabase
Buka `supabase-config.js` dan isi:

```js
window.SUPABASE_CONFIG = {
  url: 'https://PROJECT-ANDA.supabase.co',
  anonKey: 'ANON_ATAU_PUBLISHABLE_KEY'
};
```

Gunakan **anon/publishable key**, jangan pernah memasukkan `service_role` key ke website.

### 5. Deploy ke Vercel
Upload repository ke GitHub lalu deploy ke Vercel seperti biasa.

### 6. Buka panel
Setelah website online, buka:

`https://domain-anda.com/admin.html`

Login memakai akun admin Supabase.

## Yang bisa diedit dari panel
- Judul dan subtitle bagian Followers
- Badge diskon
- Judul/deskripsi Akun Shopee Premium
- Tulisan bagian kontak
- Logo
- Header
- Banner Followers
- Banner Akun Premium
- Footer
- Harga asli dan harga promo
- Jumlah followers
- Terjual per bulan
- Foto setiap produk Followers
- Foto setiap produk Akun Shopee Premium
- Tambah/hapus produk

## Catatan keamanan
Admin Panel menggunakan Supabase Authentication. Jangan menaruh service-role key di frontend. Untuk penggunaan produksi, sebaiknya batasi policy database/storage hanya untuk akun admin yang Anda gunakan.


## Keamanan Admin (wajib)

Admin panel memakai **Supabase Auth Email + Password** dan **Row Level Security (RLS)**. Login saja belum cukup: hanya user yang UUID-nya terdaftar di `public.admins` yang boleh mengubah tulisan, harga, produk, dan file foto. User login biasa tidak mendapat hak edit.

### Setup admin
1. Di Supabase buka **Authentication → Users → Add user**. Buat email + password admin.
2. Salin **User UID** admin tersebut.
3. Jalankan di SQL Editor:
   ```sql
   insert into public.admins(user_id) values ('UUID-ADMIN-ANDA');
   ```
4. Jalankan seluruh `supabase.sql` terlebih dahulu agar function `is_admin()` dan RLS aktif.
5. Isi `supabase-config.js` dengan **Project URL** dan **anon/publishable key**. Jangan gunakan `service_role`.
6. Deploy ke Vercel. Buka `/admin.html` dan login dengan email/password admin.

### Aturan keamanan
- `site_settings` dan `products`: publik hanya **SELECT**; perubahan hanya admin.
- Storage bucket `site-assets`: publik hanya **membaca**; upload/update/delete hanya admin.
- `public.admins`: tidak dapat dikelola dari browser. Penambahan/pencabutan admin dilakukan dari Supabase SQL/Authentication.
- `service_role` key tidak boleh dimasukkan ke HTML/JavaScript frontend.


## Paket tambahan: ShopeePay API Gateway

Folder `shoppepay-api-gateway/` berisi gateway yang Anda kirim. File `.env` asli tidak disertakan demi keamanan; gunakan `.env.example` sebagai template dan isi rahasia hanya di environment server.

**Penting:** gateway ini belum dihubungkan ke alur checkout website. Website saat ini memanggil Supabase Edge Functions `create-qris` dan `check-qris`, sedangkan gateway memakai endpoint `/create-qris` dan `/check-payment` dengan format data berbeda. Jangan menaruh `API_KEY`, token ShopeePay, atau token Telegram di JavaScript frontend. Sebelum dipakai untuk pembayaran sungguhan, perlu dibuat adapter backend yang aman dan diuji end-to-end.
