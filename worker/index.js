// Worker de Dulce Canela: sirve el sitio (Hugo, en dev-build/) y la API sobre la base D1.
//   GET    /api/insumos           lista pública de insumos
//   GET    /api/recetas           recetas guardadas          (requiere clave)
//   PUT    /api/recetas/:nombre   crea o reemplaza una receta (requiere clave)
//   DELETE /api/recetas/:nombre   borra una receta           (requiere clave)
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
  if (!env.CLAVE_RECETAS) return error(503, "Falta configurar la clave de recetas");
  if (!(await claveValida(request, env))) return error(401, "Clave incorrecta");

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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    try {
      if (url.pathname === "/api/insumos") {
        if (request.method !== "GET") return error(405, "Método no permitido");
        const { results } = await env.DB.prepare(CONSULTA_INSUMOS).all();
        return Response.json(results, { headers: { "Cache-Control": "no-store" } });
      }

      const recetas = url.pathname.match(/^\/api\/recetas(?:\/(.+))?$/);
      if (recetas) {
        const respuesta = await apiRecetas(request, env, recetas[1]);
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
