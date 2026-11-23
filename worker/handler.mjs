const reportKey="published/project-reports.json";
const editors=new Set(["strataliftsolutions@gmail.com","naufalnjr18@gmail.com"]);
const statuses=["Menunggu keputusan","Menunggu arahan perencana","Menunggu klarifikasi","Perlu tindak lanjut","Dalam proses","Selesai"];
const dayMs=86400000;
const mediaPattern=/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Vary":"Cookie"}});
const fail=(msg,status)=>json({error:msg},status);
const canEdit=req=>Boolean(req.headers.get("oai-authenticated-user-id"))&&editors.has((req.headers.get("oai-authenticated-user-email")||"").trim().toLowerCase());
const isText=(v,max)=>typeof v==="string"&&v.trim().length>0&&v.length<=max;
const dateOK=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
function mediaIDs(r){return [...(r.photos||[]).map(p=>p.id),...(r.pdf?[r.pdf]:[])];}
function validate(r,prior){
 if(!r||![r.week,r.contractorWeek].every(n=>Number.isInteger(n)&&n>0&&n<=520))return "Periksa nomor minggu MK dan kontraktor.";
 if(!(dateOK(r.date)||(prior?.date===""&&r.date==="")))return "Isi tanggal awal periode tujuh hari.";
 if(![r.actual,r.plan].every(n=>Number.isFinite(n)&&n>=0&&n<=100&&Math.abs(n*1000-Math.round(n*1000))<0.0001))return "Gunakan persentase 0–100 dengan maksimal tiga angka desimal.";
 if(!isText(r.summary,3000)||!isText(r.source,180))return "Lengkapi ringkasan dan sumber laporan.";
 if(!Array.isArray(r.issues)||r.issues.length>40||!r.issues.every(i=>i&&isText(i.title,140)&&isText(i.pic,140)&&isText(i.category,60)&&isText(i.detail,1200)&&statuses.includes(i.status)))return "Lengkapi judul, kategori, status, penanggung jawab, dan catatan pada setiap isu.";
 if(!Array.isArray(r.photos)||r.photos.length>100||!r.photos.every(p=>p&&typeof p.id==="string"&&mediaPattern.test(p.id)&&!p.id.endsWith(".pdf")&&Number.isInteger(p.day)&&p.day>=0&&p.day<7&&isText(p.caption,220)&&isText(p.location,100)))return "Periksa foto, hari, keterangan, dan lokasi.";
 if(r.pdf&&!(typeof r.pdf==="string"&&mediaPattern.test(r.pdf)&&r.pdf.endsWith(".pdf")))return "Lampiran laporan harus berupa PDF.";
 if(!Array.isArray(r.offDays)||!r.offDays.every(d=>Number.isInteger(d)&&d>=0&&d<7&&!r.photos.some(p=>p.day===d)))return "Hari tanpa pekerjaan tidak dapat berisi foto.";
 if(!r.date&&(r.photos.length||r.offDays.length))return "Tetapkan tanggal awal sebelum mengisi dokumentasi harian.";
 if(new Set(r.photos.map(p=>p.id)).size!==r.photos.length)return "Foto yang sama tercatat lebih dari sekali.";
}
async function current(bucket){const obj=await bucket.get(reportKey);return obj?{reports:(await obj.json()).reports,version:obj.etag}:{reports:seed.reports,version:"initial"};}
const formats={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","application/pdf":"pdf"};
function sniff(b){const s=(i,n)=>String.fromCharCode(...b.slice(i,i+n));if(b[0]===255&&b[1]===216&&b[2]===255)return "jpg";if(b[0]===137&&s(1,3)==="PNG"&&s(4,4)==="\r\n\x1a\n")return "png";if(s(0,4)==="RIFF"&&s(8,4)==="WEBP")return "webp";if(s(0,5)==="%PDF-")return "pdf";}
async function upload(req,env){
 const type=req.headers.get("content-type")?.split(";")[0],ext=formats[type];
 if(!ext)return fail("Gunakan JPG, PNG, WebP, atau PDF.",415);
 const max=ext==="pdf"?12*1024*1024:6*1024*1024;
 if(Number(req.headers.get("content-length"))>max)return fail("Ukuran berkas melebihi batas.",413);
 const body=new Uint8Array(await req.arrayBuffer());
 if(body.length>max)return fail("Ukuran berkas melebihi batas.",413);
 if(sniff(body)!==ext)return fail("Isi berkas tidak sesuai dengan formatnya.",422);
 const id=crypto.randomUUID()+"."+ext;
 await env.BUCKET.put("uploads/"+id,body,{httpMetadata:{contentType:type}});
 return json({id},201);
}
async function publish(req,env){
 if(!req.headers.get("content-type")?.startsWith("application/json"))return fail("Format laporan tidak sesuai.",415);
 const raw=await req.text();if(raw.length>200000)return fail("Laporan terlalu besar.",413);
 let b;try{b=JSON.parse(raw);}catch{return fail("Data tidak terbaca.",400);}
 const data=await current(env.BUCKET);
 if(b?.version!==data.version)return fail("Ada pembaruan lain. Muat ulang dan periksa versi terbaru.",409);
 const r=b.report,prior=data.reports.find(x=>x.week===r?.week);
 if(!["new","edit"].includes(b.mode)||b.mode==="new"&&prior||b.mode==="edit"&&!prior)return fail("Nomor minggu sudah digunakan atau laporan telah berubah.",409);
 const err=validate(r,prior);if(err)return fail(err,422);
 if(r.date&&data.reports.some(x=>x.week!==r.week&&x.date&&Math.abs(Date.parse(x.date)-Date.parse(r.date))<7*dayMs))return fail("Tanggal laporan tumpang tindih dengan minggu yang sudah terbit.",422);
 if(r.date&&data.reports.some(x=>x.week!==r.week&&x.date&&(x.week<r.week)!==(x.date<r.date)))return fail("Urutan tanggal harus mengikuti urutan minggu MK.",422);
 const ids=mediaIDs(r).filter(id=>!mediaIDs(prior||{}).includes(id));
 for(const id of ids)if(!await env.BUCKET.head("uploads/"+id))return fail("Ada lampiran yang belum selesai diunggah.",422);
 const clean={week:r.week,contractorWeek:r.contractorWeek,date:r.date,actual:r.actual,plan:r.plan,summary:r.summary.trim(),source:r.source.trim(),issues:r.issues.map(i=>({title:i.title.trim(),category:i.category.trim(),status:i.status,detail:i.detail.trim(),pic:i.pic.trim()})),photos:r.photos.map(p=>({id:p.id,day:p.day,caption:p.caption.trim(),location:p.location.trim()})),offDays:[...new Set(r.offDays)],pdf:r.pdf||"",updatedAt:new Date().toISOString()};
 if(prior?.reportedDeviation!=null&&prior.plan===r.plan&&prior.actual===r.actual)clean.reportedDeviation=prior.reportedDeviation;
 const reports=[...data.reports.filter(x=>x.week!==r.week),clean].sort((a,b)=>a.week-b.week);
 const written=await env.BUCKET.put(reportKey,JSON.stringify({reports}),{onlyIf:data.version==="initial"?{etagDoesNotMatch:"*"}:{etagMatches:data.version},httpMetadata:{contentType:"application/json"}});
 return written?json({version:written.etag,reports}):fail("Ada pembaruan bersamaan. Muat ulang laporan.",409);
}
async function handle(req,env){
 const url=new URL(req.url),path=url.pathname,editor=canEdit(req);
 if(path==="/api/reports"&&req.method==="GET")return json({...await current(env.BUCKET),baseline,canEdit:editor,signedIn:Boolean(req.headers.get("oai-authenticated-user-id"))});
 if((path==="/api/reports"||path==="/api/upload")&&req.method==="POST"){
  if(!editor)return fail("Login dengan akun pengelola.",403);
  if(req.headers.get("origin")!==url.origin)return fail("Permintaan harus berasal dari dashboard.",403);
  return path==="/api/upload"?upload(req,env):publish(req,env);
 }
 if(!["GET","HEAD"].includes(req.method))return new Response(null,{status:405});
 if(path.startsWith("/media/")){
  const id=path.slice(7);if(!mediaPattern.test(id))return new Response(null,{status:404});
  if(!editor&&!(await current(env.BUCKET)).reports.some(r=>mediaIDs(r).includes(id)))return new Response(null,{status:404});
  const obj=await env.BUCKET.get("uploads/"+id);if(!obj)return new Response(null,{status:404});
  const headers={"Content-Type":obj.httpMetadata.contentType,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
  if(id.endsWith(".pdf"))headers["Content-Disposition"]='attachment; filename="Laporan-mingguan-SMJ.pdf"';
  return new Response(req.method==="HEAD"?null:obj.body,{headers});
 }
 const a=Object.hasOwn(assets,path)?assets[path]:null;if(!a)return new Response("Halaman tidak ditemukan",{status:404});
 return new Response(req.method==="HEAD"?null:a.binary?Uint8Array.from(atob(a.content),c=>c.charCodeAt(0)):a.content,{headers:{"Content-Type":a.type,"Cache-Control":a.binary?"public, max-age=86400":"no-cache","X-Content-Type-Options":"nosniff","Referrer-Policy":"same-origin"}});
}
export default {async fetch(request,env){try{return await handle(request,env)}catch{return fail("Laporan belum dapat dimuat. Coba kembali.",503)}}};