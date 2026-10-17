# GenetikaAI Suno — 3 Menu, Tanpa Login User

## API key pribadi
- Jalankan aplikasi, lalu isi kolom **API Key pribadi** di halaman.
- Key dikirim melalui header `X-API-Key` ke backend untuk setiap request create/status.
- Key tidak ditanam di HTML, tidak ditulis ke `keys.txt`, dan tidak disimpan oleh aplikasi. Refresh halaman berarti perlu memasukkan ulang key.
- Endpoint provider saat ini adalah `https://api.emix.ai/api/v1`; hanya API key yang diterbitkan oleh Emix yang berlaku. API key dari provider lain tidak akan diterima. Jika menempelkan `Bearer <key>`, aplikasi otomatis menghapus awalan `Bearer`. Mengganti key tidak otomatis mengganti provider.
- Jangan membagikan API key atau memakai perangkat publik yang tidak dipercaya.

## Menu yang tersedia
1. Generate Music
2. Upload Cover Audio
3. Upload Extend Cover

## Jalankan lokal
- Node.js 18 atau lebih baru.
- `npm install`
- `npm start`
- Buka `http://localhost:3000`

Untuk Vercel, deploy project seperti biasa. Tidak perlu file `keys.txt` atau login user.


Catatan perbaikan endpoint: dokumentasi resmi Emix Market menetapkan pembuatan task melalui `POST /api/v1/client/tasks` dan pemeriksaan task melalui `GET /api/v1/client/tasks?taskId=...`.
