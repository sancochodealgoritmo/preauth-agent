#!/usr/bin/env bash
set -euo pipefail

# Despliegue PreAuth Agent en VPS Ubuntu 24.04 (Node 20 + PM2 + Nginx + Certbot).
# Uso: ./deploy.sh   (ejecutar como usuario con sudo)

APP_DIR="/opt/hackiathon-preauth"
APP_NAME="preauth-agent"

echo "==> Instalando Node.js 20 LTS y Nginx..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get update
sudo apt-get install -y nodejs nginx

echo "==> Instalando PM2 y pm2-logrotate..."
sudo npm install -g pm2
pm2 install pm2-logrotate || true
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true

echo "==> Copiando el proyecto a ${APP_DIR}..."
sudo mkdir -p "${APP_DIR}"
sudo cp -r . "${APP_DIR}"
sudo chown -R "$USER":"$USER" "${APP_DIR}"
cd "${APP_DIR}"

echo "==> Instalando dependencias..."
npm ci

if [ ! -f .env ]; then
  echo "==> No se encontró .env. Copiando .env.example..."
  cp .env.example .env
  echo "    EDITAR ${APP_DIR}/.env con las credenciales reales y volver a ejecutar."
fi

echo "==> Levantando con PM2..."
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 | bash

echo "==> Instalando Certbot..."
sudo apt-get install -y certbot python3-certbot-nginx

cat <<'EOF'
==> Configura Nginx como proxy a 127.0.0.1:3000.
    Crea /etc/nginx/sites-available/preauth con:

    server {
      listen 80;
      server_name tu-dominio.com;

      location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 120s;
      }
    }

    Luego:
      sudo ln -s /etc/nginx/sites-available/preauth /etc/nginx/sites-enabled/
      sudo nginx -t && sudo systemctl reload nginx
      sudo certbot --nginx -d tu-dominio.com
EOF

echo "==> Despliegue completado."
