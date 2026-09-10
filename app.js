const supa = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

const PLATAFORMAS = [
  { nombre: "Netflix", color: "#D4533E" },
  { nombre: "Disney+", color: "#3E6BD4" },
  { nombre: "HBO Max", color: "#7C4FD4" },
  { nombre: "Prime Video", color: "#3EA0D4" },
  { nombre: "Spotify", color: "#3FA85C" },
  { nombre: "Otra", color: "#8A8578" },
];

let cuentas = [];
let seleccionId = null;
let editandoPerfilId = null;

const $ = (sel) => document.querySelector(sel);

// ---------- Fechas ----------
const hoy = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };
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
  if (restan <= 3) return { key: "por_vencer", label: `Vence en ${restan}d`, color: "#E0A030", bg: "#2E2618", venc };
  return { key: "activo", label: "Activo", color: "#4FAE6D", bg: "#1B2A20", venc };
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
  await cargarCuentas();
}

(async function init() {
  const { data: { session } } = await supa.auth.getSession();
  if (session) mostrarApp();
})();

// ---------- Datos ----------
async function cargarCuentas() {
  const { data: filasCuentas, error: e1 } = await supa.from("cuentas").select("*").order("created_at", { ascending: true });
  if (e1) return console.error(e1);
  const { data: filasPerfiles, error: e2 } = await supa.from("perfiles").select("*").order("numero", { ascending: true });
  if (e2) return console.error(e2);

  cuentas = filasCuentas.map((c) => ({ ...c, perfiles: filasPerfiles.filter((p) => p.cuenta_id === c.id) }));
  if (!seleccionId || !cuentas.some((c) => c.id === seleccionId)) {
    seleccionId = cuentas[0]?.id || null;
  }
  render();
}

function marcarGuardando(activo) {
  $("#estado-guardado").textContent = activo ? "Guardando…" : "";
}

async function agregarCuenta() {
  marcarGuardando(true);
  const { data: { user } } = await supa.auth.getUser();
  const { data: nuevaCuenta, error } = await supa
    .from("cuentas")
    .insert({ plataforma: "Netflix", user_id: user.id })
    .select()
    .single();
  if (error) { console.error(error); marcarGuardando(false); return; }

  const perfilesNuevos = Array.from({ length: 5 }, (_, i) => ({
    cuenta_id: nuevaCuenta.id, numero: i + 1, user_id: user.id,
  }));
  const { error: e2 } = await supa.from("perfiles").insert(perfilesNuevos);
  if (e2) console.error(e2);

  seleccionId = nuevaCuenta.id;
  await cargarCuentas();
  marcarGuardando(false);
}

async function borrarCuenta(id) {
  marcarGuardando(true);
  await supa.from("cuentas").delete().eq("id", id);
  if (seleccionId === id) seleccionId = null;
  await cargarCuentas();
  marcarGuardando(false);
}

async function editarCampoCuenta(id, campo, valor) {
  marcarGuardando(true);
  await supa.from("cuentas").update({ [campo]: valor }).eq("id", id);
  const c = cuentas.find((c) => c.id === id);
  if (c) c[campo] = valor;
  marcarGuardando(false);
}

async function guardarPerfil(perfilId, datos) {
  marcarGuardando(true);
  const { error } = await supa.from("perfiles").update(datos).eq("id", perfilId);
  if (error) console.error(error);
  editandoPerfilId = null;
  await cargarCuentas();
  marcarGuardando(false);
}

function liberarPerfil(perfilId) {
  guardarPerfil(perfilId, { comprador: "", contacto: "", fecha_venta: null, duracion_dias: 30, precio: "" });
}

// ---------- Render ----------
function render() {
  renderResumen();
  renderListaCuentas();
  renderContenidoCuenta();
}

function renderResumen() {
  const resumen = {};
  cuentas.forEach((c) => c.perfiles.forEach((p) => {
    const e = estadoPerfil(p);
    resumen[e.key] = (resumen[e.key] || 0) + 1;
  }));
  $("#resumen").innerHTML = `
    <span class="chip" style="border-color:#4FAE6D55;color:#4FAE6D">${resumen.activo || 0} activos</span>
    <span class="chip" style="border-color:#E0A03055;color:#E0A030">${resumen.por_vencer || 0} por vencer</span>
    <span class="chip" style="border-color:#E0524F55;color:#E0524F">${resumen.vencido || 0} vencidos</span>
  `;
}

function renderListaCuentas() {
  const cont = $("#lista-cuentas");
  if (cuentas.length === 0) {
    cont.innerHTML = `<div class="vacio">Sin cuentas todavía. Pulsa + para agregar la primera.</div>`;
    return;
  }
  cont.innerHTML = cuentas.map((c) => {
    const vendidos = c.perfiles.filter((p) => p.comprador).length;
    const plat = PLATAFORMAS.find((p) => p.nombre === c.plataforma) || PLATAFORMAS[5];
    const activa = c.id === seleccionId;
    return `
      <div class="item-cuenta ${activa ? "activa" : ""}" data-id="${c.id}">
        <div class="item-cuenta-top">
          <span class="punto" style="background:${plat.color}"></span>
          <span class="item-cuenta-nombre">${escapeHtml(c.plataforma)}</span>
        </div>
        <div class="item-cuenta-sub">${escapeHtml(c.correo) || "sin correo"} · ${vendidos}/5 vendidos</div>
      </div>`;
  }).join("");
  cont.querySelectorAll(".item-cuenta").forEach((el) => {
    el.addEventListener("click", () => { seleccionId = el.dataset.id; editandoPerfilId = null; render(); });
  });
}

function renderContenidoCuenta() {
  const cont = $("#contenido-cuenta");
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
            ${PLATAFORMAS.map((p) => `<option value="${p.nombre}" ${p.nombre === cuenta.plataforma ? "selected" : ""}>${p.nombre}</option>`).join("")}
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

  const grid = $("#grid-perfiles");
  grid.innerHTML = cuenta.perfiles.map((p) => renderTarjetaPerfil(p)).join("");
  cablearTarjetasPerfil(cuenta);
}

function renderTarjetaPerfil(p) {
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
          <input class="f-contacto" placeholder="Contacto (WhatsApp, correo...)" value="${escapeAttr(p.contacto)}" />
          <div class="fila-fecha-dias">
            <div>
              <label>Fecha de venta</label>
              <input type="date" class="f-fecha" value="${p.fecha_venta ? p.fecha_venta.slice(0, 10) : new Date().toISOString().slice(0, 10)}" />
            </div>
            <div>
              <label>Días</label>
              <input type="number" min="1" step="1" class="f-dias" value="${p.duracion_dias || 30}" />
            </div>
          </div>
          <input class="f-precio" placeholder="Precio (ej. $3)" value="${escapeAttr(p.precio)}" />
          <div class="error-form"></div>
          <div class="acciones-form">
            <button class="btn btn-primario btn-guardar">Guardar</button>
            <button class="btn btn-fantasma btn-cancelar">Cancelar</button>
          </div>
        </div>
      </div>`;
  }

  return `
    <div class="tarjeta-perfil" data-perfil="${p.id}">
      <div class="tarjeta-perfil-top">
        <span>Perfil ${p.numero}</span>
        <span class="badge-estado" style="background:${est.bg};color:${est.color}">${est.label}</span>
      </div>
      ${p.comprador ? `
        <div class="info-perfil">
          <div><b>${escapeHtml(p.comprador)}</b></div>
          ${p.contacto ? `<div>${escapeHtml(p.contacto)}</div>` : ""}
          ${p.fecha_venta ? `<div>Vendido: ${formatoFecha(new Date(p.fecha_venta))}</div>` : ""}
          ${est.venc ? `<div>Vence: ${formatoFecha(est.venc)}</div>` : ""}
          ${p.precio ? `<div>Precio: ${escapeHtml(p.precio)}</div>` : ""}
        </div>` : `<div class="info-vacio">Sin vender todavía.</div>`}
      <div class="acciones-perfil">
        <button class="btn btn-editar">${p.comprador ? "Editar" : "Vender"}</button>
        ${p.comprador ? `<button class="btn btn-fantasma btn-liberar">Liberar</button>` : ""}
      </div>
    </div>`;
}

function cablearTarjetasPerfil(cuenta) {
  cuenta.perfiles.forEach((p) => {
    const tarjeta = document.querySelector(`[data-perfil="${p.id}"]`);
    if (!tarjeta) return;

    const btnEditar = tarjeta.querySelector(".btn-editar");
    if (btnEditar) btnEditar.addEventListener("click", () => { editandoPerfilId = p.id; render(); });

    const btnLiberar = tarjeta.querySelector(".btn-liberar");
    if (btnLiberar) btnLiberar.addEventListener("click", () => liberarPerfil(p.id));

    const btnCancelar = tarjeta.querySelector(".btn-cancelar");
    if (btnCancelar) btnCancelar.addEventListener("click", () => { editandoPerfilId = null; render(); });

    const btnGuardar = tarjeta.querySelector(".btn-guardar");
    if (btnGuardar) {
      btnGuardar.addEventListener("click", () => {
        const comprador = tarjeta.querySelector(".f-comprador").value.trim();
        const contacto = tarjeta.querySelector(".f-contacto").value.trim();
        const fecha = tarjeta.querySelector(".f-fecha").value;
        const dias = Number(tarjeta.querySelector(".f-dias").value);
        const precio = tarjeta.querySelector(".f-precio").value;
        const errorEl = tarjeta.querySelector(".error-form");

        if (!comprador) { errorEl.textContent = "Ingresa el nombre del comprador."; return; }
        if (!fecha) { errorEl.textContent = "Ingresa la fecha de venta."; return; }

        guardarPerfil(p.id, { comprador, contacto, fecha_venta: fecha, duracion_dias: dias, precio });
      });
    }
  });
}

$("#btn-nueva-cuenta").addEventListener("click", agregarCuenta);

function escapeHtml(str) {
  return (str || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function escapeAttr(str) { return escapeHtml(str); }
