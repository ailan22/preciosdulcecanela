// Dulce Canela: lista de precios por medida y calculador de costo de recetas.

const CLAVE_RECETAS = "dulce-canela-recetas";
const CLAVE_BORRADOR = "dulce-canela-borrador";
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
        if (m === prod.medida_base) td.classList.add("dc-base");
        td.textContent = pesos(precio(prod, m, a));
        if (prod.fijos && prod.fijos[String(m)] != null) {
          const s = document.createElement("span");
          s.className = "dc-marca-fijo";
          s.textContent = "*";
          td.appendChild(s);
        }
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
    precios.productos.forEach((p, i) => comparar.add(new Option(p.nombre, i)));
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
    const prod = precios && e.comparar !== "" ? precios.productos[e.comparar] : null;
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

  function listarGuardadas(seleccion = "") {
    const recetas = leer(CLAVE_RECETAS, {});
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
      const recetas = leer(CLAVE_RECETAS, {});
      cargar(guardadas.value ? recetas[guardadas.value] : {});
    } else {
      calcular();
    }
  });

  raiz.addEventListener("click", (ev) => {
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
      const recetas = leer(CLAVE_RECETAS, {});
      recetas[e.nombre] = e;
      escribir(CLAVE_RECETAS, recetas);
      listarGuardadas(e.nombre);
    } else if (accion === "borrar") {
      const recetas = leer(CLAVE_RECETAS, {});
      delete recetas[guardadas.value];
      escribir(CLAVE_RECETAS, recetas);
      listarGuardadas();
      cargar({});
    }
  });

  if (precios) precios.alCambiar(calcular);

  const borrador = leer(CLAVE_BORRADOR, null);
  listarGuardadas(borrador && leer(CLAVE_RECETAS, {})[borrador.nombre] ? borrador.nombre : "");
  cargar(borrador || {});

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

document.addEventListener("DOMContentLoaded", () => {
  const tabla = document.getElementById("dc-precios");
  const precios = tabla ? crearPrecios(tabla) : null;
  const receta = document.getElementById("dc-receta");
  if (receta) crearReceta(receta, precios);
});
