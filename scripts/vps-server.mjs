import { createServer } from 'node:http';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, mkdirSync, renameSync, linkSync, openSync, fsyncSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import worker from '../dist/server/index.js';

const deriveKey = promisify(scrypt);
const reportKey = 'published/project-reports.json';
const mediaKey = /^uploads\/[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/;
const mime = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' };
const digest = value => createHash('sha256').update(value).digest('hex');
const equal = (a, b) => Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function diskBucket(root) {
  mkdirSync(join(root, 'history'), { recursive: true, mode: 0o700 });
  function file(key) {
    if (key !== reportKey && !mediaKey.test(key)) throw Error('Invalid storage key');
    return join(root, key);
  }
  function read(key) {
    try { return readFileSync(file(key)); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  }
  function object(key, body) {
    return body === null ? null : {
      body, etag: digest(body), json: async () => JSON.parse(body),
      httpMetadata: { contentType: key === reportKey ? 'application/json' : mime[key.split('.').at(-1)] },
    };
  }
  return {
    async get(key) { return object(key, read(key)); },
    async head(key) { const value = object(key, read(key)); return value && { etag: value.etag }; },
    async put(key, value, options = {}) {
      // ponytail: one Node process serializes disk writes; use a database before adding replicas.
      const previous = read(key), condition = options.onlyIf;
      if (condition?.etagDoesNotMatch === '*' && previous !== null) return null;
      if (condition?.etagMatches && (previous === null || digest(previous) !== condition.etagMatches)) return null;
      const target = file(key), temp = target + '.' + randomBytes(12).toString('hex') + '.tmp';
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      try {
        writeFileSync(temp, value, { flag: 'wx', mode: 0o600 });
        const fd = openSync(temp, 'r');
        try { fsyncSync(fd); } finally { closeSync(fd); }
        if (key === reportKey && previous !== null) {
          try { linkSync(target, join(root, 'history', digest(previous) + '.json')); }
          catch (error) { if (error.code !== 'EEXIST') throw error; }
        }
        renameSync(temp, target);
        const directory = openSync(dirname(target), 'r');
        try { fsyncSync(directory); } finally { closeSync(directory); }
      } finally {
        try { unlinkSync(temp); } catch (error) { if (error.code !== 'ENOENT') throw error; }
      }
      return { etag: digest(value) };
    },
  };
}

const loginPage = message => new Response(`<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login pengelola SMJ</title><link rel="stylesheet" href="/style.css"><main><h1>Login pengelola SMJ</h1><p role="alert">${message}</p><form method="post"><p><label>Username <input name="username" autocomplete="username" required maxlength="100"></label></p><p><label>Password <input name="password" type="password" autocomplete="current-password" required maxlength="1024"></label></p><button type="submit">Masuk</button></form><p><a href="/">Kembali ke dashboard</a></p></main></html>`, {
  status: message ? 401 : 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
});

export function createApp(config) {
  const origin = new URL(config.origin).origin;
  if (!config.username || !/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(config.passwordHash || '')) throw Error('Missing or invalid login configuration');
  const bucket = diskBucket(config.dataDir), attempts = new Map(), sessions = new Map();
  const cookieName = '__Host-smj_session';
  const sessionToken = headers => (headers.get('cookie') || '').split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1) || '';
  function authenticated(headers) {
    return (sessions.get(sessionToken(headers)) || 0) > Date.now();
  }
  const redirect = cookie => new Response(null, { status: 303, headers: { Location: '/', 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } });
  const cookie = (value, age) => `${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const url = new URL(incoming.url, origin);
      if (url.origin !== origin) { outgoing.writeHead(400).end(); return; }
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (value !== undefined && !name.startsWith('oai-')) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      }
      const editor = authenticated(headers);
      let response;
      const login = url.pathname === '/signin-with-chatgpt', logout = url.pathname === '/signout-with-chatgpt';
      if (!['GET', 'HEAD', 'POST'].includes(incoming.method)) response = new Response(null, { status: 405 });
      else if (incoming.method === 'POST' && headers.get('origin') !== origin) response = new Response('Origin tidak diizinkan', { status: 403 });
      else if (login && incoming.method === 'GET') response = loginPage('');
      else if (logout && incoming.method === 'GET') response = new Response('<!doctype html><html lang="id"><meta charset="utf-8"><title>Keluar</title><form method="post"><button>Keluar dari akun pengelola</button></form></html>', { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
      else if (logout && incoming.method === 'POST') { sessions.delete(sessionToken(headers)); response = redirect(cookie('', 0)); }
      else if (incoming.method === 'POST' && !login && !editor) response = new Response('Login diperlukan', { status: 403 });
      else {
        let body;
        if (incoming.method === 'POST') {
          const limit = login ? 4096 : url.pathname === '/api/upload' ? 12 * 1024 * 1024 : 200000;
          const chunks = []; let size = 0;
          for await (const chunk of incoming) {
            size += chunk.length;
            if (size > limit) { const error = Error('Request too large'); error.status = 413; throw error; }
            chunks.push(chunk);
          }
          body = Buffer.concat(chunks);
        }
        if (login && incoming.method === 'POST') {
          const ip = headers.get('x-real-ip') || incoming.socket.remoteAddress;
          for (const [key, value] of attempts) if (value.until <= Date.now()) attempts.delete(key);
          let attempt = attempts.get(ip);
          if (!attempt) { attempt = { count: 0, until: Date.now() + 900000 }; if (attempts.size < 5000) attempts.set(ip, attempt); }
          if (attempt.count >= 10 || attempts.size >= 5000) response = new Response('Terlalu banyak percobaan. Coba lagi dalam 15 menit.', { status: 429, headers: { 'Retry-After': '900' } });
          else {
            attempt.count++;
            const form = new URLSearchParams(body.toString());
            const password = form.get('password') || '';
            const [salt, expected] = config.passwordHash.split(':');
            const actual = (await deriveKey(password, salt, 64)).toString('hex');
            if (!equal(form.get('username') || '', config.username) || !equal(actual, expected)) response = loginPage('Username atau password salah.');
            else {
              attempts.delete(ip);
              for (const [token, expires] of sessions) if (expires <= Date.now()) sessions.delete(token);
              const expires = Date.now() + 28800000, token = randomBytes(32).toString('hex');
              sessions.set(token, expires);
              response = redirect(cookie(token, 28800));
            }
          }
        } else {
          if (editor) {
            headers.set('oai-authenticated-user-id', 'vps-editor');
            headers.set('oai-authenticated-user-email', 'strataliftsolutions@gmail.com');
          }
          const request = new Request(url, { method: incoming.method, headers, body });
          response = await worker.fetch(request, { BUCKET: bucket });
        }
      }
      response.headers.set('X-Content-Type-Options', 'nosniff');
      response.headers.set('X-Frame-Options', 'SAMEORIGIN');
      response.headers.set('Referrer-Policy', 'same-origin');
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      console.error('Request failed:', error.code || error.status || error.name);
      if (!outgoing.headersSent) outgoing.writeHead(error.status || 500, { 'Content-Type': 'text/plain; charset=utf-8' });
      outgoing.end('Permintaan belum dapat diproses.');
    }
  });
  server.requestTimeout = 30000;
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApp({ origin: process.env.PUBLIC_ORIGIN, dataDir: process.env.DATA_DIR, username: process.env.ADMIN_USERNAME, passwordHash: process.env.ADMIN_PASSWORD_HASH });
  server.listen(8082, '127.0.0.1', () => console.log('SMJ listening on 127.0.0.1:8082'));
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { server.close(); setTimeout(() => process.exit(1), 10000).unref(); });
}
