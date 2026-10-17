# Audit Suno API — Emix

Tanggal pemeriksaan: 2026-10-15

## Temuan utama yang diperbaiki

- Bug penting di `lib/handlers.js`: kode sebelumnya menghapus `input.model` sebelum request dikirim. Dokumentasi Generate Music mewajibkan `input.customMode`, `input.instrumental`, dan `input.model`; penghapusan ini dapat memicu pesan `This field is required`.
- `variety` sebelumnya dikirim sebagai string `"normal"`, sedangkan dokumentasi Generate Music meminta integer 0–4. Sekarang UI mengirim angka `1`.
- Validasi Generate sekarang mengikuti aturan Custom Mode / Non-custom Mode dan batas karakter yang didokumentasikan untuk model V6.
- Upload audio tetap menggunakan URL dari alur Image2URL yang sudah ada; tidak mengganti ke Vercel Blob.
- Pesan respons provider tetap diteruskan untuk debugging.

## Endpoint Suno yang terdaftar dalam katalog resmi Emix

Dokumentasi katalog Emix mencantumkan endpoint berikut di `POST /api/v1/client/tasks`:

1. `suno/generate` — Generate Music
2. `suno/extend` — Extend Music
3. `suno/upload-and-cover-audio` — Upload And Cover Audio
4. `suno/upload-and-extend-audio` — Upload And Extend Audio
5. `suno/add-instrumental` — Add Instrumental to Music
6. `suno/add-vocals` — Add Vocals to Music
7. `suno/timestamped-lyrics` — Get Timestamped Lyrics
8. `suno/boost-music-style` — Boost Music Style
9. `suno/cover-generate` — Generate Music Cover
10. `suno/replace-section` — Replace Music Section
11. `suno/generate-persona` — Generate Persona
12. `suno/mashup` — Generate Mashup Music
13. Vocal & Instrument Stem Separation
14. Generate MIDI from Audio
15. Callback endpoints for generation/extension/cover/replacement/upload tasks

Dokumentasi: https://docs.emix.ai/ — buka bagian Music Models → Suno API.

## Catatan penting

- Daftar di atas membuktikan endpoint tercantum di katalog; tidak berarti setiap endpoint sudah diuji live dengan API key.
- Fitur yang memerlukan input khusus (misalnya `audioId`, `audioIds`, waktu mulai/akhir, persona, atau URL audio) perlu diuji satu per satu di akun Emix.
- `HTTP 200` hanya menyatakan permintaan diterima / respons berhasil secara HTTP; status task dan hasil akhir harus dibaca dari task info API.
- Jangan masukkan API key ke file frontend. Gunakan environment variable server-side.
