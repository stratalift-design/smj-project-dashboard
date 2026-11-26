# SMJ Project Dashboard

## Deployment VPS — smj.stratalift.co.id

Implementasi VPS tersedia pada branch `codex/vps-deployment`. Backend Worker dan validasi laporan tetap dipakai melalui adapter Node.js 22, tanpa dependency npm tambahan. Data dan lampiran disimpan di `/var/lib/smj`; frontend tidak disajikan langsung dari direktori repository.

Di VPS, jalankan sekali:

```sh
sudo bash /var/www/smj/deploy/install.sh
```

Script menguji aplikasi, membuat akun service `smj`, meminta password pengelola `admin` minimal 8 karakter, mengimpor laporan dan lampiran publik dari Site lama apabila storage lokal masih kosong, memasang service systemd, serta mengaktifkan Nginx dan sertifikat Let's Encrypt. DNS A harus menunjuk ke VPS dan port 80/443 harus terbuka. Script melakukan reload Nginx setelah `nginx -t`; service SMJ direstart. Site lain tidak diubah. Grup direktori `/var/www/smj` menjadi `smj` dengan mode `0750`, pemilik tetap `andreas`.

Kredensial berupa hash scrypt disimpan di `/etc/smj.env` dengan mode `0640`, bukan Git. Login melalui tombol **Kelola dashboard**. Session cookie berlaku delapan jam, `Secure`, `HttpOnly`, `SameSite=Strict`; logout mencabut session. Restart service mengakhiri semua session. Pengelola dapat logout melalui `/signout-with-chatgpt`. Daftar editor email Worker lama hanya menerima identitas internal yang disuntikkan adapter setelah login; header identitas dari internet dibuang.

```sh
sudo systemctl status smj --no-pager
sudo journalctl -u smj -n 50 --no-pager
curl --fail https://smj.stratalift.co.id/api/reports
sudo certbot renew --dry-run
```

Pembaruan kode: build dan jalankan `node scripts/vps-test.mjs`, lalu `sudo systemctl restart smj`. Adapter storage mendukung **satu proses Node**; jangan memakai cluster atau beberapa instance pada storage yang sama. Penulisan laporan atomik menggunakan ETag; riwayat versi sebelumnya tersedia di `/var/lib/smj/history`. Riwayat ini belum menggantikan backup ke lokasi lain. Backup seluruh `/var/lib/smj` secara terjadwal ke storage terpisah; sertakan `/etc/smj.env` dengan akses terbatas. Lampiran yang dilepas dari laporan tetap disimpan, sehingga penggunaan disk perlu dipantau.

Impor awal merupakan salinan satu kali. Setelah domain VPS aktif, gunakan domain VPS untuk mengedit agar data tidak berbeda dengan Site lama. Jangan menghapus Site atau storage R2 lama sebelum laporan dan lampiran hasil impor diverifikasi.

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

## Arsip dokumen proyek

Tab **Dokumen** berada paling kiri pada navigasi. Arsip berlaku untuk seluruh proyek, terpisah dari minggu laporan. Semua pengunjung dapat melihat daftar serta mengunduh berkas. PDF dapat dibuka pada tab baru; berkas Office diunduh untuk dibuka dengan aplikasi yang sesuai.

Pengelola login dapat mengunggah satu berkas per formulir dengan judul, revisi, tanggal dokumen, serta keterangan opsional. Format: PDF, DOC, DOCX, XLS, XLSX; maksimum 10 MB. Server memeriksa ekstensi, signature format, ukuran, origin request, dan identitas pengelola. Ini bukan pemindai antivirus; unggah hanya dokumen tepercaya.

Metadata tersimpan di `/var/lib/smj/published/project-documents.json`, berkas di `/var/lib/smj/documents/`, riwayat metadata di `/var/lib/smj/history/`. Penulisan metadata menggunakan ETag dan rename atomik; hanya berkas yang tercatat pada metadata dapat diakses. Dokumen yang gagal tercatat tidak disajikan publik, tetapi dapat tetap memakai disk. Tidak ada penghapusan atau penggantian berkas; revisi baru diunggah sebagai entri baru. Backup `/var/lib/smj` mencakup arsip ini.

Validasi tambahan: `node scripts/vps-test.mjs` menguji akses publik, upload berizin, format Office/PDF, batas ukuran, unduhan, persistensi, serta upload bersamaan tanpa menyentuh data produksi. Setelah build, restart service SMJ untuk memuat perubahan.
