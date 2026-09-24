# PreAuth Agent

Agente de pre-autorización quirúrgica en tiempo real. Ingiere el formulario
**PREAUTH-GEN-1.0** (PDF), extrae y verifica los datos, interpreta el caso con
**DeepSeek**, aplica reglas deterministas (**R0–R12**) y emite una decisión
auditada.

Demo de "producción":

- Landing: <https://sancochodev.com/>
- App: <https://preauth.sancochodev.com/>

## Roles

| Rol | Acceso | Qué hace |
|---|---|---|
| Hospital | `/` | Envía el formulario + adjuntos y consulta los casos procesados |
| Aseguradora | `/admin` → pestaña Aseguradora | Métricas y CRUD de pólizas, catálogo y prestadores |
| Revisor | `/admin` → pestaña Revisión | Cola de escalados y resolución con nota de auditoría |
| Configuración | `/admin` → pestaña Configuración | Parámetros del agente en caliente + prompt |

## Stack

- Node.js 20 LTS, ESM (`"type": "module"`)
- Express 4
- Notion API (`@notionhq/client` v2) — 5 bases: Pólizas, Catálogo, Preautorizaciones, Prestadores, Configuración
- DeepSeek (`deepseek-reasoner` R1 con fallback a `deepseek-chat` V3)
- `pdf-lib`, `pdfjs-dist` y `@napi-rs/canvas` para la Fase 0 (AcroForm + detección de firma/sello por tinta)
- `multer` (multipart), `node-cron`, SSE nativo
- Deploy: VPS Ubuntu 24.04 + PM2 + Nginx

## Estructura

```
src/
  index.js               # Servidor HTTP, endpoints, SSE, cron
  config.js              # Configuración desde .env
  config/ajustes.js      # Configuración en caliente desde Notion
  ingest/extractor.js    # Fase 0: extracción del PDF (texto, radios, checkboxes, tinta)
  agent/                 # Prompts, DeepSeek, motor de decisión, traza SSE
  rules/                 # Pre-check R0 y reglas R1–R12
  notion/                # Cliente, caché, lectores, escritores, dashboard
  templates/             # Ensamblado de mensajes
  utils/                 # Logger, normalizador, rate limiter
public/                  # Panel del hospital
admin/                   # Panel interno (aseguradora, revisión, configuración)
landing/                 # Página de inicio (sancochodev.com)
scripts/                 # Utilidades (manuales, reinicio, lote)
docs/manuales/           # Manuales PDF (excluidos de git)
```

## Motor de decisión

- **Fase 0** — Extracción determinista del PDF (sin IA).
- **Fase 1** — Pre-check `R0` (documentos faltantes, sello, urgencia).
- **Fase 2** — Interpretación clínica con DeepSeek (una sola llamada; fallback R1→V3).
- **Fase 3** — Reglas `R1–R12` (la fuente de verdad de la decisión).
- **Fase 4** — Ensamblado de mensajes con cláusula contractual verbatim.
- **Fase 5** — Persistencia en Notion.

Decisiones: `APROBADO`, `APROBADO_CON_CONDICION`, `SEGUNDA_OPINION`,
`DOCUMENTOS_FALTANTES`, `RECHAZADO`, `ESCALADO_HUMANO`.

El cron (cada 30 s) procesa automáticamente las solicitudes `Pendiente`.

## Configuración

1. `cp .env.example .env` y completar las credenciales.
2. `npm install`
3. `npm start` (escucha en `127.0.0.1:3000`).

Variables de entorno (ver `.env.example`):

```
PORT, NODE_ENV
NOTION_TOKEN
NOTION_DB_POLIZAS, NOTION_DB_CATALOGO, NOTION_DB_SOLICITUDES,
NOTION_DB_PRESTADORES, NOTION_DB_CONFIGURACION
DEEPSEEK_API_KEY, DEEPSEEK_BASE_URL
WEBHOOK_SECRET
```

## Scripts

- `npm start` — producción
- `npm run dev` — modo watch
- `npm run bench` — latencia R1 vs V3
- `node scripts/generarManuales.js` — genera los 3 manuales PDF en `docs/manuales/`
- `node scripts/reiniciarCasos.js` — archiva todas las preautorizaciones (sistema en 0)
- `node scripts/procesarLote.js --reset` — reenvía los 17 escenarios de prueba

## API

| Método | Ruta | Función |
|---|---|---|
| GET | `/health` | Estado |
| POST | `/api/solicitudes` | Ingesta del formulario (multipart) |
| GET | `/api/casos` | Solicitudes recientes |
| GET | `/api/casos/:pageId` | Detalle de una solicitud |
| GET/POST/DELETE | `/api/admin/polizas` | CRUD de pólizas |
| GET/POST/DELETE | `/api/admin/catalogo` | CRUD del catálogo |
| GET/POST/DELETE | `/api/admin/prestadores` | CRUD de prestadores |
| GET | `/api/admin/metricas` | Métricas por decisión |
| GET/POST | `/api/admin/configuracion` | Configuración del agente |
| POST | `/api/admin/configuracion/reset` | Restablecer configuración |
| GET | `/api/revision/escalados` | Cola de escalados |
| POST | `/api/revision/:pageId/resolver` | Resolver un escalado |
| POST | `/webhook/notion` | Webhook (opcional) |

## Licencia

[MIT](LICENSE)
