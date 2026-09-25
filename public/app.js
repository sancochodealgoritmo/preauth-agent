"use strict";

/* ════════════════════════════════════════════════════════════════════
   PANEL HOSPITAL · CONECTADO AL BACKEND
   El agente procesa automáticamente por cron; este panel envía el
   formulario y muestra los casos procesados (detalle al hacer clic).
   ════════════════════════════════════════════════════════════════════ */

const $ = (s) => document.querySelector(s);
const escapar = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({
  '&': '&' + 'amp;',
  '<': '&' + 'lt;',
  '>': '&' + 'gt;',
  '"': '&' + 'quot;',
  "'": '&' + '#39;',
}[c]));
const fmt = (n) => n == null ? '—'
  : n.toLocaleString('es-PA', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/* ── Cargar casos desde Notion ─────────────────────────────────── */
async function cargarCasos() {
  try {
    const res = await fetch('/api/casos');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    pintarTabla(data);
  } catch (e) {
    console.error('Error cargando casos:', e);
  }
}

/* ── Renderizado de paneles de detalle ─────────────────────────── */
function pintarExtraccion(campos) {
  if (!campos) return;
  $('#fields').innerHTML = Object.entries(campos).map(([k, v]) => `
    <div class="field">
      <div class="n">${k.replace(/_/g, ' ')}</div>
      <div class="v">${v.valor === null ? '— ausente' : escapar(v.valor)}</div>
      ${v.fuente ? `<div class="src">"${escapar(v.fuente)}"</div>` : ''}
    </div>`).join('');
}

function pintarInterpretacion(i) {
  if (!i) return;
  const conf = (i.confianza ?? 0).toFixed(2);
  $('#interp').innerHTML = `
    <div class="field"><div class="n">CPT resuelto</div>
      <div class="v">${i.cpt_resuelto ?? '— no identificado'}</div>
      <div class="src">${escapar(i.razon_match || '')}</div></div>
    <div class="field"><div class="n">Confianza</div>
      <div class="v">${conf}${i.alternativas?.length ? ` · alternativas: ${i.alternativas.join(', ')}` : ''}</div>
      <div class="src">Umbral configurado: 0.80</div></div>
    <div class="field"><div class="n">Coherencia diagnóstico ↔ procedimiento</div>
      <div class="v">${i.coherencia_dx_proc ? 'Sí' : 'No'}</div>
      <div class="src">${escapar(i.razon_coherencia || '')}</div></div>
    <div class="field"><div class="n">Justificación suficiente</div>
      <div class="v">${i.justificacion_suficiente ? 'Sí' : 'No'}</div>
      <div class="src">${escapar(i.razon_justificacion || '')}</div></div>`;
}

function pintarReglas(trazas) {
  $('#rules').innerHTML = trazas.map((t) => `
    <div class="rule ${t.ok ? 'ok' : 'no'}">
      <span class="s">${t.ok ? '✓' : '✗'}</span>
      <span><b>${escapar(t.paso)}</b><div class="d">${escapar(t.detalle)}</div></span>
    </div>`).join('');
}

function pintarResultado(r) {
  let extra = '';
  if (r.decision === 'APROBADO' || r.decision === 'APROBADO_CON_CONDICION') extra = `
    <dl class="kv">
      <dt>Código de autorización</dt><dd>${escapar(r.codigo_autorizacion || '—')}</dd>
      <dt>Modalidad</dt><dd>${escapar(r.modalidad || '—')}</dd>
      <dt>Monto aprobado</dt><dd>${fmt(r.monto_aprobado)}</dd>
      <dt>Copago del paciente</dt><dd>${r.copago_pct != null ? Math.round(r.copago_pct * 100) + '%' : '—'}</dd>
      <dt>Reembolso</dt><dd>${r.reembolso_pct != null ? Math.round(r.reembolso_pct * 100) + '%' : '—'}</dd>
      <dt>Tope autorizado</dt><dd>${fmt(r.tope_autorizado)}</dd>
      <dt>Vigencia</dt><dd>${escapar(r.vigencia_autorizacion || '—')}</dd>
    </dl>`;
  if (r.documentos_faltantes?.length) extra =
    `<ul class="faltan">${r.documentos_faltantes.map((x) => `<li>${escapar(x)}</li>`).join('')}</ul>`;

  $('#verdict').innerHTML = `
    <div class="verdict ${r.decision}">
      <div class="v">${r.decision.replace(/_/g, ' ')}</div>
      <div class="m">${escapar(r.motivo || '')}</div>
      ${r.clausula_citada ? `<div class="cl">${escapar(r.clausula_citada)}</div>` : ''}
      ${extra}
    </div>
    <div class="panel"><h3>Mensaje al paciente</h3>
      <div class="body">${escapar(r.mensaje_paciente || '')}</div></div>
    <div class="panel" style="margin-top:12px"><h3>Mensaje a admisiones</h3>
      <div class="body">${escapar(r.mensaje_hospital || '')}</div></div>`;
  $('#resCard').classList.remove('hide');
}

function pintarTabla(data) {
  if (!data?.length) {
    $('#tabla').innerHTML = '<div class="empty">Todavía no hay casos procesados.</div>';
    const cola = $('#estado-cola');
    if (cola) cola.innerHTML = '';
    return;
  }
  const enCola = data.filter((d) => d.estado === 'Pendiente').length;
  const cola = $('#estado-cola');
  if (cola) cola.innerHTML = enCola ? `El agente está trabajando… ${enCola} en cola` : '';
  $('#tabla').innerHTML = `<div class="tablewrap"><table>
    <thead><tr><th>Caso</th><th>Afiliado</th><th>Decisión</th><th>Modalidad</th><th>Modelo</th><th>Tiempo</th><th></th></tr></thead>
    <tbody>${data.map((d) => `<tr data-id="${d.id}">
      <td style="font-family:var(--mono);font-size:12px">${escapar(d.idSolicitud || '—')}</td>
      <td>${escapar(d.paciente || '—')}</td>
      <td>${d.estado === 'Pendiente' ? '<span class="pill cola">En cola…</span>' : `<span class="pill ${d.decision || 'PENDIENTE'}">${(d.decision || 'PENDIENTE').replace(/_/g, ' ')}</span>`}</td>
      <td>${escapar(d.modalidad || '—')}</td>
      <td>${d.modelo ? `<span class="model-badge ${d.modelo}">${escapar(d.modelo)}</span>` : '—'}</td>
      <td style="font-family:var(--mono)">${d.latencia_ms ? (d.latencia_ms / 1000).toFixed(2) + ' s' : (d.timestamp ? new Date(d.timestamp).toLocaleTimeString() : '—')}</td>
      <td>${d.decision === 'DOCUMENTOS_FALTANTES' ? `<button class="btn-ghost btn-reenviar" data-id="${d.id}" style="width:auto;padding:4px 8px">Reenviar</button>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>`;

  document.querySelectorAll('#tabla tr[data-id]').forEach((tr) => {
    tr.onclick = async () => {
      try {
        const res = await fetch(`/api/casos/${tr.dataset.id}`);
        const detalle = await res.json();
        pintarResultado(detalle);
        pintarExtraccion(detalle.extraccion || {});
        pintarInterpretacion(detalle.interpretacion || {});
        pintarReglas(detalle.trazas || []);
        $('#docText').textContent = detalle.texto_informe || '(sin texto)';
        $('#traceCard').classList.remove('hide');
        $('#resCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        console.error(e);
      }
    };
    const btn = tr.querySelector('.btn-reenviar');
    if (btn) btn.onclick = async (ev) => {
      ev.stopPropagation();
      await reenviar(btn.dataset.id);
    };
  });
}

function reenviar(id) {
  const input = $('#reenviarFiles');
  input.dataset.id = id;
  input.value = '';
  input.click();
}

$('#reenviarFiles').addEventListener('change', async (ev) => {
  const id = ev.target.dataset.id;
  if (!id || !ev.target.files.length) return;
  const fd = new FormData();
  for (const f of ev.target.files) fd.append('adjuntos', f);
  const r = await fetch(`/api/solicitudes/${id}/reenviar`, { method: 'POST', body: fd });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    alert('Error al reenviar: ' + (j.error || r.status));
    return;
  }
  alert('Documentos adjuntados y solicitud reenviada para reprocesamiento.');
  cargarCasos();
});

/* ── Enviar formulario ─────────────────────────────────────────── */
async function enviarFormulario() {
  const frm = $('#frm').files[0];
  if (!frm) { alert('Selecciona el formulario PDF'); return; }
  const fd = new FormData();
  fd.append('formulario', frm);
  for (const f of $('#adj').files) fd.append('adjuntos', f);
  $('#enviar').disabled = true;
  try {
    const r = await fetch('/api/solicitudes', { method: 'POST', body: fd });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'HTTP ' + r.status);
    alert('Solicitud recibida: ' + j.idSolicitud + ' — el agente la procesará automáticamente.');
    $('#frm').value = ''; $('#adj').value = '';
    cargarCasos();
  } catch (e) {
    alert('Error al enviar: ' + e.message);
  }
  $('#enviar').disabled = false;
}

/* ── Arranque ─────────────────────────────────────────────────── */
$('#enviar').onclick = enviarFormulario;
$('#refresh-list').onclick = cargarCasos;

cargarCasos();
setInterval(cargarCasos, 15000); // refresca la tabla cada 15s
