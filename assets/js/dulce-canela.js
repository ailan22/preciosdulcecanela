// Dulce Canela: lista de precios por medida y calculador de costo de recetas.

const CLAVE_RECETAS = "dulce-canela-recetas";
const CLAVE_BORRADOR = "dulce-canela-borrador";
const CLAVE_ACCESO = "dulce-canela-clave";
const UNIDADES = ["g", "ml", "u"];

const moneda = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const monedaFina = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 2 });
const cantidad = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

const pesos = (n) => "$" + (Math.abs(n) < 100 ? monedaFina : moneda).format(n);
const num = (input) => {
  const n = parseFloat(String(input.value).replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

function leer(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : porDefecto;
  } catch (e) {
    return porDefecto;
  }
}

function escribir(clave, valor) {
  try {
    localStorage.setItem(clave, JSON.stringify(valor));
  } catch (e) {
    // Sin almacenamiento (modo privado): la calculadora sigue funcionando
  }
}

// ---------- API (base D1, ver worker/index.js) ----------

// Llama a /api/<ruta> con la clave guardada. Si falla lanza un Error con .status
// (undefined si no hubo respuesta, por ejemplo con hugo server)
async function api(ruta, metodo = "GET", datos) {
  const r = await fetch("/api/" + ruta, {
    method: metodo,
    headers: { "X-Clave": leer(CLAVE_ACCESO, ""), ...(datos ? { "Content-Type": "application/json" } : {}) },
    body: datos ? JSON.stringify(datos) : undefined,
  });
  const cuerpo = r.status === 204 ? null : await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error((cuerpo && cuerpo.error) || `error ${r.status}`), { status: r.status, datos: cuerpo });
  return cuerpo;
}

// La clave sirve para recetas y stock: al ingresarla en una sección se avisa a las demás
function formularioClave(form, alConectar) {
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const input = form.querySelector('[data-campo="clave"]');
    escribir(CLAVE_ACCESO, input.value);
    input.value = "";
    document.dispatchEvent(new CustomEvent("dc-clave", { detail: form }));
  });
  document.addEventListener("dc-clave", (ev) => alConectar(ev.detail === form));
}

// ---------- Precios ----------

function crearPrecios(raiz) {
  const datos = JSON.parse(raiz.querySelector(".dc-datos").textContent);
  const campo = (n) => raiz.querySelector(`[data-campo="${n}"]`);
  const cuerpo = raiz.querySelector("tbody");
  const avisos = [];

  const ajustes = () => ({
    aumento: num(campo("aumento")) / 100,
    recargo: num(campo("recargo")) / 100,
    redondeo: Math.max(1, num(campo("redondeo"))),
  });

  // Mismo cálculo que la planilla: el precio escala con el área del molde
  function precio(producto, medida, a = ajustes()) {
    const fijo = producto.fijos && producto.fijos[String(medida)];
    let p = fijo != null
      ? fijo
      : producto.precio_base * Math.pow(medida / producto.medida_base, 2) * (medida === 14 ? 1 + a.recargo : 1);
    p *= 1 + a.aumento;
    return Math.round(p / a.redondeo) * a.redondeo;
  }

  function dibujar() {
    const a = ajustes();
    cuerpo.innerHTML = "";
    for (const prod of datos.productos) {
      const fila = cuerpo.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = prod.nombre;
      fila.appendChild(th);
      for (const m of datos.medidas) {
        const td = fila.insertCell();
        td.className = "dc-num";
        td.dataset.label = `${m} cm`;        
        td.textContent = pesos(precio(prod, m, a));        
      }
    }
    avisos.forEach((f) => f());
  }

  raiz.addEventListener("input", dibujar);
  dibujar();

  return {
    productos: datos.productos,
    precio,
    redondeo: () => ajustes().redondeo,
    alCambiar: (f) => avisos.push(f),
  };
}

// ---------- Calculador de receta ----------

function crearReceta(raiz, precios) {
  const campo = (n) => raiz.querySelector(`[data-campo="${n}"]`);
  const res = (n) => raiz.querySelector(`[data-res="${n}"]`);
  const cuerpo = raiz.querySelector("tbody");
  const guardadas = campo("guardadas");
  const comparar = campo("comparar");

  // Insumos: copia incluida en la página (data/insumos.json) hasta que responde la base D1
  const datosInsumos = raiz.querySelector(".dc-insumos");
  let insumos = new Map();
  const buscarInsumo = (nombre) => insumos.get(String(nombre || "").trim().toLowerCase());

  function usarInsumos(lista) {
    insumos = new Map(lista.map((i) => [i.nombre.toLowerCase(), i]));
    const opciones = raiz.querySelector("#dc-lista-insumos");
    if (opciones) {
      opciones.replaceChildren(...lista.map((i) =>
        new Option(`${i.categoria} · ${pesos(i.precio)} por ${cantidad.format(i.paquete)} ${i.unidad}`, i.nombre)));
    }
  }
  usarInsumos(datosInsumos ? JSON.parse(datosInsumos.textContent) || [] : []);

  if (precios) {
    precios.productos.forEach((p) => comparar.add(new Option(p.nombre, p.nombre)));
  } else {
    comparar.closest("label").hidden = true;
  }

  // Completa unidad, paquete y precio con los datos actuales del insumo
  function aplicarInsumo(fila, insumo) {
    fila.querySelector('[data-ing="unidad"]').value = insumo.unidad;
    fila.querySelector('[data-ing="paquete"]').value = insumo.paquete;
    fila.querySelector('[data-ing="precio"]').value = insumo.precio;
  }

  function filaIngrediente(ing = {}) {
    const fila = cuerpo.insertRow();
    fila.innerHTML = `
      <td class="dc-celda-nombre" data-label="Ingrediente"><input type="text" data-ing="nombre" aria-label="Ingrediente" placeholder="Harina" list="dc-lista-insumos" autocomplete="off"></td>
      <td class="dc-num" data-label="Cantidad"><input type="number" min="0" step="any" data-ing="cantidad" aria-label="Cantidad en la receta"></td>
      <td data-label="Unidad"><select data-ing="unidad" aria-label="Unidad">${UNIDADES.map((u) => `<option>${u}</option>`).join("")}</select></td>
      <td class="dc-num" data-label="Paquete trae"><input type="number" min="0" step="any" data-ing="paquete" aria-label="Cantidad que trae el paquete" placeholder="1000"></td>
      <td class="dc-num" data-label="Precio paquete"><span class="dc-input-prefijo"><span>$</span><input type="number" min="0" step="any" data-ing="precio" aria-label="Precio del paquete"></span></td>
      <td class="dc-num dc-calc" data-label="Usás" data-ing-res="usa"></td>
      <td class="dc-num dc-calc" data-label="Costo" data-ing-res="costo"></td>
      <td class="dc-celda-quitar"><button type="button" class="dc-quitar" data-accion="quitar" aria-label="Quitar ingrediente">×</button></td>`;
    for (const k of ["nombre", "cantidad", "unidad", "paquete", "precio"]) {
      if (ing[k] != null) fila.querySelector(`[data-ing="${k}"]`).value = ing[k];
    }
    // Las recetas guardadas toman el precio vigente de la base
    const insumo = buscarInsumo(ing.nombre);
    if (insumo) aplicarInsumo(fila, insumo);
  }

  function estado() {
    return {
      nombre: campo("nombre").value.trim(),
      molde: num(campo("molde")),
      destino: num(campo("destino")),
      caja: num(campo("caja")),
      otros: num(campo("otros")),
      ganancia: num(campo("ganancia")),
      comparar: comparar.value,
      ingredientes: [...cuerpo.rows].map((f) => {
        const v = (k) => f.querySelector(`[data-ing="${k}"]`).value;
        return { nombre: v("nombre"), cantidad: v("cantidad"), unidad: v("unidad"), paquete: v("paquete"), precio: v("precio") };
      }),
    };
  }

  function cargar(r = {}) {
    campo("nombre").value = r.nombre || "";
    campo("molde").value = r.molde || 18;
    campo("destino").value = r.destino || r.molde || 18;
    campo("caja").value = r.caja ?? 0;
    campo("otros").value = r.otros ?? 10;
    campo("ganancia").value = r.ganancia ?? 100;
    comparar.value = r.comparar || "";
    cuerpo.innerHTML = "";
    const ings = r.ingredientes && r.ingredientes.length ? r.ingredientes : [{}];
    ings.forEach(filaIngrediente);
    calcular();
  }

  function calcular() {
    const e = estado();
    const factor = e.molde > 0 && e.destino > 0 ? Math.pow(e.destino / e.molde, 2) : 1;

    raiz.querySelector(".dc-factor").textContent = factor === 1
      ? "Cantidades tal como están en la receta."
      : `Las cantidades se multiplican por ${cantidad.format(factor)} (molde de ${e.destino} cm en lugar de ${e.molde} cm).`;

    let ingredientes = 0;
    [...cuerpo.rows].forEach((fila, i) => {
      const ing = e.ingredientes[i];
      const usa = (parseFloat(ing.cantidad) || 0) * factor;
      const paquete = parseFloat(ing.paquete) || 0;
      const costo = paquete > 0 ? (usa / paquete) * (parseFloat(ing.precio) || 0) : 0;
      ingredientes += costo;
      fila.querySelector('[data-ing-res="usa"]').textContent = usa ? `${cantidad.format(usa)} ${ing.unidad}` : "—";
      fila.querySelector('[data-ing-res="costo"]').textContent = costo ? pesos(costo) : "—";
    });

    const otros = ingredientes * (e.otros / 100);
    const costo = ingredientes + otros + e.caja;
    const redondeo = precios ? precios.redondeo() : 10;
    const sugerido = Math.round((costo * (1 + e.ganancia / 100)) / redondeo) * redondeo;

    res("ingredientes").textContent = pesos(ingredientes);
    res("otros").textContent = pesos(otros);
    res("caja").textContent = pesos(e.caja);
    res("costo").textContent = pesos(costo);
    res("precio").textContent = pesos(sugerido);

    const comp = raiz.querySelector(".dc-comparacion");
    const prod = precios && e.comparar ? precios.productos.find((p) => p.nombre === e.comparar) : null;
    if (prod && e.destino > 0) {
      const lista = precios.precio(prod, e.destino);
      const ganancia = lista - costo;
      const pct = costo > 0 ? Math.round((ganancia / costo) * 100) : 0;
      comp.textContent = `${prod.nombre} de ${e.destino} cm en la lista: ${pesos(lista)}. ` +
        (costo > 0 ? `Con ese precio ganás ${pesos(ganancia)} (${pct} % sobre el costo).` : "");
      comp.classList.toggle("dc-alerta", costo > 0 && ganancia < 0);
    } else {
      comp.textContent = "";
    }

    escribir(CLAVE_BORRADOR, e);
  }

  // ----- Recetas guardadas: en la base D1 si hay clave, si no en este navegador -----

  const estadoRecetas = raiz.querySelector(".dc-estado-recetas");
  const formClave = raiz.querySelector(".dc-clave");
  let recetas = leer(CLAVE_RECETAS, {});
  let enBase = false;

  function avisar(texto, alerta = false) {
    estadoRecetas.textContent = texto;
    estadoRecetas.classList.toggle("dc-alerta", alerta);
  }

  const apiRecetas = (metodo, nombre = "", datos) =>
    api("recetas" + (nombre ? "/" + encodeURIComponent(nombre) : ""), metodo, datos);

  // Avisa a la sección de stock que cambió la lista de recetas
  const recetasCambiaron = () => document.dispatchEvent(new Event("dc-recetas"));

  async function traerDeBase() {
    const lista = await apiRecetas("GET");
    recetas = Object.fromEntries(lista.map((r) => [r.nombre, r]));
  }

  async function conectar(claveNueva = false) {
    try {
      await traerDeBase();
    } catch (e) {
      enBase = false;
      formClave.hidden = e.status !== 401;
      if (e.status === 401) {
        avisar(claveNueva
          ? "Clave incorrecta."
          : "Las recetas se guardan solo en este navegador. Ingresá la clave para guardarlas en la base.", claveNueva);
      }
      // Sin API (por ejemplo con hugo server) se sigue usando este navegador
      return;
    }
    enBase = true;
    formClave.hidden = true;

    // Sube las recetas que estaban guardadas solo en este navegador
    const locales = Object.entries(leer(CLAVE_RECETAS, {})).filter(([n]) => !recetas[n]);
    try {
      for (const [n, r] of locales) await apiRecetas("PUT", n, r);
      if (locales.length) {
        await traerDeBase();
        recetasCambiaron();
      }
      escribir(CLAVE_RECETAS, {});
      avisar(locales.length
        ? `Las recetas se guardan en la base de datos (${locales.length === 1 ? "se subió 1 receta" : `se subieron ${locales.length} recetas`} de este navegador).`
        : "Las recetas se guardan en la base de datos.");
    } catch (e) {
      avisar("No se pudieron subir las recetas de este navegador; siguen guardadas acá.", true);
    }
    listarGuardadas(guardadas.value);
  }

  function listarGuardadas(seleccion = "") {
    guardadas.length = 1;
    Object.keys(recetas).sort((a, b) => a.localeCompare(b, "es")).forEach((n) => guardadas.add(new Option(n, n)));
    guardadas.value = seleccion;
  }

  raiz.addEventListener("input", (ev) => {
    if (ev.target.dataset.ing === "nombre") {
      const insumo = buscarInsumo(ev.target.value);
      if (insumo) aplicarInsumo(ev.target.closest("tr"), insumo);
    }
    calcular();
  });
  raiz.addEventListener("change", (ev) => {
    if (ev.target === guardadas) {
      cargar(guardadas.value ? recetas[guardadas.value] : {});
    } else {
      calcular();
    }
  });

  formularioClave(formClave, conectar);

  raiz.addEventListener("click", async (ev) => {
    const boton = ev.target.closest("[data-accion]");
    if (!boton) return;
    const accion = boton.dataset.accion;
    if (accion === "agregar") {
      filaIngrediente({ unidad: "g" });
      cuerpo.rows[cuerpo.rows.length - 1].querySelector("input").focus();
      calcular();
    } else if (accion === "quitar") {
      boton.closest("tr").remove();
      if (!cuerpo.rows.length) filaIngrediente();
      calcular();
    } else if (accion === "guardar") {
      const e = estado();
      if (!e.nombre) {
        campo("nombre").focus();
        return;
      }
      if (enBase) {
        try {
          await apiRecetas("PUT", e.nombre, e);
          await traerDeBase();
        } catch (err) {
          avisar(`No se pudo guardar "${e.nombre}" en la base (${err.message}). Probá de nuevo.`, true);
          return;
        }
        recetasCambiaron();
        avisar(`"${e.nombre}" guardada en la base de datos.`);
      } else {
        recetas[e.nombre] = e;
        escribir(CLAVE_RECETAS, recetas);
      }
      // La base no distingue mayúsculas: se selecciona el nombre tal como quedó guardado
      const guardada = Object.keys(recetas).find((n) => n.toLowerCase() === e.nombre.toLowerCase());
      listarGuardadas(guardada || e.nombre);
    } else if (accion === "borrar") {
      const nombre = guardadas.value;
      if (!nombre) return;
      if (enBase) {
        try {
          await apiRecetas("DELETE", nombre);
          await traerDeBase();
        } catch (err) {
          avisar(`No se pudo borrar "${nombre}" de la base (${err.message}).`, true);
          return;
        }
        recetasCambiaron();
        avisar(`"${nombre}" borrada de la base de datos.`);
      } else {
        delete recetas[nombre];
        escribir(CLAVE_RECETAS, recetas);
      }
      listarGuardadas();
      cargar({});
    }
  });

  if (precios) precios.alCambiar(calcular);

  const borrador = leer(CLAVE_BORRADOR, null);
  listarGuardadas(borrador && recetas[borrador.nombre] ? borrador.nombre : "");
  cargar(borrador || {});
  conectar();

  // Precios vigentes desde la base D1; si no responde, queda la copia de la página
  fetch("/api/insumos")
    .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
    .then((lista) => {
      if (!Array.isArray(lista) || !lista.length) return;
      usarInsumos(lista);
      for (const fila of cuerpo.rows) {
        const insumo = buscarInsumo(fila.querySelector('[data-ing="nombre"]').value);
        if (insumo) aplicarInsumo(fila, insumo);
      }
      calcular();
    })
    .catch(() => {});
}

// ---------- Stock ----------

const TIPOS_OPERACION = { compra: "Compra", produccion: "Receta", ajuste: "Conteo" };
const fechaCorta = new Intl.DateTimeFormat("es-UY", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function crearStock(raiz) {
  const campo = (n) => raiz.querySelector(`[data-campo="${n}"]`);
  const formOp = (op) => raiz.querySelector(`.dc-operacion[data-op="${op}"]`);
  const estado = raiz.querySelector(".dc-estado-recetas");
  const formClave = raiz.querySelector(".dc-clave");
  const contenido = raiz.querySelector(".dc-stock-contenido");
  const resultado = raiz.querySelector(".dc-resultado");
  let insumos = [];
  let recetas = [];

  const conUnidad = (n, unidad) => `${cantidad.format(n)} ${unidad}`;
  const buscarInsumo = (nombre) => {
    const n = String(nombre || "").trim().toLowerCase();
    return insumos.find((i) => i.nombre.toLowerCase() === n);
  };

  function avisar(texto, alerta = false) {
    estado.textContent = texto;
    estado.classList.toggle("dc-alerta", alerta);
  }

  function mostrarResultado(texto, omitidos = [], alerta = false) {
    const lineas = [texto, omitidos.length ? `No se descontaron: ${omitidos.join(", ")}.` : ""].filter(Boolean);
    resultado.replaceChildren(...lineas.map((l) => Object.assign(document.createElement("p"), { textContent: l })));
    resultado.classList.toggle("dc-alerta", alerta);
  }

  function celda(fila, texto, etiqueta, clase = "") {
    const td = fila.insertCell();
    td.textContent = texto;
    td.dataset.label = etiqueta;
    if (clase) td.className = clase;
    return td;
  }

  function dibujarStock() {
    const filtro = campo("buscar").value.trim().toLowerCase();
    const soloConStock = campo("con-stock").checked;
    const cuerpo = raiz.querySelector(".dc-tabla-stock tbody");
    cuerpo.replaceChildren();
    for (const i of insumos) {
      if (soloConStock && Math.abs(i.stock) < 1e-9) continue;
      if (filtro && !`${i.nombre} ${i.categoria}`.toLowerCase().includes(filtro)) continue;
      const fila = cuerpo.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = i.nombre;
      fila.appendChild(th);
      celda(fila, i.categoria, "Categoría", "dc-categoria");
      const stock = celda(fila, conUnidad(i.stock, i.unidad), "Stock", "dc-num");
      if (i.stock < 0) stock.classList.add("dc-negativo");
      celda(fila, i.valor > 0 ? pesos(i.valor) : "—", "Valor", "dc-num");
    }
    const total = insumos.reduce((t, i) => t + Math.max(i.valor, 0), 0);
    raiz.querySelector("[data-total]").textContent =
      `Valor del stock a precio de lista: ${pesos(total)}.` +
      (insumos.some((i) => i.stock < 0) ? " En rojo, insumos que quedaron en negativo: conviene contarlos." : "");
  }

  function dibujarMovimientos(operaciones) {
    const cuerpo = raiz.querySelector(".dc-tabla-movimientos tbody");
    cuerpo.replaceChildren();
    if (!operaciones.length) {
      const td = cuerpo.insertRow().insertCell();
      td.colSpan = 4;
      td.textContent = "Todavía no hay movimientos.";
      return;
    }
    for (const op of operaciones) {
      const fila = cuerpo.insertRow();
      // La base guarda la fecha en UTC
      celda(fila, fechaCorta.format(new Date(op.fecha.replace(" ", "T") + "Z")), "Fecha");
      celda(fila, TIPOS_OPERACION[op.tipo] || op.tipo, "Qué");
      const detalle = celda(fila, op.detalle, "Detalle", "dc-detalle");
      if (op.tipo === "produccion" && op.movimientos.length) {
        const lista = document.createElement("small");
        lista.textContent = op.movimientos
          .map((m) => `${m.nombre} ${m.cantidad < 0 ? "−" : "+"}${conUnidad(Math.abs(m.cantidad), m.unidad)}`)
          .join(" · ");
        detalle.append(document.createElement("br"), lista);
      }
      const td = fila.insertCell();
      td.className = "dc-celda-quitar";
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "dc-sec dc-deshacer";
      boton.dataset.deshacer = op.id;
      boton.textContent = "Deshacer";
      td.appendChild(boton);
    }
  }

  function llenarListas() {
    const select = formOp("produccion").elements.receta;
    const elegida = select.value;
    select.length = 1;
    recetas.forEach((r) => select.add(new Option(r.nombre, r.nombre)));
    select.value = recetas.some((r) => r.nombre === elegida) ? elegida : "";

    raiz.querySelector("#dc-lista-stock").replaceChildren(
      ...insumos.map((i) => new Option(`Tenés ${conUnidad(i.stock, i.unidad)}`, i.nombre)));
  }

  // Ayuda bajo los formularios de compra y conteo según el insumo elegido
  function ayudar(form) {
    const insumo = buscarInsumo(form.elements.insumo.value);
    const ayuda = form.querySelector("[data-ayuda]");
    if (!insumo) {
      ayuda.textContent = form.elements.insumo.value.trim() ? "Ese insumo no está en la lista." : "";
      if (form.dataset.op === "compra") form.elements.precio.placeholder = "igual";
      return;
    }
    if (form.dataset.op === "compra") {
      const paquetes = num(form.elements.paquetes);
      form.elements.precio.placeholder = cantidad.format(insumo.precio);
      ayuda.textContent = `Paquete de ${conUnidad(insumo.paquete, insumo.unidad)} a ${pesos(insumo.precio)}. ` +
        `Sumás ${conUnidad(paquetes * insumo.paquete, insumo.unidad)}; ahora tenés ${conUnidad(insumo.stock, insumo.unidad)}.`;
    } else {
      form.querySelector("[data-unidad]").textContent = insumo.unidad;
      ayuda.textContent = `Ahora figura ${conUnidad(insumo.stock, insumo.unidad)}.`;
    }
  }

  async function cargar(claveNueva = false) {
    let stock;
    try {
      [stock, recetas] = await Promise.all([api("stock"), api("recetas")]);
    } catch (e) {
      contenido.hidden = true;
      formClave.hidden = e.status !== 401;
      if (e.status === 401) {
        avisar(claveNueva ? "Clave incorrecta." : "Ingresá la clave para ver y cargar el stock.", claveNueva);
      } else {
        avisar(e.status ? `No se pudo leer el stock (${e.message}).` : "El stock necesita la base de datos, que no está disponible acá.", true);
      }
      return;
    }
    insumos = stock.insumos;
    formClave.hidden = true;
    contenido.hidden = false;
    avisar("");
    llenarListas();
    dibujarStock();
    dibujarMovimientos(stock.operaciones);
    for (const op of ["compra", "ajuste"]) ayudar(formOp(op));
  }

  raiz.addEventListener("click", async (ev) => {
    const pestana = ev.target.closest("[data-pestana]");
    if (pestana) {
      raiz.querySelectorAll("[data-pestana]").forEach((b) => b.setAttribute("aria-pressed", b === pestana));
      raiz.querySelectorAll(".dc-operacion").forEach((f) => (f.hidden = f.dataset.op !== pestana.dataset.pestana));
      resultado.replaceChildren();
      return;
    }

    // Deshacer pide un segundo clic para confirmar
    const boton = ev.target.closest("[data-deshacer]");
    if (!boton) return;
    if (!boton.classList.contains("dc-confirmar")) {
      raiz.querySelectorAll(".dc-confirmar").forEach((b) => {
        b.classList.remove("dc-confirmar");
        b.textContent = "Deshacer";
      });
      boton.classList.add("dc-confirmar");
      boton.textContent = "¿Seguro?";
      return;
    }
    boton.disabled = true;
    try {
      await api(`stock/operaciones/${boton.dataset.deshacer}`, "DELETE");
      mostrarResultado("Movimiento deshecho.");
    } catch (e) {
      mostrarResultado(`No se pudo deshacer (${e.message}).`, [], true);
    }
    await cargar();
  });

  raiz.addEventListener("input", (ev) => {
    const form = ev.target.closest(".dc-operacion");
    if (form && form.dataset.op !== "produccion") ayudar(form);
    if (ev.target.closest(".dc-filtros")) dibujarStock();
  });

  formOp("produccion").elements.receta.addEventListener("change", (ev) => {
    const receta = recetas.find((r) => r.nombre === ev.target.value);
    if (receta) formOp("produccion").elements.destino.value = receta.destino || receta.molde;
  });

  raiz.querySelectorAll(".dc-operacion").forEach((form) => form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const op = form.dataset.op;
    if (op !== "produccion" && !buscarInsumo(form.elements.insumo.value)) {
      mostrarResultado("Elegí un insumo de la lista.", [], true);
      form.elements.insumo.focus();
      return;
    }
    const enviar = form.querySelector('[type="submit"]');
    enviar.disabled = true;
    try {
      const r = await api(`stock/${op}`, "POST", Object.fromEntries(new FormData(form)));
      mostrarResultado(r.mensaje, r.omitidos || []);
      if (op !== "produccion") {
        form.elements.insumo.value = "";
        if (op === "compra") form.elements.precio.value = "";
        else form.elements.cantidad.value = "";
      }
      await cargar();
    } catch (e) {
      mostrarResultado(e.message, (e.datos && e.datos.omitidos) || [], true);
    } finally {
      enviar.disabled = false;
    }
  }));

  formularioClave(formClave, cargar);
  document.addEventListener("dc-recetas", () => cargar());
  cargar();
}

// ---------- Ventas ----------

const diaCorto = new Intl.DateTimeFormat("es-UY", { weekday: "short", day: "2-digit", month: "2-digit" });

// Fecha local AAAA-MM-DD (toISOString daría la fecha en UTC)
function fechaLocal(d = new Date()) {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function crearVentas(raiz, precios) {
  const campo = (n) => raiz.querySelector(`[data-campo="${n}"]`);
  const res = (n) => raiz.querySelector(`[data-res="${n}"]`);
  const estado = raiz.querySelector(".dc-estado-recetas");
  const formClave = raiz.querySelector(".dc-clave");
  const contenido = raiz.querySelector(".dc-ventas-contenido");
  const resultado = raiz.querySelector(".dc-resultado");
  const form = raiz.querySelector(".dc-venta");
  const productos = precios ? precios.productos : [];

  const dia = (f) => diaCorto.format(new Date(f + "T12:00"));
  const pesosO = (n) => (n == null ? "—" : pesos(n));

  function avisar(texto, alerta = false) {
    estado.textContent = texto;
    estado.classList.toggle("dc-alerta", alerta);
  }

  function mostrarResultado(texto, alerta = false) {
    resultado.replaceChildren(Object.assign(document.createElement("p"), { textContent: texto }));
    resultado.classList.toggle("dc-alerta", alerta);
  }

  function celda(fila, texto, etiqueta, clase = "") {
    const td = fila.insertCell();
    td.textContent = texto;
    td.dataset.label = etiqueta;
    if (clase) td.className = clase;
    return td;
  }

  // Precio de la lista para el producto y la medida elegidos
  function completarPrecio() {
    const nombre = form.elements.producto.value.trim().toLowerCase();
    const prod = productos.find((p) => p.nombre.toLowerCase() === nombre);
    const medida = num(form.elements.medida);
    if (prod && medida > 0) form.elements.precio.value = precios.precio(prod, medida);
  }

  async function listarProductos() {
    let recetas = [];
    try {
      recetas = await api("recetas");
    } catch (e) {
      // Sin recetas en la base: quedan solo los productos de la lista de precios
    }
    const nombres = [...new Set([...productos.map((p) => p.nombre), ...recetas.map((r) => r.nombre)])]
      .sort((a, b) => a.localeCompare(b, "es"));
    raiz.querySelector("#dc-lista-productos").replaceChildren(...nombres.map((n) => new Option(n, n)));
  }

  function dibujar({ ventas, dias }) {
    const suma = (k) => dias.reduce((t, d) => t + (d[k] || 0), 0);
    res("total").textContent = pesos(suma("total"));
    res("unidades").textContent = cantidad.format(suma("unidades"));
    res("costo").textContent = pesos(suma("costo"));
    res("ganancia").textContent = pesos(suma("ganancia"));
    const sinCosto = ventas.filter((v) => v.costo == null).length;
    raiz.querySelector("[data-aviso-costo]").textContent = sinCosto
      ? `${sinCosto} venta${sinCosto === 1 ? "" : "s"} sin receta guardada: no entra${sinCosto === 1 ? "" : "n"} en el costo ni en la ganancia.`
      : "";

    const cuerpoDias = raiz.querySelector(".dc-tabla-dias tbody");
    cuerpoDias.replaceChildren();
    for (const d of dias) {
      const fila = cuerpoDias.insertRow();
      const th = document.createElement("th");
      th.scope = "row";
      th.textContent = dia(d.fecha);
      fila.appendChild(th);
      celda(fila, cantidad.format(d.unidades), "Unidades", "dc-num");
      celda(fila, pesos(d.total), "Vendido", "dc-num");
      celda(fila, pesosO(d.costo), "Costo", "dc-num");
      celda(fila, pesosO(d.ganancia), "Ganancia", "dc-num");
    }

    const cuerpoVentas = raiz.querySelector(".dc-tabla-ventas tbody");
    cuerpoVentas.replaceChildren();
    for (const v of ventas) {
      const fila = cuerpoVentas.insertRow();
      celda(fila, dia(v.fecha), "Día");
      const producto = celda(fila, v.producto + (v.medida ? ` ${cantidad.format(v.medida)} cm` : ""), "Producto", "dc-detalle");
      if (v.nota) producto.append(document.createElement("br"), Object.assign(document.createElement("small"), { textContent: v.nota }));
      celda(fila, cantidad.format(v.cantidad), "Cant.", "dc-num");
      celda(fila, pesos(v.precio), "Precio c/u", "dc-num");
      celda(fila, pesos(v.precio * v.cantidad), "Total", "dc-num");
      const ganancia = celda(fila, v.costo == null ? "—" : pesos((v.precio - v.costo) * v.cantidad), "Ganancia", "dc-num");
      if (v.costo != null && v.precio < v.costo) ganancia.classList.add("dc-negativo");
      const td = fila.insertCell();
      td.className = "dc-celda-quitar";
      const boton = document.createElement("button");
      boton.type = "button";
      boton.className = "dc-sec dc-deshacer";
      boton.dataset.borrar = v.id;
      boton.textContent = "Borrar";
      td.appendChild(boton);
    }
    if (!ventas.length) {
      for (const tabla of [cuerpoDias, cuerpoVentas]) {
        const td = tabla.insertRow().insertCell();
        td.colSpan = 7;
        td.textContent = "No hay ventas en este período.";
      }
    }
  }

  async function cargar(claveNueva = false) {
    let datos;
    try {
      datos = await api(`ventas?desde=${campo("desde").value}&hasta=${campo("hasta").value}`);
    } catch (e) {
      contenido.hidden = true;
      formClave.hidden = e.status !== 401;
      if (e.status === 401) {
        avisar(claveNueva ? "Clave incorrecta." : "Ingresá la clave para ver y cargar las ventas.", claveNueva);
      } else {
        avisar(e.status ? `No se pudieron leer las ventas (${e.message}).` : "Las ventas necesitan la base de datos, que no está disponible acá.", true);
      }
      return;
    }
    formClave.hidden = true;
    contenido.hidden = false;
    avisar("");
    dibujar(datos);
  }

  form.elements.fecha.value = fechaLocal();
  campo("hasta").value = fechaLocal();
  campo("desde").value = fechaLocal().slice(0, 8) + "01";

  form.addEventListener("input", (ev) => {
    if (ev.target.name === "producto" || ev.target.name === "medida") completarPrecio();
  });
  raiz.querySelector(".dc-filtros").addEventListener("change", () => cargar());

  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const enviar = form.querySelector('[type="submit"]');
    enviar.disabled = true;
    try {
      const r = await api("ventas", "POST", Object.fromEntries(new FormData(form)));
      mostrarResultado(r.mensaje);
      // Quedan fecha y medida para cargar seguido varias ventas del mismo día
      for (const n of ["producto", "precio", "nota"]) form.elements[n].value = "";
      form.elements.cantidad.value = 1;
      await cargar();
    } catch (e) {
      mostrarResultado(e.message, true);
    } finally {
      enviar.disabled = false;
    }
  });

  // Borrar pide un segundo clic para confirmar
  raiz.addEventListener("click", async (ev) => {
    const boton = ev.target.closest("[data-borrar]");
    if (!boton) return;
    if (!boton.classList.contains("dc-confirmar")) {
      raiz.querySelectorAll(".dc-confirmar").forEach((b) => {
        b.classList.remove("dc-confirmar");
        b.textContent = "Borrar";
      });
      boton.classList.add("dc-confirmar");
      boton.textContent = "¿Seguro?";
      return;
    }
    boton.disabled = true;
    try {
      await api(`ventas/${boton.dataset.borrar}`, "DELETE");
      mostrarResultado("Venta borrada.");
    } catch (e) {
      mostrarResultado(`No se pudo borrar (${e.message}).`, true);
    }
    await cargar();
  });

  formularioClave(formClave, (claveNueva) => {
    listarProductos();
    cargar(claveNueva);
  });
  document.addEventListener("dc-recetas", listarProductos);
  listarProductos();
  cargar();
}

document.addEventListener("DOMContentLoaded", () => {
  const stock = document.getElementById("dc-stock");
  if (stock) crearStock(stock);
  const tabla = document.getElementById("dc-precios");
  const precios = tabla ? crearPrecios(tabla) : null;
  const receta = document.getElementById("dc-receta");
  if (receta) crearReceta(receta, precios);
  const ventas = document.getElementById("dc-ventas");
  if (ventas) crearVentas(ventas, precios);
});
