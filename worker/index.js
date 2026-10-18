// Worker de Dulce Canela: sirve el sitio (Hugo, en dev-build/) y la API de insumos desde D1.

const CONSULTA_INSUMOS = `
  SELECT nombre, categoria, precio_paquete AS precio, cantidad_paquete AS paquete, unidad
  FROM v_insumos
  ORDER BY nombre COLLATE NOCASE`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/insumos") {
      if (request.method !== "GET") return new Response("Método no permitido", { status: 405 });
      try {
        const { results } = await env.DB.prepare(CONSULTA_INSUMOS).all();
        return Response.json(results, { headers: { "Cache-Control": "no-store" } });
      } catch (e) {
        console.error("Error leyendo insumos", e);
        return Response.json({ error: "No se pudo leer la base de insumos" }, { status: 500 });
      }
    }

    return env.ASSETS.fetch(request);
  },
};
