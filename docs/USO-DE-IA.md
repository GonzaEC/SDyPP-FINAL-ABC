# Declaración de uso de herramientas de IA

Declaración solicitada por la cátedra de Sistemas Distribuidos y Programación Paralela
sobre el uso de herramientas de IA/LLM en el desarrollo de este trabajo final.

**Documento:** declaración honesta y de buena fe. Elaborada por el equipo y revisable
punto a punto.

---

## 1. Términos de uso

Se usaron herramientas de IA generativa (asistentes de código y de texto) como apoyo
durante el desarrollo. En todos los casos:

- La IA se usó como **asistente**, no como autor autónomo: cada pieza generada fue
  leída, revisada, corregida y validada por el equipo antes de integrarse.
- El **criterio de diseño, las decisiones de arquitectura y el testing finales son del
  equipo** (ver `app/docs/adr/` para las decisiones registradas).
- No se delegó la comprensión del problema: el código generado se entendió y se modificó
  antes de commitear.
- Ningún secreto, clave o credencial real se compartió con las herramientas (se trabajó
  con plantillas y valores falsos; `.gitignore` protege `*.pem`, `.env*`, etc.).

---

## 2. Herramientas usadas y para qué

| Herramienta | Tipo | Uso principal en este TP |
|-------------|------|--------------------------|
| Asistente de código / agente (CLI) | LLM | Generación y refactor de código (Python blockchain, Next.js/TS), escritura de manifiestos K8s/Terraform y workflows de CI/CD; revisión y debugging; esta declaración. |
| Auto-completado / IDE | LLM | Completado en línea y refactor menor dentro del editor. |
| Generación de imágenes / placeholders | — | Assets de la app cuando corresponda. *(Completar si aplica.)* |

---

## 3. Áreas donde la IA participó

- **Pilar 1 — benchmark CPU vs GPU**: asistencia en el script de medición y en el
  análisis de los resultados (hasta ~128× con prefijo de 6).
- **Pilar 2 — blockchain distribuida**: generación y revisión de `nct.py`, `trp.py`,
  `worker_cpu.py`, `worker.py`, `gpu-server.py` y `observability.py`; protocolo de minado,
  verificación de PoW, firma ECDSA y fallback GPU→CPU.
- **App web (Next.js/TS)**: lógica de tickets, pagos, ownership y materialización de
  operaciones de la blockchain.
- **Infraestructura**: manifiestos de Kubernetes, Terraform/OpenTofu sobre GCP,
  observabilidad (Prometheus, Grafana, Loki, Tempo, Alloy) y los 5 pipelines de CI/CD.
- **Documentación**: borradores de README, ADRs y este checklist, siempre revisados.

---

## 4. Cómo se controló la calidad del resultado

1. **Revisión humana** de todo código generado antes del commit (no se integró a ciegas).
2. **Ejecución local** del stack completo (`docker compose up --build`) para validar el
   comportamiento real (no solo compilación).
3. **Pruebas** end-to-end y manuales del flujo de minado y de transacciones.
4. **Pipeline de integración**: Gitleaks como gate, build y deploy automáticos por
   branches a `main`.

---

## 5. Aclaración sobre herramientas embebidas en el repo

En el repositorio hay archivos como `CLAUDE.md` / `AGENTS.md` que pueden sugerir
instrucciones a asistentes. *(Nota del equipo: verificar si están presentes y qué
contenido tienen antes de entregar; si no aplican, eliminar esta sección.)*

---

## 6. Compromiso

Reconocemos el uso de IA y su valor como herramienta, y declaramos que el producto final
es resultado de nuestro trabajo de integración, depuración y decisión. Se acuerda que la
IA **no** fue usada para: generar código que no se entendiera, simular pruebas, ni
reescribir afirmaciones técnicas que no se pudieran verificar.