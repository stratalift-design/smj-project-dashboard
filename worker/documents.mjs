const documentsKey = "published/project-documents.json";
const documentPattern = /^[0-9a-f-]{36}\.(pdf|doc|docx|xls|xlsx)$/;
const documentTypes = {
  pdf: "application/pdf", doc: "application/msword", xls: "application/vnd.ms-excel",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function validDocument(bytes, extension) {
  if (extension === "pdf") return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  if (extension === "doc" || extension === "xls") {
    if (![208, 207, 17, 224, 161, 177, 26, 225].every((v, i) => bytes[i] === v)) return false;
    const streams = new TextDecoder("utf-16le").decode(bytes);
    return extension === "doc" ? streams.includes("WordDocument\0") : streams.includes("Workbook\0") || streams.includes("Book\0");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let end = bytes.length - 22; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length) continue;
    const count = view.getUint16(end + 10, true), limit = view.getUint32(end + 12, true);
    let offset = view.getUint32(end + 16, true);
    if (!count || count > 10000 || offset + limit > end) return false;
    const names = new Set();
    for (let i = 0; i < count; i++) {
      if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50 || view.getUint16(offset + 8, true) & 1) return false;
      const length = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
      if (offset + 46 + length + extra + comment > end) return false;
      names.add(new TextDecoder().decode(bytes.slice(offset + 46, offset + 46 + length)));
      offset += 46 + length + extra + comment;
    }
    return names.has("[Content_Types].xml") && names.has(extension === "docx" ? "word/document.xml" : "xl/workbook.xml");
  }
  return false;
}

async function readDocuments(bucket) {
  const object = await bucket.get(documentsKey);
  return object ? { documents: (await object.json()).documents, version: object.etag } : { documents: [], version: "initial" };
}

async function handleDocuments(req, env, editor) {
  const url = new URL(req.url), path = url.pathname;
  if (path === "/api/documents") {
    if (req.method === "GET") return json({ documents: (await readDocuments(env.BUCKET)).documents, canEdit: editor });
    if (req.method !== "POST") return new Response(null, { status: 405 });
    if (!editor || req.headers.get("origin") !== url.origin) return fail("Login sebagai pengelola untuk mengunggah dokumen.", 403);
    if (!req.headers.get("content-type")?.startsWith("multipart/form-data")) return fail("Gunakan formulir unggah dokumen.", 415);
    if (Number(req.headers.get("content-length")) > 11 * 1024 * 1024) return fail("Berkas maksimal 10 MB.", 413);
    let form;
    try { form = await req.formData(); } catch { return fail("Formulir tidak terbaca.", 400); }
    const title = form.get("title"), revision = form.get("revision"), date = form.get("date"), description = form.get("description");
    if (!isText(title, 140) || !isText(revision, 30) || !dateOK(date) || typeof description !== "string" || description.length > 600) return fail("Periksa judul, revisi, tanggal, dan keterangan dokumen.", 422);
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function" || typeof file.name !== "string" || !file.name.length || file.name.length > 180 || /[\x00-\x1f\x7f/\\]/.test(file.name)) return fail("Pilih berkas dengan nama yang valid.", 422);
    const extension = file.name.split(".").at(-1).toLowerCase();
    if (!Object.hasOwn(documentTypes, extension)) return fail("Gunakan PDF, DOC, DOCX, XLS, atau XLSX.", 415);
    if (!file.size || file.size > 10 * 1024 * 1024) return fail("Berkas tidak boleh kosong dan maksimal 10 MB.", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validDocument(bytes, extension)) return fail("Isi berkas tidak sesuai format dokumen. Gunakan berkas Office tanpa password.", 422);
    const document = { id: crypto.randomUUID() + "." + extension, title: title.trim(), revision: revision.trim(), date, description: description.trim(), name: file.name, size: file.size, uploadedAt: new Date().toISOString() };
    await env.BUCKET.put("documents/" + document.id, bytes, { httpMetadata: { contentType: documentTypes[extension] } });
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await readDocuments(env.BUCKET);
      const written = await env.BUCKET.put(documentsKey, JSON.stringify({ documents: [document, ...current.documents] }), {
        onlyIf: current.version === "initial" ? { etagDoesNotMatch: "*" } : { etagMatches: current.version }, httpMetadata: { contentType: "application/json" },
      });
      if (written) return json({ document }, 201);
    }
    return fail("Ada pembaruan bersamaan. Periksa daftar dokumen lalu coba kembali.", 409);
  }
  if (!path.startsWith("/documents/")) return null;
  if (!["GET", "HEAD"].includes(req.method)) return new Response(null, { status: 405 });
  const id = path.slice(11);
  if (!documentPattern.test(id)) return new Response(null, { status: 404 });
  const document = (await readDocuments(env.BUCKET)).documents.find(d => d.id === id);
  if (!document) return new Response(null, { status: 404 });
  const object = await env.BUCKET.get("documents/" + id);
  if (!object) return new Response(null, { status: 404 });
  const extension = id.split(".").at(-1), disposition = extension === "pdf" && url.searchParams.get("download") !== "1" ? "inline" : "attachment";
  const filename = encodeURIComponent(document.name).replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16));
  return new Response(req.method === "HEAD" ? null : object.body, { headers: {
    "Content-Type": documentTypes[extension], "Content-Length": String(document.size), "Content-Disposition": disposition + '; filename="document.' + extension + '"; filename*=UTF-8\'\'' + filename,
    "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox",
  } });
}
