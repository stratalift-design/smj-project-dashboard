"use strict";
const documentArea = document.querySelector("#document-content");
const documentBytes = size => size >= 1048576 ? (size / 1048576).toLocaleString("id-ID", { maximumFractionDigits: 1 }) + " MB" : Math.max(1, Math.ceil(size / 1024)) + " KB";
async function loadDocuments() {
  documentArea.setAttribute("aria-busy", "true");
  try {
    const response = await fetch("/api/documents", { cache: "no-store" });
    if (!response.ok) throw Error("Dokumen belum dapat dimuat.");
    const data = await response.json();
    document.querySelector("#document-count").textContent = data.documents.length + " dokumen proyek";
    documentArea.innerHTML = (data.canEdit ? '<details class="document-upload"><summary>Unggah dokumen</summary><form id="document-form"><p class="formhint">Dokumen yang diunggah dapat diakses semua pengunjung. Maksimal 10 MB per berkas.</p><div class="form-grid"><label class="field">Judul dokumen<input name="title" required maxlength="140"></label><label class="field">Revisi<input name="revision" required maxlength="30" placeholder="Mis. 01"></label><label class="field">Tanggal dokumen<input name="date" type="date" required></label><label class="field">Berkas<input name="file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" required aria-describedby="document-file-hint"></label><label class="field full">Keterangan (opsional)<textarea name="description" maxlength="600" rows="2"></textarea></label></div><p id="document-file-hint" class="formhint">PDF, Word (DOC/DOCX), atau Excel (XLS/XLSX).</p><p id="document-feedback" role="status" aria-live="polite"></p><button class="btn primary" type="submit">Unggah dan terbitkan</button></form></details>' : '<p class="document-access">Dokumen dapat dibuka dan diunduh. <a href="/signin-with-chatgpt">Masuk sebagai pengelola</a> untuk mengunggah.</p>') +
      '<div class="document-list">' + (data.documents.length ? data.documents.map(d => {
        const type = d.id.split(".").at(-1).toUpperCase(), href = "/documents/" + encodeURIComponent(d.id);
        return '<article class="document-card"><span class="document-type" aria-label="Jenis berkas ' + type + '">' + type + '</span><div class="document-info"><h3>' + safe(d.title) + '</h3><p class="document-meta">Rev. ' + safe(d.revision) + ' · ' + safe(pretty(d.date, { day: "numeric", month: "short", year: "numeric" })) + ' · ' + documentBytes(d.size) + '</p>' + (d.description ? '<p class="document-description">' + safe(d.description) + '</p>' : '') + '<div class="document-actions">' + (type === "PDF" ? '<a href="' + href + '" target="_blank" rel="noopener" aria-label="Buka ' + safe(d.title) + ' di tab baru">Buka dokumen</a>' : '') + '<a href="' + href + '?download=1" download aria-label="Unduh ' + safe(d.title) + '">' + icon("file") + 'Unduh</a></div></div></article>';
      }).join("") : '<div class="document-empty">' + icon("file") + '<h3>Belum ada dokumen</h3><p>Dokumen proyek akan muncul setelah diunggah oleh pengelola.</p></div>') + '</div>';
    const form = document.querySelector("#document-form");
    if (form) {
      form.elements.date.value = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      form.onsubmit = async event => {
        event.preventDefault();
        const file = form.elements.file.files[0], feedback = document.querySelector("#document-feedback");
        if (!file || !file.size || file.size > 10 * 1024 * 1024) { feedback.textContent = "Pilih berkas tidak kosong, maksimal 10 MB."; feedback.setAttribute("role", "alert"); return; }
        const body = new FormData(form), controls = [...form.querySelectorAll("input,textarea,button")];
        controls.forEach(control => control.disabled = true);
        form.setAttribute("aria-busy", "true"); feedback.setAttribute("role", "status"); feedback.textContent = "Mengunggah dokumen…";
        try {
          const upload = await fetch("/api/documents", { method: "POST", body });
          const result = await upload.json().catch(() => ({}));
          if (!upload.ok) throw Error(upload.status === 403 ? "Sesi berakhir. Masuk kembali sebagai pengelola untuk mengunggah." : result.error || "Unggah gagal. Coba kembali.");
          await loadDocuments(); toast("Dokumen berhasil diterbitkan.");
          document.querySelector("#document-title").focus({ preventScroll: true });
        } catch (error) { feedback.setAttribute("role", "alert"); feedback.textContent = error.message; }
        finally { controls.forEach(control => control.disabled = false); form.removeAttribute("aria-busy"); }
      };
    }
  } catch {
    documentArea.innerHTML = '<p class="document-access">Dokumen belum dapat dimuat. <button id="document-retry" class="text-link">Coba kembali</button></p>';
    document.querySelector("#document-retry").onclick = loadDocuments;
  } finally { documentArea.setAttribute("aria-busy", "false"); }
}
loadDocuments();

updateNav();
