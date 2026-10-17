# GenetikaAI Suno — 3 Menu, Tanpa Login User

## API key pribadi
- Jalankan aplikasi, lalu isi kolom **API Key pribadi** di halaman.
- Key dikirim melalui header `X-API-Key` ke backend untuk setiap request create/status.
- Key tidak ditanam di HTML, tidak ditulis ke `keys.txt`, dan tidak disimpan oleh aplikasi. Refresh halaman berarti perlu memasukkan ulang key.
- Endpoint provider saat ini masih `https://api.emix.ai/api/v1`; masukkan API key yang memang berlaku untuk provider/endpoint tersebut. Mengganti key tidak otomatis mengganti provider.
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
