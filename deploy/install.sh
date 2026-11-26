#!/usr/bin/env bash
set -euo pipefail
if [[ $EUID -ne 0 ]]; then echo 'Jalankan: sudo bash /var/www/smj/deploy/install.sh'; exit 1; fi
cd /var/www/smj
for executable in node nginx certbot curl python3; do command -v "$executable" >/dev/null; done
test "$(node -p 'Number(process.versions.node.split(".")[0]) >= 22')" = true
node scripts/build.mjs
node scripts/validate-artifact.mjs
node scripts/vps-test.mjs
if ! id smj >/dev/null 2>&1; then useradd --system --user-group --home-dir /var/lib/smj --shell /usr/sbin/nologin smj; fi
if [[ ! -f /etc/smj.env ]]; then
    read -rsp 'Password baru pengelola admin (minimal 8 karakter): ' smj_password
    echo
    read -rsp 'Ulangi password: ' smj_confirmation
    echo
    if [[ "$smj_password" != "$smj_confirmation" || ${#smj_password} -lt 8 ]]; then echo 'Password tidak sama atau terlalu pendek.'; exit 1; fi
    umask 077
    printf '%s' "$smj_password" | node --input-type=module -e '
        import { scryptSync, randomBytes } from "node:crypto";
        import { readFileSync, writeFileSync } from "node:fs";
        const salt = randomBytes(16).toString("hex");
        const hash = salt + ":" + scryptSync(readFileSync(0), salt, 64).toString("hex");
        writeFileSync("/etc/smj.env", "PUBLIC_ORIGIN=https://smj.stratalift.co.id\nDATA_DIR=/var/lib/smj\nADMIN_USERNAME=admin\nADMIN_PASSWORD_HASH=" + hash + "\n", { mode: 0o600, flag: "wx" });
    '
    unset smj_password smj_confirmation
fi
chown root:smj /etc/smj.env
chmod 0640 /etc/smj.env
chgrp smj /var/www/smj
chmod 0750 /var/www/smj
install -d -o smj -g smj -m 0700 /var/lib/smj
runuser -u smj -- /usr/bin/node scripts/vps-import.mjs
install -d -m 0755 /var/lib/letsencrypt
install -m 0644 deploy/smj.service /etc/systemd/system/smj.service
install -m 0644 deploy/smj-http.conf /etc/nginx/sites-available/smj
if [[ ! -e /etc/nginx/sites-enabled/smj ]]; then ln -s /etc/nginx/sites-available/smj /etc/nginx/sites-enabled/smj; fi
nginx -t
systemctl reload nginx
certbot certonly --webroot -w /var/lib/letsencrypt -d smj.stratalift.co.id --agree-tos --register-unsafely-without-email --non-interactive
cat deploy/smj-http.conf deploy/smj-https.conf > /etc/nginx/sites-available/smj
nginx -t
systemctl daemon-reload
systemctl enable smj
systemctl restart smj
for attempt in {1..10}; do
    if curl --fail --silent http://127.0.0.1:8082/api/reports >/dev/null; then break; fi
    sleep 1
done
curl --fail --silent http://127.0.0.1:8082/api/reports | python3 -c 'import sys,json; d=json.load(sys.stdin); assert d["canEdit"] is False; print("API laporan aktif")'
systemctl reload nginx
install -d -m 0755 /etc/letsencrypt/renewal-hooks/deploy
printf '#!/bin/sh\n/usr/sbin/nginx -t && /usr/bin/systemctl reload nginx\n' > /etc/letsencrypt/renewal-hooks/deploy/smj-reload-nginx
chmod 0755 /etc/letsencrypt/renewal-hooks/deploy/smj-reload-nginx
systemctl enable --now certbot.timer
curl --fail --silent --show-error https://smj.stratalift.co.id/api/reports | python3 -c 'import json,sys; d=json.load(sys.stdin); assert len(d["reports"])>0; print("HTTPS dan API aktif: https://smj.stratalift.co.id")'
echo 'Username pengelola: admin. Password: sesuai input tadi.'
