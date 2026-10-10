#!/usr/bin/env bash
# The Zombies — one-command install on a fresh Ubuntu 22.04/24.04 VPS (Beget VPS and others).
# Usage (as root):  bash install.sh my-domain.ru you@mail.ru
set -euo pipefail
DOMAIN="${1:?Укажите домен: bash install.sh my-domain.ru you@mail.ru}"
EMAIL="${2:?Укажите вашу почту (для сертификата и входа в админку)}"
APP=/opt/thezombies
echo "== 1/6 Пакеты"
apt-get update -y
apt-get install -y curl ca-certificates nginx certbot python3-certbot-nginx ufw git
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
echo "== 2/6 Файлы игры"
mkdir -p "$APP"
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
cp -r "$SRC"/. "$APP"/
cd "$APP/server" && npm install --omit=dev --no-audit --no-fund
id thezombies >/dev/null 2>&1 || useradd --system --home "$APP" --shell /usr/sbin/nologin thezombies
mkdir -p "$APP/server/data/downloads"
if [ ! -f "$APP/server/config.json" ]; then
  cat > "$APP/server/config.json" <<CFG
{
  "port": 8080,
  "publicUrl": "https://$DOMAIN",
  "trustProxy": true,
  "dataDir": "data",
  "adminEmails": ["$EMAIL"],
  "googleClientId": "",
  "appleClientId": "",
  "smtp": { "host": "", "port": 465, "secure": true, "user": "", "pass": "", "from": "" },
  "yoomoney": { "wallet": "", "secret": "" },
  "serverPrice": 400
}
CFG
fi
chown -R thezombies:thezombies "$APP"
chmod 600 "$APP/server/config.json"
echo "== 3/6 Служба"
cat > /etc/systemd/system/thezombies.service <<UNIT
[Unit]
Description=The Zombies online server
After=network.target
[Service]
User=thezombies
WorkingDirectory=$APP/server
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production
NoNewPrivileges=true
ProtectSystem=full
ProtectHome=true
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload && systemctl enable --now thezombies
echo "== 4/6 Nginx"
cat > /etc/nginx/sites-available/thezombies <<NGX
server {
  listen 80;
  server_name $DOMAIN www.$DOMAIN;
  client_max_body_size 16m;
  location / {
    proxy_pass http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_read_timeout 3600s;
  }
}
NGX
ln -sf /etc/nginx/sites-available/thezombies /etc/nginx/sites-enabled/thezombies
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "== 5/6 HTTPS"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "!! Сертификат не получен: проверьте, что домен указывает на IP этого сервера, и запустите: certbot --nginx -d $DOMAIN"
echo "== 6/6 Файрвол"
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
echo
echo "Готово: https://$DOMAIN"
echo "Настройки: nano $APP/server/config.json  →  затем: systemctl restart thezombies"
echo "Логи: journalctl -u thezombies -f"
