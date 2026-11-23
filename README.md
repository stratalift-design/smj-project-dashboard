# SMJ Project Dashboard

Dashboard monitoring proyek **Perkuatan Bangunan Kantor SMJ Medan** untuk Sumber Mitra Jaya dan Stratalift Solutions.

**Dashboard aktif:** https://smj-medan-project-monitor.strataliftsolutions.chatgpt.site/

## Fitur

- Ringkasan rencana, realisasi, deviasi progres dalam persen, dan jumlah isu terbuka.
- Pilihan minggu MK dan minggu kontraktor.
- Grafik progres mingguan dan rencana awal bulanan (Kurva S).
- Dokumentasi lapangan per hari, galeri foto, dan tampilan foto besar.
- Daftar isu, penanggung jawab, status, dan tindak lanjut.
- Pengelolaan laporan dengan alur edit, pratinjau, dan terbitkan.
- Lampiran laporan PDF serta tanggal dan angka progres yang dapat diedit.
- Tampilan responsif dengan logo gabungan SMJ–Stratalift yang diberikan tim proyek.

## Teknologi

Frontend HTML, CSS, dan JavaScript tanpa dependensi paket. Backend menggunakan Worker ES Module dengan binding penyimpanan R2 bernama `BUCKET`. Build menggabungkan frontend, font, gambar, data awal, dan backend ke satu Worker.

## Menyiapkan dan memeriksa build

Gunakan Node.js 22 atau lebih baru. Tidak diperlukan `npm install`.

```sh
npm run build
npm run validate
```

Hasil build:

```text
dist/
  .openai/hosting.json
  server/index.js
```

Validasi memeriksa bahwa hasil build merupakan ES Module dengan handler `default.fetch`.

## Struktur proyek

| Lokasi | Isi |
| --- | --- |
| `web/index.html` | Struktur halaman dan identitas proyek |
| `web/style.css` | Tata letak, tipografi, dan tampilan responsif |
| `web/app.js` | Ringkasan, grafik, pilihan minggu, dokumentasi, dan isu |
| `web/editor.js` | Formulir pengelola dan pratinjau sebelum publikasi |
| `worker/handler.mjs` | API laporan, autentikasi editor, unggahan, dan penyajian aset |
| `assets/` | Gambar, logo, dan font lokal |
| `seed.json` | Data awal saat belum ada laporan yang diterbitkan di penyimpanan |
| `baseline.json` | Rencana kumulatif bulanan |
| `scripts/build.mjs` | Pembentukan paket Worker |
| `scripts/validate-artifact.mjs` | Validasi hasil build |
| `.openai/hosting.json` | Identitas Site dan konfigurasi binding |

## Data laporan

Data awal berisi Minggu 13 MK / Minggu 4 kontraktor, rencana 9,469%, dan realisasi 6,225%. Deviasi yang ditampilkan dihitung dari realisasi dikurangi rencana. Tanggal awal sengaja belum diisi agar dapat ditetapkan oleh pengelola.

Setelah pengelola menerbitkan laporan, data tersimpan di R2 pada `published/project-reports.json`; lampiran berada di `uploads/`. Repositori ini memuat kode dan data awal. Data serta unggahan yang diterbitkan setelahnya dikelola oleh penyimpanan aplikasi.

## Hosting dan autentikasi

Aplikasi aktif dihosting melalui Sites. Manifest menyimpan ID Site yang sama agar pembaruan tetap ditujukan ke dashboard yang sudah berjalan. Publikasi memerlukan sumber yang sudah dikomit serta paket `dist/` dari sumber tersebut.

Dashboard dapat dibaca publik. Pengeditan memerlukan identitas yang diteruskan oleh platform hosting dan diperiksa server terhadap daftar editor pada `worker/handler.mjs`. Pada hosting lain, integrasikan autentikasi server tepercaya dan binding R2 yang sesuai sebelum mengaktifkan fitur edit. Header identitas dari permintaan internet biasa tidak boleh dianggap sebagai bukti login.

Backend diperlukan untuk penyimpanan laporan, autentikasi, dan unggahan; proyek ini bukan situs statis GitHub Pages. Menyimpan kode di GitHub tidak memindahkan hosting dashboard secara otomatis.

## Aset dan font

Logo SMJ–Stratalift berasal dari aset yang diberikan tim proyek. Font Poppins dan League Spartan disertakan secara lokal beserta lisensi OFL di `assets/fonts/`. Hak penggunaan logo dan materi proyek mengikuti izin pemiliknya.
