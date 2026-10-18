-- Base de datos de insumos de Dulce Canela (SQLite / compatible con Cloudflare D1).
-- Origen: Precios_productos.ods. Precios en pesos uruguayos.

PRAGMA foreign_keys = ON;

DROP VIEW IF EXISTS v_stock;
DROP TABLE IF EXISTS movimientos_stock;
DROP TABLE IF EXISTS operaciones_stock;
DROP TABLE IF EXISTS receta_ingredientes;
DROP TABLE IF EXISTS recetas;
DROP VIEW IF EXISTS v_insumos;
DROP TRIGGER IF EXISTS insumos_historial;
DROP TABLE IF EXISTS historial_precios;
DROP TABLE IF EXISTS insumos;
DROP TABLE IF EXISTS categorias;

CREATE TABLE categorias (
  id     INTEGER PRIMARY KEY,
  nombre TEXT NOT NULL UNIQUE
);

-- Un insumo = un paquete tal como se compra: precio_paquete por cantidad_paquete de unidad.
-- unidad: 'g' (gramos), 'ml' (mililitros) o 'u' (unidades sueltas).
CREATE TABLE insumos (
  id               INTEGER PRIMARY KEY,
  nombre           TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  categoria_id     INTEGER NOT NULL REFERENCES categorias(id),
  precio_paquete   REAL    NOT NULL CHECK (precio_paquete > 0),
  cantidad_paquete REAL    NOT NULL CHECK (cantidad_paquete > 0),
  unidad           TEXT    NOT NULL CHECK (unidad IN ('g', 'ml', 'u')),
  notas            TEXT,
  actualizado      TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE INDEX insumos_categoria ON insumos(categoria_id);

-- Guarda el precio anterior cada vez que cambia el precio o el tamaño del paquete.
CREATE TABLE historial_precios (
  id               INTEGER PRIMARY KEY,
  insumo_id        INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  precio_paquete   REAL    NOT NULL,
  cantidad_paquete REAL    NOT NULL,
  vigente_hasta    TEXT    NOT NULL DEFAULT (date('now'))
);

CREATE TRIGGER insumos_historial
AFTER UPDATE OF precio_paquete, cantidad_paquete ON insumos
WHEN OLD.precio_paquete <> NEW.precio_paquete OR OLD.cantidad_paquete <> NEW.cantidad_paquete
BEGIN
  INSERT INTO historial_precios (insumo_id, precio_paquete, cantidad_paquete)
  VALUES (OLD.id, OLD.precio_paquete, OLD.cantidad_paquete);
  UPDATE insumos SET actualizado = date('now') WHERE id = NEW.id;
END;

-- Vista para consultar: precio por g/ml/u y precio por kg o litro.
CREATE VIEW v_insumos AS
SELECT
  i.id,
  i.nombre,
  c.nombre AS categoria,
  i.precio_paquete,
  i.cantidad_paquete,
  i.unidad,
  round(i.precio_paquete / i.cantidad_paquete, 4) AS precio_por_unidad,
  CASE WHEN i.unidad IN ('g', 'ml')
       THEN round(i.precio_paquete * 1000 / i.cantidad_paquete, 2) END AS precio_por_kg_o_litro,
  i.notas,
  i.actualizado
FROM insumos i
JOIN categorias c ON c.id = i.categoria_id;

-- Recetas guardadas desde el calculador del sitio (las escribe worker/index.js).
CREATE TABLE recetas (
  id           INTEGER PRIMARY KEY,
  nombre       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  molde_cm     REAL    NOT NULL DEFAULT 18,
  destino_cm   REAL    NOT NULL DEFAULT 18,
  caja         REAL    NOT NULL DEFAULT 0,
  otros_pct    REAL    NOT NULL DEFAULT 10,
  ganancia_pct REAL    NOT NULL DEFAULT 100,
  comparar_con TEXT,
  creada       TEXT    NOT NULL DEFAULT (datetime('now')),
  actualizada  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- insumo_id enlaza con la lista de insumos cuando el nombre coincide;
-- paquete y precio guardan lo cargado a mano para los que no están en la lista.
CREATE TABLE receta_ingredientes (
  id        INTEGER PRIMARY KEY,
  receta_id INTEGER NOT NULL REFERENCES recetas(id) ON DELETE CASCADE,
  orden     INTEGER NOT NULL,
  nombre    TEXT    NOT NULL,
  insumo_id INTEGER REFERENCES insumos(id) ON DELETE SET NULL,
  cantidad  REAL,
  unidad    TEXT    NOT NULL DEFAULT 'g' CHECK (unidad IN ('g', 'ml', 'u')),
  paquete   REAL,
  precio    REAL
);

CREATE INDEX receta_ingredientes_receta ON receta_ingredientes(receta_id, orden);

-- Stock: cada compra, receta hecha o conteo es una operación con sus movimientos.
-- El stock de un insumo es la suma de sus movimientos; borrar la operación la deshace.
CREATE TABLE operaciones_stock (
  id        INTEGER PRIMARY KEY,
  tipo      TEXT    NOT NULL CHECK (tipo IN ('compra', 'produccion', 'ajuste')),
  fecha     TEXT    NOT NULL DEFAULT (datetime('now')),
  detalle   TEXT    NOT NULL,
  receta_id INTEGER REFERENCES recetas(id) ON DELETE SET NULL
);

-- cantidad en la unidad del insumo: positiva entra, negativa sale.
CREATE TABLE movimientos_stock (
  id           INTEGER PRIMARY KEY,
  operacion_id INTEGER NOT NULL REFERENCES operaciones_stock(id) ON DELETE CASCADE,
  insumo_id    INTEGER NOT NULL REFERENCES insumos(id) ON DELETE CASCADE,
  cantidad     REAL    NOT NULL
);

CREATE INDEX movimientos_stock_insumo ON movimientos_stock(insumo_id);
CREATE INDEX movimientos_stock_operacion ON movimientos_stock(operacion_id);

-- Stock actual y cuánto vale a precio de lista.
CREATE VIEW v_stock AS
SELECT
  i.id,
  i.nombre,
  c.nombre AS categoria,
  i.unidad,
  i.cantidad_paquete AS paquete,
  i.precio_paquete AS precio,
  coalesce(sum(m.cantidad), 0) AS stock,
  round(coalesce(sum(m.cantidad), 0) * i.precio_paquete / i.cantidad_paquete, 2) AS valor
FROM insumos i
JOIN categorias c ON c.id = i.categoria_id
LEFT JOIN movimientos_stock m ON m.insumo_id = i.id
GROUP BY i.id;
