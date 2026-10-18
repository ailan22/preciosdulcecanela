#!/usr/bin/env bash
# Crea (o recrea desde cero) la base local db/dulce_canela.db
# y regenera data/insumos.json. Ojo: los precios vigentes están en D1 (dulce-canela);
# esto es para trabajar en local o para recargar D1 desde cero.
# Uso: ./db/crear-bd.sh
set -euo pipefail
cd "$(dirname "$0")"

rm -f dulce_canela.db
sqlite3 dulce_canela.db < schema.sql
sqlite3 dulce_canela.db < seed.sql

# Exporta los insumos para el calculador de recetas del sitio (Hugo los lee de data/)
sqlite3 dulce_canela.db "SELECT json_group_array(json_object(
    'nombre', nombre, 'categoria', categoria, 'precio', precio_paquete,
    'paquete', cantidad_paquete, 'unidad', unidad))
  FROM (SELECT * FROM v_insumos ORDER BY nombre COLLATE NOCASE)" > ../data/insumos.json

echo "Listo: db/dulce_canela.db ($(sqlite3 dulce_canela.db 'SELECT count(*) FROM insumos') insumos)"
