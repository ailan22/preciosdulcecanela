#!/usr/bin/env bash
# Genera el sitio y lo sube al ambiente DEV de Cloudflare.
# Uso: ./deploy-dev.sh
set -euo pipefail
cd "$(dirname "$0")"

URL="https://precios-dulce-canela.ailanquinteroh.workers.dev/"

rm -rf dev-build
hugo --gc --minify -b "$URL" -d dev-build
npx -y wrangler@4 deploy

echo
echo "Listo: $URL (si ves la versión anterior, esperá unos segundos y recargá)"
