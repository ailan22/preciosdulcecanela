-- Base de datos de insumos de Dulce Canela (SQLite / compatible con Cloudflare D1).
-- Origen: Precios_productos.ods. Precios en pesos uruguayos.

PRAGMA foreign_keys = ON;

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
