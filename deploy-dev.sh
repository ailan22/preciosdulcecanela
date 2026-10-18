#!/usr/bin/env bash
# Genera el sitio y lo sube al ambiente DEV de Cloudflare.
# Uso: ./deploy-dev.sh
set -euo pipefail
cd "$(dirname "$0")"

URL="https://precios-dulce-canela.ailanquinteroh.workers.dev/"

# Copia de respaldo de los insumos (la usa la página si /api/insumos no responde)
if npx -y wrangler@4 d1 execute dulce-canela --remote --json --command \
    "SELECT nombre, categoria, precio_paquete AS precio, cantidad_paquete AS paquete, unidad
     FROM v_insumos ORDER BY nombre COLLATE NOCASE" > data/insumos.tmp; then
  node -e 'const r = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(JSON.stringify(r[0].results))' \
    < data/insumos.tmp > data/insumos.json
else
  echo "Aviso: no se pudo leer D1, se usa la copia anterior de data/insumos.json" >&2
fi
rm -f data/insumos.tmp

rm -rf dev-build
hugo --gc --minify -b "$URL" -d dev-build
npx -y wrangler@4 deploy

echo
echo "Listo: $URL (si ves la versión anterior, esperá unos segundos y recargá)"
