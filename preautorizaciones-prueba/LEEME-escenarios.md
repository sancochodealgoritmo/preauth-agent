# Preautorizaciones de prueba · PreAuth Agent

Cada carpeta es un envío del hospital: 01 = formulario PREAUTH-GEN-1.0 lleno (es la solicitud y cuenta como informe médico firmado); 02–07 = informes médicos y estudios adjuntos que el formulario declara. Las pólizas están en Notion (PreAuth · Pólizas) con el resultado esperado en "Notas demo". Datos 100 % sintéticos.

| ID | Paciente | Plan | CPT | Prestador | Esperado | Regla | Qué prueba | Archivos |
|---|---|---|---|---|---|---|---|---|
| INF-2026-0001 | María Pérez Núñez | Integral | 47562 | Hospital Punta Pacífica | APROBADO | R12 | Caso base: todo en regla | 01, 02, 03, 05 |
| INF-2026-0002 | Carlos Mendoza Ríos | Integral | 49505 | Hospital Nacional | RECHAZADO | R10 | Carencia no cumplida (3 de 12 meses) | 01, 02, 03, 05 |
| INF-2026-0003 | Ana Lucía Torres | Esencial | 66984 | Hospital Punta Pacífica | RECHAZADO | R5 | Hospital fuera de red y plan Esencial sin reembolso (0 %) | 01, 02, 03 |
| INF-2026-0004 | Roberto Castillo Vega | Corporativo | 29881 | Hospital Paitilla | RECHAZADO | R4 | Póliza en mora | 01, 02, 03, 05 |
| INF-2026-0005 | Gabriela Ríos Castro | Premium | 58558 | Hospital Paitilla | RECHAZADO | R3 | Póliza vencida (vigencia hasta 31/08/2026) | 01, 02, 03 |
| INF-2026-0006 | Luis Herrera Pinzón | Integral | 27447 | Clínica Hospital San Fernando | RECHAZADO | R9 | Preexistencia declarada (M17.1) | 01, 02, 03, 04, 05, 06 |
| INF-2026-0007 | Patricia Vega Solís | Premium | 29881 | Hospital Punta Pacífica | RECHAZADO | R9 | Preexistencia no declarada: primera evaluación antes de la fecha de inicio | 01, 02, 03, 05 |
| INF-2026-0008 | Daniela Morales Arias | Premium | 30400 | Hospital Paitilla | RECHAZADO | R7 | Procedimiento estético excluido | 01, 02 |
| INF-2026-0009 | Jorge Batista Lee | Corporativo | (vacío) | Hospital Paitilla | ESCALADO_HUMANO | R6 | CPT vacío y descripción ambigua entre 47562 y 47563 | 01, 02, 03, 04, 05 |
| INF-2026-0010 | Sofía Chen Wong | Integral | 58558 | Clínica Hospital San Fernando | DOCUMENTOS_FALTANTES | R0 | Formulario sin sello del médico | 01, 02, 03 |
| INF-2026-0011 | Miguel Ángel Sánchez | Integral | 29881 | Hospital Nacional | APROBADO | R12 | Accidente: la carencia no aplica (2 de 12 meses) | 01, 02, 03, 05, 07 |
| INF-2026-0012 | Karla Jiménez Ortega | Esencial | 59510 | Centro Médico Paraíso | RECHAZADO | R7 | Maternidad excluida en plan Esencial | 01, 02, 04, 05 |
| INF-2026-0013 | Fernando Ruiz Batista | Esencial | 60240 | Hospital Nacional | APROBADO_CON_CONDICION | R12 | Monto supera el tope anual disponible (queda $2,500) | 01, 02, 03, 04, 05 |
| INF-2026-0014 | Elena Pardo Méndez | Premium | 27447 | Hospital Paitilla | SEGUNDA_OPINION | R11 | Artroplastia sin segunda opinión médica adjunta | 01, 02, 03, 04, 05 |
| INF-2026-0015 | Tomás Quintero Paz | Corporativo | 44970 | Hospital Nacional | DOCUMENTOS_FALTANTES | R0 | URGENTE sin reporte del cuarto de urgencia | 01, 02, 03, 04 |
| INF-2026-0016 | Ricardo Almengor Díaz | Corporativo | 52353 | Clínica Demo del Oeste | ESCALADO_HUMANO | R5 | Prestador no reconocido (no está en ninguna red) | 01, 02, 03, 04 |
| INF-2026-0017 | Valeria Samudio Rojas | Integral | 58558 | Hospital Chiriquí | APROBADO_CON_CONDICION | R12 | Fuera de red con reembolso: Integral 60 % sobre U&R ($2,500) = $1,500 | 01, 02, 03 |

Archivos: 01 formulario · 02 informe médico · 03 imagen · 04 laboratorio · 05 preanestésica · 06 segunda opinión · 07 reporte de urgencias.
