// Worker de Dulce Canela: sirve el sitio (Hugo, en dev-build/) y la API sobre la base D1.
//   GET    /api/insumos           lista pública de insumos
//   GET    /api/recetas           recetas guardadas          (requiere clave)
//   PUT    /api/recetas/:nombre   crea o reemplaza una receta (requiere clave)
//   DELETE /api/recetas/:nombre   borra una receta           (requiere clave)
//   GET    /api/stock                    stock actual y últimas operaciones   (requiere clave)
//   POST   /api/stock/compra             suma paquetes comprados              (requiere clave)
//   POST   /api/stock/produccion         descuenta los ingredientes de una receta hecha (requiere clave)
//   POST   /api/stock/ajuste             corrige el stock con lo que se contó (requiere clave)
//   DELETE /api/stock/operaciones/:id    deshace una operación               (requiere clave)
// La clave se manda en el encabezado X-Clave y se compara con el secreto CLAVE_RECETAS.

const CONSULTA_INSUMOS = `
  SELECT nombre, categoria, precio_paquete AS precio, cantidad_paquete AS paquete, unidad
  FROM v_insumos
  ORDER BY nombre COLLATE NOCASE`;

const UNIDADES = ["g", "ml", "u"];
const MAX_INGREDIENTES = 200;

const error = (status, mensaje) => Response.json({ error: mensaje }, { status });

// Número o null; los inputs del calculador llegan como texto ("" si están vacíos)
function numero(v) {
  const n = parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

async function claveValida(request, env) {
  const enc = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(request.headers.get("X-Clave") || "")),
    crypto.subtle.digest("SHA-256", enc.encode(env.CLAVE_RECETAS)),
  ]);
  return crypto.subtle.timingSafeEqual(a, b);
}

async function listarRecetas(env) {
  const [recetas, ingredientes] = await env.DB.batch([
    env.DB.prepare(`
      SELECT id, nombre, molde_cm AS molde, destino_cm AS destino, caja,
             otros_pct AS otros, ganancia_pct AS ganancia, comparar_con AS comparar, actualizada
      FROM recetas ORDER BY nombre COLLATE NOCASE`),
    env.DB.prepare(`
      SELECT receta_id, nombre, cantidad, unidad, paquete, precio
      FROM receta_ingredientes ORDER BY receta_id, orden`),
  ]);
  const porReceta = new Map(recetas.results.map((r) => [r.id, { ...r, ingredientes: [] }]));
  for (const { receta_id, ...ing } of ingredientes.results) porReceta.get(receta_id)?.ingredientes.push(ing);
  return [...porReceta.values()].map(({ id, ...r }) => r);
}

async function guardarReceta(env, nombre, r) {
  const ingredientes = Array.isArray(r.ingredientes) ? r.ingredientes : [];
  if (ingredientes.length > MAX_INGREDIENTES) return error(400, "Demasiados ingredientes");

  const consultas = [
    env.DB.prepare(`
      INSERT INTO recetas (nombre, molde_cm, destino_cm, caja, otros_pct, ganancia_pct, comparar_con)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
      ON CONFLICT (nombre) DO UPDATE SET
        molde_cm = excluded.molde_cm, destino_cm = excluded.destino_cm, caja = excluded.caja,
        otros_pct = excluded.otros_pct, ganancia_pct = excluded.ganancia_pct,
        comparar_con = excluded.comparar_con, actualizada = datetime('now')`
    ).bind(
      nombre,
      numero(r.molde) > 0 ? numero(r.molde) : 18,
      numero(r.destino) > 0 ? numero(r.destino) : numero(r.molde) > 0 ? numero(r.molde) : 18,
      numero(r.caja) ?? 0,
      numero(r.otros) ?? 10,
      numero(r.ganancia) ?? 100,
      String(r.comparar || "").trim() || null
    ),
    env.DB.prepare(
      "DELETE FROM receta_ingredientes WHERE receta_id = (SELECT id FROM recetas WHERE nombre = ?1)"
    ).bind(nombre),
  ];

  // Las filas sin nombre son renglones vacíos del calculador
  ingredientes
    .filter((ing) => String(ing.nombre || "").trim())
    .forEach((ing, orden) => {
      const nombreIng = String(ing.nombre).trim().slice(0, 100);
      consultas.push(env.DB.prepare(`
        INSERT INTO receta_ingredientes (receta_id, orden, nombre, insumo_id, cantidad, unidad, paquete, precio)
        SELECT r.id, ?2, ?3, (SELECT id FROM insumos WHERE nombre = ?3), ?4, ?5, ?6, ?7
        FROM recetas r WHERE r.nombre = ?1`
      ).bind(
        nombre, orden, nombreIng, numero(ing.cantidad),
        UNIDADES.includes(ing.unidad) ? ing.unidad : "g",
        numero(ing.paquete), numero(ing.precio)
      ));
    });

  await env.DB.batch(consultas); // D1 ejecuta el batch como una transacción
  return new Response(null, { status: 204 });
}

async function apiRecetas(request, env, ruta) {
  const nombre = ruta ? decodeURIComponent(ruta).trim().slice(0, 100) : "";

  if (!nombre && request.method === "GET") return Response.json(await listarRecetas(env));
  if (!nombre) return error(405, "Método no permitido");

  if (request.method === "PUT") {
    let r;
    try {
      r = await request.json();
    } catch (e) {
      return error(400, "Receta inválida");
    }
    return guardarReceta(env, nombre, r || {});
  }
  if (request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM recetas WHERE nombre = ?1").bind(nombre).run();
    return new Response(null, { status: 204 });
  }
  return error(405, "Método no permitido");
}

// ---------- Stock ----------

const MAX_OPERACIONES = 30;
const formato = new Intl.NumberFormat("es-UY", { maximumFractionDigits: 1 });

// Inserta la operación y sus movimientos en una sola transacción.
// D1 ejecuta el batch en serie, así que max(id) es la operación recién creada.
function operacion(env, tipo, detalle, recetaId, movimientos) {
  return [
    env.DB.prepare("INSERT INTO operaciones_stock (tipo, detalle, receta_id) VALUES (?1, ?2, ?3)")
      .bind(tipo, detalle, recetaId ?? null),
    ...movimientos.map((m) => env.DB.prepare(`
      INSERT INTO movimientos_stock (operacion_id, insumo_id, cantidad)
      VALUES ((SELECT max(id) FROM operaciones_stock), ?1, ?2)`
    ).bind(m.insumo_id, m.cantidad)),
  ];
}

const buscarInsumo = (env, nombre) => env.DB.prepare(
  "SELECT id, nombre, unidad, paquete, precio, stock FROM v_stock WHERE nombre = ?1"
).bind(String(nombre || "").trim()).first();

async function verStock(env) {
  const [insumos, operaciones, movimientos] = await env.DB.batch([
    env.DB.prepare("SELECT * FROM v_stock ORDER BY nombre COLLATE NOCASE"),
    env.DB.prepare("SELECT id, tipo, fecha, detalle FROM operaciones_stock ORDER BY id DESC LIMIT ?1").bind(MAX_OPERACIONES),
    env.DB.prepare(`
      SELECT m.operacion_id, i.nombre, m.cantidad, i.unidad
      FROM movimientos_stock m JOIN insumos i ON i.id = m.insumo_id
      WHERE m.operacion_id IN (SELECT id FROM operaciones_stock ORDER BY id DESC LIMIT ?1)
      ORDER BY m.id`).bind(MAX_OPERACIONES),
  ]);
  const porOperacion = new Map(operaciones.results.map((o) => [o.id, { ...o, movimientos: [] }]));
  for (const { operacion_id, ...m } of movimientos.results) porOperacion.get(operacion_id)?.movimientos.push(m);
  return { insumos: insumos.results, operaciones: [...porOperacion.values()] };
}

async function compra(env, datos) {
  const insumo = await buscarInsumo(env, datos.insumo);
  if (!insumo) return error(400, "Ese insumo no está en la lista");
  const paquetes = numero(datos.paquetes);
  if (!(paquetes > 0)) return error(400, "Indicá cuántos paquetes compraste");

  const consultas = operacion(env, "compra",
    `${insumo.nombre}: ${formato.format(paquetes)} paquete${paquetes === 1 ? "" : "s"} de ${formato.format(insumo.paquete)} ${insumo.unidad}`,
    null, [{ insumo_id: insumo.id, cantidad: paquetes * insumo.paquete }]);

  // Si pagó otro precio, se actualiza la lista (el trigger guarda el anterior en historial_precios)
  const precio = numero(datos.precio);
  if (precio > 0 && precio !== insumo.precio) {
    consultas.push(env.DB.prepare("UPDATE insumos SET precio_paquete = ?1 WHERE id = ?2").bind(precio, insumo.id));
  }
  await env.DB.batch(consultas);
  return Response.json({
    mensaje: `Se sumaron ${formato.format(paquetes * insumo.paquete)} ${insumo.unidad} de ${insumo.nombre}.` +
      (precio > 0 && precio !== insumo.precio ? ` Precio actualizado a $${formato.format(precio)}.` : ""),
  });
}

async function ajuste(env, datos) {
  const insumo = await buscarInsumo(env, datos.insumo);
  if (!insumo) return error(400, "Ese insumo no está en la lista");
  const real = numero(datos.cantidad);
  if (real == null || real < 0) return error(400, "Indicá cuánto tenés");

  const diferencia = real - insumo.stock;
  if (Math.abs(diferencia) < 1e-9) {
    return Response.json({ mensaje: `${insumo.nombre} ya tenía ${formato.format(real)} ${insumo.unidad}; no hubo cambios.` });
  }
  await env.DB.batch(operacion(env, "ajuste",
    `Conteo de ${insumo.nombre}: ${formato.format(real)} ${insumo.unidad}`,
    null, [{ insumo_id: insumo.id, cantidad: diferencia }]));
  return Response.json({
    mensaje: `${insumo.nombre} quedó en ${formato.format(real)} ${insumo.unidad} ` +
      `(${diferencia > 0 ? "+" : "−"}${formato.format(Math.abs(diferencia))}).`,
  });
}

async function produccion(env, datos) {
  const receta = await env.DB.prepare("SELECT id, nombre, molde_cm FROM recetas WHERE nombre = ?1")
    .bind(String(datos.receta || "").trim()).first();
  if (!receta) return error(400, "Esa receta no está guardada en la base");

  const destino = numero(datos.destino) > 0 ? numero(datos.destino) : receta.molde_cm;
  const unidades = numero(datos.unidades) > 0 ? numero(datos.unidades) : 1;
  const factor = Math.pow(destino / receta.molde_cm, 2) * unidades;

  // El ingrediente se enlaza por insumo_id o, si se agregó a la lista después, por nombre
  const { results } = await env.DB.prepare(`
    SELECT ri.nombre, ri.cantidad, ri.unidad, i.id AS insumo_id, i.unidad AS unidad_insumo
    FROM receta_ingredientes ri
    LEFT JOIN insumos i ON i.id = coalesce(ri.insumo_id, (SELECT id FROM insumos WHERE nombre = ri.nombre))
    WHERE ri.receta_id = ?1
    ORDER BY ri.orden`).bind(receta.id).all();

  const movimientos = [];
  const omitidos = [];
  for (const ing of results) {
    if (!ing.insumo_id) omitidos.push(`${ing.nombre} (no está en la lista de insumos)`);
    else if (!(ing.cantidad > 0)) omitidos.push(`${ing.nombre} (sin cantidad)`);
    else if (ing.unidad !== ing.unidad_insumo) omitidos.push(`${ing.nombre} (la receta usa ${ing.unidad} y la lista ${ing.unidad_insumo})`);
    else movimientos.push({ insumo_id: ing.insumo_id, cantidad: -ing.cantidad * factor });
  }
  if (!movimientos.length) {
    return Response.json({ error: "Ningún ingrediente de la receta se pudo descontar", omitidos }, { status: 400 });
  }

  await env.DB.batch(operacion(env, "produccion",
    `${receta.nombre} ×${formato.format(unidades)} en molde de ${formato.format(destino)} cm`,
    receta.id, movimientos));
  return Response.json({
    mensaje: `Se descontaron ${movimientos.length} ingrediente${movimientos.length === 1 ? "" : "s"} de ${receta.nombre}.`,
    omitidos,
  });
}

async function apiStock(request, env, ruta) {
  if (!ruta && request.method === "GET") return Response.json(await verStock(env));

  const borrar = (ruta || "").match(/^operaciones\/(\d+)$/);
  if (borrar && request.method === "DELETE") {
    await env.DB.prepare("DELETE FROM operaciones_stock WHERE id = ?1").bind(Number(borrar[1])).run();
    return new Response(null, { status: 204 });
  }

  const acciones = { compra, ajuste, produccion };
  if (acciones[ruta] && request.method === "POST") {
    let datos;
    try {
      datos = await request.json();
    } catch (e) {
      return error(400, "Datos inválidos");
    }
    return acciones[ruta](env, datos || {});
  }
  return error(404, "No existe");
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/insumos") {
        if (request.method !== "GET") return error(405, "Método no permitido");
        const { results } = await env.DB.prepare(CONSULTA_INSUMOS).all();
        return Response.json(results, { headers: { "Cache-Control": "no-store" } });
      }

      const privada = url.pathname.match(/^\/api\/(recetas|stock)(?:\/(.+))?$/);
      if (privada) {
        let respuesta;
        if (!env.CLAVE_RECETAS) respuesta = error(503, "Falta configurar la clave de recetas");
        else if (!(await claveValida(request, env))) respuesta = error(401, "Clave incorrecta");
        else respuesta = await (privada[1] === "recetas" ? apiRecetas : apiStock)(request, env, privada[2]);
        respuesta.headers.set("Cache-Control", "no-store");
        return respuesta;
      }
    } catch (e) {
      console.error("Error en la API", url.pathname, e);
      return error(500, "Error en la base de datos");
    }

    return env.ASSETS.fetch(request);
  },
};
