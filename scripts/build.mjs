import {readFile, writeFile, mkdir, copyFile} from "node:fs/promises";
const assets = {};
for (const [route,file,type] of [
 ["/","web/index.html","text/html; charset=utf-8"], ["/app.js","web/app.js","application/javascript; charset=utf-8"],
 ["/editor.js","web/editor.js","application/javascript; charset=utf-8"], ["/style.css","web/style.css","text/css; charset=utf-8"], ["/icon.svg","assets/icon.svg","image/svg+xml"],
 ["/office-blueprint.jpg","assets/office-blueprint.jpg","image/jpeg"],
 ["/logo-smj-stratalift-v2.jpeg","assets/logo-smj-stratalift-v2.jpeg","image/jpeg"],
 ["/logo-smj.png","assets/logo-smj.png","image/png"], ["/logo-stratalift.png","assets/logo-stratalift.png","image/png"],
 ...[400,500,600,700].map(weight=>["/fonts/poppins-"+weight+".ttf","assets/fonts/poppins-"+weight+".ttf","font/ttf"]),
 ["/fonts/league-spartan-700.ttf","assets/fonts/league-spartan-700.ttf","font/ttf"]
]) {
 const binary = type.startsWith("image/") && type !== "image/svg+xml" || type === "font/ttf";
 const bytes = await readFile(file);
 assets[route] = {type, binary, content: bytes.toString(binary?"base64":"utf8")};
}
const seed=JSON.parse(await readFile("seed.json","utf8"));
const baseline=JSON.parse(await readFile("baseline.json","utf8"));
const api=await readFile("worker/handler.mjs","utf8");
await mkdir("dist/server",{recursive:true});
await mkdir("dist/.openai",{recursive:true});
await writeFile("dist/server/index.js","const assets = "+JSON.stringify(assets)+";\nconst seed = "+JSON.stringify(seed)+";\nconst baseline = "+JSON.stringify(baseline)+";\n"+api);
await copyFile(".openai/hosting.json","dist/.openai/hosting.json");
console.log("Compiled dashboard and report service.");
