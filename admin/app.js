"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&' + 'amp;',
  '<': '&' + 'lt;',
  '>': '&' + 'gt;',
  '"': '&' + 'quot;',
  "'": '&' + '#39;',
}[c]));

const pct = (v) => (v == null ? '—' : Math.round(v * 100) + '%');
const siNo = (b) => (b ? '<span class="pill ok">Sí</span>' : '<span class="pill no">No</span>');
const vacioNum = (v) => (v === '' || v == null ? null : Number(v));
const splitPipes = (v) => (v ? v.split('|').map((s) => s.trim()).filter(Boolean) : []);

const PLURAL = { poliza: 'polizas', catalogo: 'catalogo', prestador: 'prestadores' };
const TITULOS = { poliza: 'Nueva póliza', catalogo: 'Nuevo procedimiento', prestador: 'Nuevo prestador' };

const cache = { poliza: [], catalogo: [], prestador: [] };
const editando = { poliza: null, catalogo: null, prestador: null };

/* ── Pestañas ───────────────────────────────────────────────────── */
const PANES = ['aseguradora', 'revision', 'configuracion'];

function activarTab(nombre) {
  const b = document.querySelector(`.tab[data-tab="${nombre}"]`);
  if (!b) return;
  $$('.tab').forEach((t) => t.classList.remove('active'));
  b.classList.add('active');
  for (const p of PANES) $('#' + p).classList.toggle('hide', p !== nombre);
  if (nombre === 'revision') cargarEscalados();
  if (nombre === 'configuracion') cargarConfiguracion();
  if (location.hash !== '#' + nombre) history.replaceState(null, '', '#' + nombre);
}

$$('.tab').forEach((b) => (b.onclick = () => activarTab(b.dataset.tab)));

// Abrir la pestaña indicada en el hash (#aseguradora | #revision | #configuracion).
activarTab(PANES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'aseguradora');

/* ── Estado de edición ──────────────────────────────────────────── */
function setEdicion(entidad, id, label) {
  editando[entidad] = id;
  $('#hint-' + entidad).textContent = id ? 'Editando: ' + (label || id) : '';
  $('#sum-' + entidad).textContent = id ? 'Editar · ' + (label || id) : TITULOS[entidad];
  if (id) $('#det-' + entidad).open = true;
}

function poblar(form, data, checkboxes = []) {
  for (const el of form.elements) {
    if (!el.name || el.type === 'checkbox') continue;
    const v = data[el.name];
    if (Array.isArray(v)) el.value = v.join(' | ');
    else el.value = v == null ? '' : String(v);
  }
  for (const name of checkboxes) {
    const el = form.elements[name];
    if (el) el.checked = !!data[name];
  }
}

/* ── Carga ──────────────────────────────────────────────────────── */
async function cargarAseguradora() {
  try {
    const [metricas, polizas, catalogo, prestadores] = await Promise.all([
      fetch('/api/admin/metricas').then((r) => r.json()),
      fetch('/api/admin/polizas').then((r) => r.json()),
      fetch('/api/admin/catalogo').then((r) => r.json()),
      fetch('/api/admin/prestadores').then((r) => r.json()),
    ]);
    cache.poliza = polizas; cache.catalogo = catalogo; cache.prestador = prestadores;
    pintarMetricas(metricas);
    pintarPolizas(polizas);
    pintarCatalogo(catalogo);
    pintarPrestadores(prestadores);
  } catch (e) {
    console.error(e);
  }
}

function pintarMetricas(m) {
  if (!m) return;
  const filas = Object.entries(m.porDecision || {})
    .map(([k, v]) => `<span class="pill ${k === 'APROBADO' || k === 'APROBADO_CON_CONDICION' ? 'ok' : 'no'}">${esc(k)}: ${v}</span>`)
    .join(' ');
  $('#metricas').innerHTML = `<b>Total solicitudes:</b> ${m.total ?? 0}<br><br>${filas || '—'}`;
}

const ACCIONES = (id, ent) =>
  `<button class="btn-mini" data-act="edit" data-ent="${ent}" data-id="${esc(id)}">Editar</button>
   <button class="btn-mini danger" data-act="del" data-ent="${ent}" data-id="${esc(id)}">Eliminar</button>`;

function pintarPolizas(lista) {
  if (!lista?.length) { $('#polizas').innerHTML = '<div class="empty">Sin pólizas.</div>'; return; }
  $('#polizas').innerHTML = `<table><thead><tr><th>Cédula</th><th>Póliza No.</th><th>Paciente</th><th>Plan</th><th>Copago</th><th>Reembolso</th><th>Tope</th><th>Estado</th><th></th></tr></thead>
  <tbody>${lista.map((p) => `<tr>
    <td class="mono">${esc(p.cedula)}</td><td class="mono">${esc(p.polizaNo)}</td><td>${esc(p.paciente)}</td><td>${esc(p.plan)}</td>
    <td>${pct(p.copagoPct)}</td><td>${pct(p.reembolsoFueraRed)}</td><td class="mono">${p.topeAnual ?? '—'}</td>
    <td>${esc(p.estadoPago)}</td><td>${ACCIONES(p.id, 'poliza')}</td>
  </tr>`).join('')}</tbody></table>`;
}

function pintarCatalogo(lista) {
  if (!lista?.length) { $('#catalogo').innerHTML = '<div class="empty">Sin procedimientos.</div>'; return; }
  $('#catalogo').innerHTML = `<table><thead><tr><th>CPT</th><th>Nombre</th><th>Cubierto</th><th>Categoría</th><th>Carencia</th><th>Copago</th><th>Tope</th><th></th></tr></thead>
  <tbody>${lista.map((c) => `<tr>
    <td class="mono">${esc(c.codigoCpt)}</td><td>${esc(c.nombre)}</td><td>${siNo(c.cubierto)}</td>
    <td>${esc(c.categoria)}</td><td>${c.carenciaMeses ?? '—'}</td><td>${pct(c.copagoPct)}</td><td class="mono">${c.tope ?? '—'}</td>
    <td>${ACCIONES(c.id, 'catalogo')}</td>
  </tr>`).join('')}</tbody></table>`;
}

function pintarPrestadores(lista) {
  if (!lista?.length) { $('#prestadores').innerHTML = '<div class="empty">Sin prestadores.</div>'; return; }
  $('#prestadores').innerHTML = `<table><thead><tr><th>Nombre</th><th>Código</th><th>Red</th><th>Ciudad</th><th>Activo</th><th>Email</th><th></th></tr></thead>
  <tbody>${lista.map((c) => `<tr>
    <td>${esc(c.nombre)}</td><td class="mono">${esc(c.codigo)}</td><td>${esc((c.red || []).join(', '))}</td>
    <td>${esc(c.ciudad)}</td><td>${siNo(c.activo)}</td><td>${esc(c.email)}</td>
    <td>${ACCIONES(c.id, 'prestador')}</td>
  </tr>`).join('')}</tbody></table>`;
}

/* ── Editar / eliminar (delegación) ─────────────────────────────── */
const EDITORES = {
  poliza: (p) => { poblar($('#form-poliza'), p, []); setEdicion('poliza', p.id, p.paciente || p.cedula); },
  catalogo: (c) => { poblar($('#form-catalogo'), c, ['cubierto', 'requiereAuditoria']); setEdicion('catalogo', c.id, c.codigoCpt); },
  prestador: (c) => { poblar($('#form-prestador'), c, ['activo']); setEdicion('prestador', c.id, c.nombre); },
};

document.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  if (!btn) return;
  const ent = btn.dataset.ent;
  const id = btn.dataset.id;
  if (btn.dataset.act === 'edit') {
    const item = cache[ent].find((x) => x.id === id);
    if (item) EDITORES[ent](item);
  } else if (btn.dataset.act === 'del') {
    const item = cache[ent].find((x) => x.id === id);
    if (confirm(`¿Archivar "${(item && (item.paciente || item.nombre || item.codigoCpt)) || id}"?`)) {
      fetch(`/api/admin/${PLURAL[ent]}/${id}`, { method: 'DELETE' }).then(cargarAseguradora);
    }
  }
});

/* ── Guardar formularios ────────────────────────────────────────── */
function serPoliza(form) {
  const f = new FormData(form);
  const d = Object.fromEntries(f.entries());
  d.copagoPct = vacioNum(d.copagoPct);
  d.reembolsoFueraRed = vacioNum(d.reembolsoFueraRed);
  d.topeAnual = vacioNum(d.topeAnual);
  d.topeConsumido = vacioNum(d.topeConsumido);
  d.redHospitalaria = splitPipes(d.redHospitalaria);
  d.exclusionesPlan = splitPipes(d.exclusionesPlan);
  return d;
}

function serCatalogo(form) {
  const f = new FormData(form);
  const d = Object.fromEntries(f.entries());
  d.cubierto = f.get('cubierto') === 'on';
  d.requiereAuditoria = f.get('requiereAuditoria') === 'on';
  d.carenciaMeses = vacioNum(d.carenciaMeses);
  d.copagoPct = vacioNum(d.copagoPct);
  d.tope = vacioNum(d.tope);
  d.docsRequeridos = splitPipes(d.docsRequeridos);
  return d;
}

function serPrestador(form) {
  const f = new FormData(form);
  const d = Object.fromEntries(f.entries());
  d.activo = f.get('activo') === 'on';
  d.red = splitPipes(d.red);
  return d;
}

async function guardar(ent, form, serializar) {
  const d = serializar(form);
  const r = await fetch(`/api/admin/${PLURAL[ent]}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(d),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    alert('Error al guardar: ' + (j.error || r.status));
    return;
  }
  form.reset();
  setEdicion(ent, null);
  cargarAseguradora();
}

/* ── Configuración del agente ───────────────────────────────────── */
  async function cargarConfiguracion() {
    try {
      const j = await fetch('/api/admin/configuracion').then((r) => r.json());
      const form = $('#form-configuracion');
      form.innerHTML = '';
      const escalares = j.escalares || {};
      for (const it of j.esquema || []) {
        const v = escalares[it.clave] ?? it.def;
        const lab = document.createElement('label');
        lab.className = 'cfg';
        const esNumero = it.tipo !== 'texto';
        lab.innerHTML = `<span>${esc(it.etiqueta)}</span><input name="${esc(it.clave)}" type="${esNumero ? 'number' : 'text'}"` +
          (it.min != null ? ` min="${it.min}"` : '') +
          (it.max != null ? ` max="${it.max}"` : '') +
          (it.paso ? ` step="${it.paso}"` : '') +
          ` value="${esc(v)}">`;
        form.appendChild(lab);
      }
      const labP = document.createElement('label');
      labP.className = 'cfg wide';
      labP.innerHTML = `<span>Prompt del sistema</span><textarea name="promptSistema" rows="14"></textarea>`;
      form.appendChild(labP);
      form.elements.promptSistema.value = j.prompt || '';
    } catch (e) {
      console.error(e);
    }
  }
  
  $('#guardar-config').onclick = async () => {
    const form = $('#form-configuracion');
    const d = {};
    for (const el of form.elements) {
      if (el.name) d[el.name] = el.value;
    }
    const r = await fetch('/api/admin/configuracion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d),
    });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      alert('Error al guardar: ' + (j.error || r.status));
      return;
    }
    $('#hint-config').textContent = 'Guardado ✓';
    setTimeout(() => { $('#hint-config').textContent = ''; }, 2500);
  };
  
  $('#reset-config').onclick = async () => {
    if (!confirm('¿Restablecer todos los valores y el prompt a los valores por defecto?')) return;
    const r = await fetch('/api/admin/configuracion/reset', { method: 'POST' });
    if (r.ok) {
      $('#hint-config').textContent = 'Restablecido ✓';
      cargarConfiguracion();
      setTimeout(() => { $('#hint-config').textContent = ''; }, 2500);
    }
  };

$('#form-poliza').onsubmit = (ev) => { ev.preventDefault(); guardar('poliza', $('#form-poliza'), serPoliza); };
$('#form-catalogo').onsubmit = (ev) => { ev.preventDefault(); guardar('catalogo', $('#form-catalogo'), serCatalogo); };
$('#form-prestador').onsubmit = (ev) => { ev.preventDefault(); guardar('prestador', $('#form-prestador'), serPrestador); };

$$('button[data-cancel]').forEach((b) =>
  b.onclick = () => {
    const ent = b.dataset.cancel;
    $('#form-' + ent).reset();
    setEdicion(ent, null);
    $('#det-' + ent).open = false;
  }
);

/* ── Revisión ───────────────────────────────────────────────────── */
async function cargarEscalados() {
  try {
    const lista = await fetch('/api/revision/escalados').then((r) => r.json());
    if (!lista?.length) { $('#escalados').innerHTML = '<div class="empty">No hay casos escalados.</div>'; return; }
    $('#escalados').innerHTML = `<table><thead><tr><th>ID Solicitud</th><th>Paciente</th><th>Motivo</th><th>Estado</th><th></th></tr></thead>
    <tbody>${lista.map((e) => `<tr data-id="${esc(e.id)}">
      <td class="mono">${esc(e.idSolicitud)}</td><td>${esc(e.paciente)}</td><td>${esc(e.motivo)}</td><td>${esc(e.estado)}</td>
      <td><button class="btn-resolver">Resolver</button></td>
    </tr>`).join('')}</tbody></table>`;
    $$('#escalados tr[data-id]').forEach((tr) =>
      tr.querySelector('button').onclick = async () => {
        const nota = prompt('Nota de resolución:');
        if (nota === null) return;
        await fetch(`/api/revision/${tr.dataset.id}/resolver`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ nota }),
        });
        cargarEscalados();
      }
    );
  } catch (e) {
    console.error(e);
  }
}

cargarAseguradora();
