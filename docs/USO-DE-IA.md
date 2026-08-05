# Declaración de uso de herramientas de IA



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

**No se usaron generadores de imágenes.** Los únicos assets gráficos versionados son los
SVG que vienen por defecto con `create-next-app` (`public/{file,globe,next,vercel,window}.svg`),
los íconos propios de la app y los cuatro gráficos de `Pilar2/P5/resultados/graficos/`, que
produce `graficos.py` con matplotlib a partir de los CSV de las pruebas de carga. Las
imágenes de los eventos las suben los usuarios a Cloudinary.

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

El proyecto usa dos archivos de contexto para desarrollo asistido, ambos en `app/`:

| Archivo | Contenido |
|---|---|
| `app/CLAUDE.md` | Decisiones de arquitectura que se asumen en todo el código de la app: el modelo de identidad ECDSA, la custodia de la clave privada, el formato canónico de firma, y las convenciones de Next.js 16 y Prisma 7 del proyecto. |
| `app/AGENTS.md` | Una advertencia sobre la versión de Next.js usada, para que el asistente consulte la documentación de la versión instalada en vez de asumir APIs viejas. |

**Los dos están en `.gitignore`, así que no forman parte del repositorio entregado.** Son
archivos de trabajo local: sirven para que el asistente arranque con el contexto correcto y
no proponga soluciones incompatibles con las decisiones ya tomadas (las mismas que están
documentadas, esas sí versionadas, en `app/docs/adr/`).


---

## 6. Compromiso

Reconocemos el uso de IA y su valor como herramienta, y declaramos que el producto final
es resultado de nuestro trabajo de integración, depuración y decisión. Se acuerda que la
IA **no** fue usada para: generar código que no se entendiera, simular pruebas, ni
reescribir afirmaciones técnicas que no se pudieran verificar.