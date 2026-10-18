const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

// Código de país para armar los links de WhatsApp (593 = Ecuador). Cámbialo si hace falta.
const CODIGO_PAIS = "593";
const COLOR_DEFECTO = "#8A8578";

// Plataformas que vienen por defecto. Las que agregues tú se guardan en la base de datos.
const PLATAFORMAS_BASE = [
  { nombre: "Netflix", color: "#D4533E" },
  { nombre: "Disney+", color: "#3E6BD4" },
  { nombre: "HBO Max", color: "#7C4FD4" },
  { nombre: "Prime Video", color: "#3EA0D4" },
  { nombre: "Spotify", color: "#3FA85C" },
];

let cuentas = [];
let plataformasCustom = [];
let vista = "dashboard"; // "dashboard" | "cuenta" | "plataformas"
let seleccionId = null;
let editandoPerfilId = null;
let filtro = { estado: "pendientes", texto: "" };

const $ = (sel) => document.querySelector(sel);

// ---------- Fechas ----------
function isoLocal(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${dia}`;
}
// Hoy (según tu zona horaria) como medianoche UTC, para comparar con fechas "YYYY-MM-DD"
const hoy = () => new Date(isoLocal() + "T00:00:00Z");
const sumarDias = (fechaISO, dias) => { const d = new Date(fechaISO); d.setUTCDate(d.getUTCDate() + Number(dias)); return d; };
const formatoFecha = (d) => d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
const diasRestantes = (fechaVenc) => Math.round((fechaVenc.getTime() - hoy().getTime()) / 86400000);

function estadoPerfil(p) {
  if (!p.comprador || !p.fecha_venta) {
    return { key: "disponible", label: "Disponible", color: "#8A8578", bg: "#26251F", venc: null };
  }
  const venc = sumarDias(p.fecha_venta, p.duracion_dias || 30);
  const restan = diasRestantes(venc);
  if (restan < 0) return { key: "vencido", label: "Vencido", color: "#E0524F", bg: "#2E1A19", venc };
  if (restan <= 3) return { key: "por_vencer", label: restan === 0 ? "Vence hoy" : `Vence en ${restan}d`, color: "#E0A030", bg: "#2E2618", venc };
  return { key: "activo", label: "Activo", color: "#4FAE6D", bg: "#1B2A20", venc };
}

function etiquetaEstado(est) {
  if (est.key === "vencido") return `Vencido hace ${-diasRestantes(est.venc)}d`;
  return est.label;
}

// ---------- Dinero ----------
// Toma el primer número que encuentre en el precio ("2.50 promo" -> 2.5)
function precioNum(p) {
  const m = String(p.precio || "").replace(",", ".").match(/\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}
const dinero = (n) => "$" + n.toFixed(2);

// ---------- Plataformas ----------
function getPlataformas() {
  const mapa = new Map();
  PLATAFORMAS_BASE.forEach((p) => mapa.set(p.nombre.toLowerCase(), { nombre: p.nombre, color: p.color, id: null }));
  plataformasCustom.forEach((p) => mapa.set(p.nombre.toLowerCase(), { nombre: p.nombre, color: p.color, id: p.id }));
  cuentas.forEach((c) => {
    const k = (c.plataforma || "").toLowerCase();
    if (k && !mapa.has(k)) mapa.set(k, { nombre: c.plataforma, color: COLOR_DEFECTO, id: null });
  });
  return [...mapa.values()];
}
const colorDe = (nombre) => {
  const f = getPlataformas().find((p) => p.nombre.toLowerCase() === (nombre || "").toLowerCase());
  return f ? f.color : COLOR_DEFECTO;
};

// ---------- WhatsApp ----------
function normalizarTelefono(txt) {
  let d = (txt || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = CODIGO_PAIS + d.slice(1);
  else if (d.length === 9) d = CODIGO_PAIS + d;
  return d.length >= 10 ? d : "";
}

// Puedes cambiar estos mensajes a tu gusto
function mensajeWsp({ cuenta, perfil, est }) {
  const nombre = (perfil.comprador || "").trim().split(/\s+/)[0] || "";
  const plat = cuenta.plataforma;
  const fecha = est.venc ? formatoFecha(est.venc) : "";
  if (est.key === "vencido") return `Hola ${nombre}, tu perfil de ${plat} venció el ${fecha}. ¿Deseas renovarlo?`;
  if (est.key === "por_vencer") return `Hola ${nombre}, tu perfil de ${plat} vence el ${fecha}. ¿Deseas renovarlo?`;
  return `Hola ${nombre}, te escribo por tu perfil de ${plat}.`;
}

function linkWsp(x) {
  const tel = normalizarTelefono(x.perfil.contacto);
  if (!tel) return null;
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensajeWsp(x))}`;
}

function botonWsp(x) {
  const url = linkWsp(x);
  return url
    ? `<a class="btn btn-wsp" href="${url}" target="_blank" rel="noopener">WhatsApp</a>`
    : `<span class="btn btn-wsp-off" title="El contacto no tiene un número válido">WhatsApp</span>`;
}

// ---------- Auth ----------
$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#login-email").value.trim();
  const password = $("#login-password").value;
  $("#login-error").textContent = "";
  const { error } = await supa.auth.signInWithPassword({ email, password });
  if (error) {
    $("#login-error").textContent = "Correo o contraseña incorrectos.";
    return;
  }
  mostrarApp();
});

$("#btn-salir").addEventListener("click", async () => {
  await supa.auth.signOut();
  location.reload();
});

async function mostrarApp() {
  $("#pantalla-login").classList.add("oculto");
  $("#app").classList.remove("oculto");
  await cargarTodo();
}

(async function init() {
  const { data: { session } } = await supa.auth.getSession();
  if (session) mostrarApp();
})();

// ---------- Datos ----------
async function cargarTodo() {
  const [rc, rp, rpl] = await Promise.all([
    supa.from("cuentas").select("*").order("created_at", { ascending: true }),
    supa.from("perfiles").select("*").order("numero", { ascending: true }),
    supa.from("plataformas").select("*").order("nombre", { ascending: true }),
  ]);
  if (rc.error) return console.error(rc.error);
  if (rp.error) return console.error(rp.error);
  if (rpl.error) console.warn("Falta la tabla plataformas (corre el SQL de migración):", rpl.error.message);
  plataformasCustom = rpl.error ? [] : rpl.data;

  cuentas = rc.data.map((c) => ({ ...c, perfiles: rp.data.filter((p) => p.cuenta_id === c.id) }));
  if (seleccionId && !cuentas.some((c) => c.id === seleccionId)) {
    seleccionId = null;
    if (vista === "cuenta") vista = "dashboard";
  }
  render();
}

function marcarGuardando(activo) {
  $("#estado-guardado").textContent = activo ? "Guardando…" : "";
}

async function agregarCuenta() {
  marcarGuardando(true);
  const { data: { user } } = await supa.auth.getUser();
  const plataforma = (getPlataformas()[0] || {}).nombre || "Netflix";
  const { data: nueva, error } = await supa
    .from("cuentas")
    .insert({ plataforma, user_id: user.id })
    .select()
    .single();
  if (error) { console.error(error); marcarGuardando(false); return; }

  const perfilesNuevos = Array.from({ length: 5 }, (_, i) => ({
    cuenta_id: nueva.id, numero: i + 1, user_id: user.id,
  }));
  const { error: e2 } = await supa.from("perfiles").insert(perfilesNuevos);
  if (e2) console.error(e2);

  seleccionId = nueva.id;
  vista = "cuenta";
  await cargarTodo();
  marcarGuardando(false);
}

async function borrarCuenta(id) {
  if (!confirm("¿Eliminar esta cuenta y sus 5 perfiles? No se puede deshacer.")) return;
  marcarGuardando(true);
  await supa.from("cuentas").delete().eq("id", id);
  if (seleccionId === id) { seleccionId = null; vista = "dashboard"; }
  await cargarTodo();
  marcarGuardando(false);
}

async function editarCampoCuenta(id, campo, valor) {
  marcarGuardando(true);
  await supa.from("cuentas").update({ [campo]: valor }).eq("id", id);
  const c = cuentas.find((c) => c.id === id);
  if (c) c[campo] = valor;
  marcarGuardando(false);
  renderListaCuentas();
}

async function guardarPerfil(perfilId, datos) {
  marcarGuardando(true);
  const { error } = await supa.from("perfiles").update(datos).eq("id", perfilId);
  if (error) { console.error(error); alert("No se pudo guardar: " + error.message); }
  editandoPerfilId = null;
  await cargarTodo();
  marcarGuardando(false);
}

function liberarPerfil(perfilId) {
  guardarPerfil(perfilId, { comprador: "", contacto: "", pin: "", promo: false, fecha_venta: null, duracion_dias: 30, precio: "" });
}

async function renovarPerfil(perfilId) {
  const x = todosLosPerfiles().find((i) => i.perfil.id === perfilId);
  if (!x || !x.est.venc) return;
  const dias = x.perfil.duracion_dias || 30;
  if (!confirm(`¿Renovar a ${x.perfil.comprador} por ${dias} días?`)) return;
  // Si ya venció, cuenta desde hoy; si aún está vigente, se suma al vencimiento actual
  const base = x.est.key === "vencido" ? hoy() : x.est.venc;
  await guardarPerfil(perfilId, { fecha_venta: base.toISOString().slice(0, 10) });
}

async function agregarPlataforma(nombre, color) {
  marcarGuardando(true);
  const { data: { user } } = await supa.auth.getUser();
  const { error } = await supa.from("plataformas").insert({ nombre, color, user_id: user.id });
  marcarGuardando(false);
  if (error) return error.message;
  await cargarTodo();
  return null;
}

async function quitarPlataforma(id) {
  if (!confirm("¿Quitar esta plataforma de la lista? Las cuentas que ya la usan no se borran.")) return;
  marcarGuardando(true);
  await supa.from("plataformas").delete().eq("id", id);
  marcarGuardando(false);
  await cargarTodo();
}

function todosLosPerfiles() {
  const out = [];
  cuentas.forEach((c) => c.perfiles.forEach((p) => out.push({ cuenta: c, perfil: p, est: estadoPerfil(p) })));
  return out;
}

function abrirCuenta(id) {
  vista = "cuenta";
  seleccionId = id;
  editandoPerfilId = null;
  render();
  window.scrollTo(0, 0);
}

// ---------- Render general ----------
function render() {
  renderNav();
  renderListaCuentas();
  if (vista === "dashboard") renderDashboard();
  else if (vista === "plataformas") renderPlataformas();
  else renderContenidoCuenta();
}

function renderNav() {
  $("#nav-dashboard").classList.toggle("activa", vista === "dashboard");
  $("#nav-plataformas").classList.toggle("activa", vista === "plataformas");
}

$("#nav-dashboard").addEventListener("click", () => { vista = "dashboard"; editandoPerfilId = null; render(); });
$("#nav-plataformas").addEventListener("click", () => { vista = "plataformas"; editandoPerfilId = null; render(); });
$("#btn-nueva-cuenta").addEventListener("click", agregarCuenta);

function renderListaCuentas() {
  const cont = $("#lista-cuentas");
  if (cuentas.length === 0) {
    cont.innerHTML = `<div class="vacio">Sin cuentas todavía. Pulsa + para agregar la primera.</div>`;
    return;
  }
  cont.innerHTML = cuentas.map((c) => {
    const vendidos = c.perfiles.filter((p) => p.comprador).length;
    const activa = vista === "cuenta" && c.id === seleccionId;
    return `
      <div class="item-cuenta ${activa ? "activa" : ""}" data-id="${c.id}">
        <div class="item-cuenta-top">
          <span class="punto" style="background:${colorDe(c.plataforma)}"></span>
          <span class="item-cuenta-nombre">${escapeHtml(c.plataforma)}</span>
        </div>
        <div class="item-cuenta-sub">${escapeHtml(c.correo) || "sin correo"} · ${vendidos}/5 vendidos</div>
      </div>`;
  }).join("");
  cont.querySelectorAll(".item-cuenta").forEach((el) => {
    el.addEventListener("click", () => abrirCuenta(el.dataset.id));
  });
}

// ---------- Dashboard ----------
const kpi = (valor, etiqueta, color) =>
  `<div class="kpi"><div class="kpi-valor" ${color ? `style="color:${color}"` : ""}>${valor}</div><div class="kpi-etiqueta">${etiqueta}</div></div>`;

function renderDashboard() {
  const cont = $("#contenido");
  const todos = todosLosPerfiles();
  const vendidos = todos.filter((x) => x.est.key !== "disponible");
  const libres = todos.length - vendidos.length;
  const porEstado = (k) => vendidos.filter((x) => x.est.key === k);
  const suma = (arr) => arr.reduce((s, x) => s + precioNum(x.perfil), 0);
  const vigentes = vendidos.filter((x) => x.est.key !== "vencido");
  const pendientes = vendidos.filter((x) => x.est.key === "por_vencer" || x.est.key === "vencido");
  const promos = vendidos.filter((x) => x.perfil.promo).length;

  const filasPlataforma = getPlataformas().map((pl) => {
    const cs = cuentas.filter((c) => (c.plataforma || "").toLowerCase() === pl.nombre.toLowerCase());
    if (!cs.length) return "";
    const ps = cs.flatMap((c) => c.perfiles);
    const v = ps.filter((p) => estadoPerfil(p).key !== "disponible");
    const ing = v.filter((p) => estadoPerfil(p).key !== "vencido").reduce((s, p) => s + precioNum(p), 0);
    return `<tr>
      <td><span class="punto" style="background:${pl.color}"></span> ${escapeHtml(pl.nombre)}</td>
      <td>${cs.length}</td><td>${v.length}/${ps.length}</td><td>${ps.length - v.length}</td><td>${dinero(ing)}</td>
    </tr>`;
  }).join("");

  const conLibres = cuentas
    .map((c) => ({ c, libres: c.perfiles.filter((p) => estadoPerfil(p).key === "disponible").length }))
    .filter((x) => x.libres > 0)
    .sort((a, b) => b.libres - a.libres);

  cont.innerHTML = `
    <h2 class="titulo-vista">Dashboard</h2>
    <div class="kpis">
      ${kpi(cuentas.length, "Cuentas")}
      ${kpi(`${vendidos.length}/${todos.length}`, "Perfiles vendidos")}
      ${kpi(libres, "Perfiles libres")}
      ${kpi(porEstado("activo").length, "Activos", "#4FAE6D")}
      ${kpi(porEstado("por_vencer").length, "Por vencer (≤3 días)", "#E0A030")}
      ${kpi(porEstado("vencido").length, "Vencidos", "#E0524F")}
      ${kpi(dinero(suma(vigentes)), "Ingresos vigentes")}
      ${kpi(dinero(suma(pendientes)), "Por renovar / cobrar")}
      ${kpi(promos, "Ventas en promo")}
    </div>

    <h3 class="subtitulo">Vencimientos y renovaciones</h3>
    <div class="barra-filtros">
      <select id="filtro-estado">
        <option value="pendientes">Por vencer y vencidos</option>
        <option value="vencido">Solo vencidos</option>
        <option value="por_vencer">Solo por vencer</option>
        <option value="activo">Activos</option>
        <option value="todos">Todos los vendidos</option>
      </select>
      <input type="text" id="filtro-texto" placeholder="Buscar cliente, teléfono o correo" />
    </div>
    <div class="tabla-wrap" id="tabla-venc"></div>

    <h3 class="subtitulo">Por plataforma</h3>
    <div class="tabla-wrap">
      <table class="tabla">
        <thead><tr><th>Plataforma</th><th>Cuentas</th><th>Vendidos</th><th>Libres</th><th>Ingresos vigentes</th></tr></thead>
        <tbody>${filasPlataforma || `<tr><td colspan="5" class="sub">Sin cuentas todavía.</td></tr>`}</tbody>
      </table>
    </div>

    <h3 class="subtitulo">Dónde hay perfiles libres</h3>
    <div class="chips-libres">
      ${conLibres.length ? conLibres.map(({ c, libres }) => `
        <button class="chip-cuenta" data-ver="${c.id}">
          <span class="punto" style="background:${colorDe(c.plataforma)}"></span>
          ${escapeHtml(c.plataforma)} · ${escapeHtml(c.correo) || "sin correo"} <b>${libres} libre${libres === 1 ? "" : "s"}</b>
        </button>`).join("") : `<div class="vacio">No hay perfiles libres.</div>`}
    </div>
  `;

  $("#filtro-estado").value = filtro.estado;
  $("#filtro-texto").value = filtro.texto;
  $("#filtro-estado").addEventListener("change", (e) => { filtro.estado = e.target.value; renderTablaVencimientos(); });
  $("#filtro-texto").addEventListener("input", (e) => { filtro.texto = e.target.value; renderTablaVencimientos(); });

  cont.onclick = (e) => {
    const r = e.target.closest("[data-renovar]");
    if (r) { renovarPerfil(r.dataset.renovar); return; }
    const v = e.target.closest("[data-ver]");
    if (v) abrirCuenta(v.dataset.ver);
  };

  renderTablaVencimientos();
}

function renderTablaVencimientos() {
  const cont = $("#tabla-venc");
  if (!cont) return;
  const txt = filtro.texto.trim().toLowerCase();

  let filas = todosLosPerfiles().filter((x) => x.est.key !== "disponible");
  if (filtro.estado === "pendientes") filas = filas.filter((x) => x.est.key === "vencido" || x.est.key === "por_vencer");
  else if (filtro.estado !== "todos") filas = filas.filter((x) => x.est.key === filtro.estado);
  if (txt) {
    filas = filas.filter((x) =>
      [x.perfil.comprador, x.perfil.contacto, x.cuenta.correo, x.cuenta.plataforma].join(" ").toLowerCase().includes(txt));
  }
  filas.sort((a, b) => a.est.venc - b.est.venc);

  if (!filas.length) {
    cont.innerHTML = `<div class="vacio" style="padding:14px">No hay perfiles con ese filtro.</div>`;
    return;
  }

  cont.innerHTML = `
    <table class="tabla">
      <thead><tr><th>Cliente</th><th>Cuenta</th><th>Vence</th><th>Estado</th><th>Precio</th><th></th></tr></thead>
      <tbody>
        ${filas.map((x) => {
          const { cuenta: c, perfil: p, est } = x;
          return `<tr>
            <td><b>${escapeHtml(p.comprador)}</b>${p.promo ? `<span class="tag-promo">Promo</span>` : ""}
              <div class="sub">${escapeHtml(p.contacto) || "sin contacto"}</div></td>
            <td><span class="punto" style="background:${colorDe(c.plataforma)}"></span> ${escapeHtml(c.plataforma)}
              <div class="sub">${escapeHtml(c.correo) || "sin correo"} · Perfil ${p.numero}</div></td>
            <td>${formatoFecha(est.venc)}</td>
            <td><span class="badge-estado" style="background:${est.bg};color:${est.color};white-space:nowrap">${etiquetaEstado(est)}</span></td>
            <td>${escapeHtml(p.precio) || "—"}</td>
            <td><div class="acciones-tabla">
              ${botonWsp(x)}
              <button class="btn" data-renovar="${p.id}">Renovar</button>
              <button class="btn btn-fantasma" data-ver="${c.id}">Ver</button>
            </div></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>`;
}

// ---------- Plataformas ----------
function renderPlataformas() {
  const cont = $("#contenido");
  cont.onclick = null;
  const lista = getPlataformas();

  cont.innerHTML = `
    <h2 class="titulo-vista">Plataformas</h2>
    <form id="form-plataforma" class="form-plataforma">
      <input type="text" id="pl-nombre" placeholder="Nombre (ej. Crunchyroll)" maxlength="40" required />
      <input type="color" id="pl-color" value="#7C6FF0" title="Color" />
      <button type="submit" class="btn btn-primario">Agregar</button>
    </form>
    <div class="error-form" id="pl-error"></div>
    <div class="lista-plataformas">
      ${lista.map((pl) => {
        const usos = cuentas.filter((c) => (c.plataforma || "").toLowerCase() === pl.nombre.toLowerCase()).length;
        return `<div class="item-plataforma">
          <span class="punto" style="background:${pl.color}"></span>
          <span class="item-plataforma-nombre">${escapeHtml(pl.nombre)}</span>
          <span class="sub">${usos} cuenta${usos === 1 ? "" : "s"}</span>
          ${pl.id ? `<button class="btn btn-fantasma btn-chico" data-borrar-pl="${pl.id}">Quitar</button>` : ""}
        </div>`;
      }).join("")}
    </div>`;

  $("#form-plataforma").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nombre = $("#pl-nombre").value.trim();
    const color = $("#pl-color").value;
    const err = $("#pl-error");
    err.textContent = "";
    if (!nombre) return;
    if (getPlataformas().some((p) => p.nombre.toLowerCase() === nombre.toLowerCase())) {
      err.textContent = "Esa plataforma ya existe.";
      return;
    }
    const msg = await agregarPlataforma(nombre, color);
    if (msg) {
      const el = $("#pl-error");
      if (el) el.textContent = "No se pudo guardar. ¿Corriste el SQL de migración? (" + msg + ")";
    }
  });

  cont.querySelector(".lista-plataformas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-borrar-pl]");
    if (b) quitarPlataforma(b.dataset.borrarPl);
  });
}

// ---------- Vista de una cuenta ----------
function renderContenidoCuenta() {
  const cont = $("#contenido");
  cont.onclick = null;
  const cuenta = cuentas.find((c) => c.id === seleccionId);
  if (!cuenta) {
    cont.innerHTML = `<div class="vacio">Selecciona o crea una cuenta para empezar.</div>`;
    return;
  }

  cont.innerHTML = `
    <div class="encabezado-cuenta">
      <div class="campos-cuenta">
        <div class="campo">
          <label>Plataforma</label>
          <select id="input-plataforma">
            ${getPlataformas().map((p) => `<option value="${escapeAttr(p.nombre)}" ${p.nombre.toLowerCase() === (cuenta.plataforma || "").toLowerCase() ? "selected" : ""}>${escapeHtml(p.nombre)}</option>`).join("")}
          </select>
        </div>
        <div class="campo">
          <label>Correo de la cuenta</label>
          <input id="input-correo" style="width:200px" placeholder="cuenta@correo.com" value="${escapeAttr(cuenta.correo)}" />
        </div>
        <div class="campo">
          <label>Clave</label>
          <input id="input-clave" style="width:130px" placeholder="contraseña" value="${escapeAttr(cuenta.clave)}" />
        </div>
      </div>
      <button id="btn-eliminar-cuenta" class="btn-peligro">Eliminar cuenta</button>
    </div>
    <div class="grid-perfiles" id="grid-perfiles"></div>
  `;

  $("#input-plataforma").addEventListener("change", (e) => editarCampoCuenta(cuenta.id, "plataforma", e.target.value));
  $("#input-correo").addEventListener("blur", (e) => editarCampoCuenta(cuenta.id, "correo", e.target.value));
  $("#input-clave").addEventListener("blur", (e) => editarCampoCuenta(cuenta.id, "clave", e.target.value));
  $("#btn-eliminar-cuenta").addEventListener("click", () => borrarCuenta(cuenta.id));

  $("#grid-perfiles").innerHTML = cuenta.perfiles.map((p) => renderTarjetaPerfil(p, cuenta)).join("");
  cablearTarjetasPerfil(cuenta);
}

function renderTarjetaPerfil(p, cuenta) {
  const est = estadoPerfil(p);
  const editando = editandoPerfilId === p.id;

  if (editando) {
    return `
      <div class="tarjeta-perfil" data-perfil="${p.id}">
        <div class="tarjeta-perfil-top">
          <span>Perfil ${p.numero}</span>
          <span class="badge-estado" style="background:${est.bg};color:${est.color}">${est.label}</span>
        </div>
        <div class="form-perfil">
          <input class="f-comprador" placeholder="Nombre del comprador" value="${escapeAttr(p.comprador)}" />
          <input class="f-contacto" placeholder="WhatsApp (ej. 0989781772)" value="${escapeAttr(p.contacto)}" />
          <input class="f-pin" placeholder="PIN del perfil (ej. 4821)" inputmode="numeric" maxlength="8" value="${escapeAttr(p.pin)}" />
          <div class="fila-fecha-dias">
            <div>
              <label>Fecha de venta</label>
              <input type="date" class="f-fecha" value="${p.fecha_venta ? p.fecha_venta.slice(0, 10) : isoLocal()}" />
            </div>
            <div>
              <label>Días</label>
              <input type="number" min="1" step="1" class="f-dias" value="${p.duracion_dias || 30}" />
            </div>
          </div>
          <input class="f-precio" placeholder="Precio (ej. 2.50)" value="${escapeAttr(p.precio)}" />
          <label class="check-promo"><input type="checkbox" class="f-promo" ${p.promo ? "checked" : ""} /> Venta en promo</label>
          <div class="error-form"></div>
          <div class="acciones-form">
            <button class="btn btn-primario btn-guardar">Guardar</button>
            <button class="btn btn-fantasma btn-cancelar">Cancelar</button>
          </div>
        </div>
      </div>`;
  }

  const x = { cuenta, perfil: p, est };
  return `
    <div class="tarjeta-perfil" data-perfil="${p.id}">
      <div class="tarjeta-perfil-top">
        <span>Perfil ${p.numero}</span>
        <span class="badge-estado" style="background:${est.bg};color:${est.color}">${est.label}</span>
      </div>
      ${p.comprador ? `
        <div class="info-perfil">
          <div><b>${escapeHtml(p.comprador)}</b>${p.promo ? `<span class="tag-promo">Promo</span>` : ""}</div>
          ${p.contacto ? `<div>${escapeHtml(p.contacto)}</div>` : ""}
          ${p.pin ? `<div>PIN: ${escapeHtml(p.pin)}</div>` : ""}
          ${p.fecha_venta ? `<div>Vendido: ${formatoFecha(new Date(p.fecha_venta))}</div>` : ""}
          ${est.venc ? `<div>Vence: ${formatoFecha(est.venc)}</div>` : ""}
          ${p.precio ? `<div>Precio: ${escapeHtml(p.precio)}</div>` : ""}
        </div>` : `<div class="info-vacio">Sin vender todavía.</div>`}
      <div class="acciones-perfil">
        <button class="btn btn-editar">${p.comprador ? "Editar" : "Vender"}</button>
        ${p.comprador ? `${botonWsp(x)}<button class="btn btn-renovar">Renovar</button><button class="btn btn-fantasma btn-liberar">Liberar</button>` : ""}
      </div>
    </div>`;
}

function cablearTarjetasPerfil(cuenta) {
  cuenta.perfiles.forEach((p) => {
    const tarjeta = document.querySelector(`[data-perfil="${p.id}"]`);
    if (!tarjeta) return;

    const on = (sel, fn) => { const el = tarjeta.querySelector(sel); if (el) el.addEventListener("click", fn); };

    on(".btn-editar", () => { editandoPerfilId = p.id; render(); });
    on(".btn-liberar", () => liberarPerfil(p.id));
    on(".btn-renovar", () => renovarPerfil(p.id));
    on(".btn-cancelar", () => { editandoPerfilId = null; render(); });
    on(".btn-guardar", () => {
      const comprador = tarjeta.querySelector(".f-comprador").value.trim();
      const contacto = tarjeta.querySelector(".f-contacto").value.trim();
      const pin = tarjeta.querySelector(".f-pin").value.trim();
      const fecha = tarjeta.querySelector(".f-fecha").value;
      const dias = Number(tarjeta.querySelector(".f-dias").value);
      const precio = tarjeta.querySelector(".f-precio").value.trim();
      const promo = tarjeta.querySelector(".f-promo").checked;
      const errorEl = tarjeta.querySelector(".error-form");

      if (!comprador) { errorEl.textContent = "Ingresa el nombre del comprador."; return; }
      if (!fecha) { errorEl.textContent = "Ingresa la fecha de venta."; return; }
      if (!dias || dias < 1) { errorEl.textContent = "Los días deben ser 1 o más."; return; }

      guardarPerfil(p.id, { comprador, contacto, pin, promo, fecha_venta: fecha, duracion_dias: dias, precio });
    });
  });
}

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }