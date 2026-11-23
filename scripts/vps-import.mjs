import { diskBucket } from './vps-server.mjs';

const source = 'https://smj-medan-project-monitor.strataliftsolutions.chatgpt.site';
const bucket = diskBucket(process.env.DATA_DIR || '/var/lib/smj');
if (await bucket.head('published/project-reports.json')) {
  console.log('Data VPS sudah ada; impor dilewati agar tidak menimpa laporan.');
} else {
  async function download(path, max) {
    const response = await fetch(source + path, { redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error('Impor gagal: HTTP ' + response.status);
    let size = 0; const chunks = [];
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > max) throw Error('Ukuran data impor melebihi batas.');
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const { reports } = JSON.parse(await download('/api/reports', 10 * 1024 * 1024));
  if (!Array.isArray(reports) || !reports.length || !reports.every(r => Number.isInteger(r.week) && Array.isArray(r.photos))) throw Error('Format laporan impor tidak valid.');
  const ids = new Set(reports.flatMap(r => [...r.photos.map(p => p.id), ...(r.pdf ? [r.pdf] : [])]));
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(id)) throw Error('Nama lampiran impor tidak valid.');
    await bucket.put('uploads/' + id, await download('/media/' + id, 12 * 1024 * 1024));
  }
  const written = await bucket.put('published/project-reports.json', JSON.stringify({ reports }), { onlyIf: { etagDoesNotMatch: '*' } });
  if (!written) throw Error('Data berubah selama impor; laporan tidak ditimpa.');
  console.log(`Impor selesai: ${reports.length} laporan, ${ids.size} lampiran.`);
}
