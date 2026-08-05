# Checklist de entrega — estado del proyecto

Auditoría del repositorio contra `2026_SDYPP_checklist-blockchain-v2.docx` (checklist de
blockchain de la cátedra).

**Última actualización:** 2026-08-04

| Símbolo | Significado |
|---|---|
| ✅ | Hecho y verificable en el repo |
| 🟡 | Parcial — existe el mecanismo, falta cobertura o documentación |
| ❌ | Falta |
| ➖ | No aplica a esta arquitectura |

> **Condicionante importante:** la cuenta de GCP fue eliminada, así que no hay cluster.
> Todo lo que requiere Kubernetes vivo se puede **escribir** pero no **verificar** hasta
> reprovisionar. Eso está reflejado en el orden del plan de implementación al final.

---

## Resumen

| Sección | ✅ | 🟡 | ❌ | Estado |
|---|---|---|---|---|
| 1. Funciones de blockchain | 15 | 0 | 1 | Sólido: manejo de fallas probado; falta el modo competitivo |
| 2. Plataforma escalable en K8s | 9 | 0 | 0 | Completo |
| 3. Ambiente productivo real | 10 | 2 | 0 | Completo: StatefulSets migrados |
| 4. Pruebas del sistema | 4 | 3 | 0 | Cubierta: 36 unit tests + matriz de carga corrida |
| 5. Pipelines | 5 | 0 | 0 | Completo (1 ítem N/A) — filtro de Pipeline 4 arreglado |
| 6. Repositorio y entrega | 5 | 0 | 1 | Falta solo el video |
| 7. Informe | 6 | 0 | 0 | Completa — `docs/INFORME.md` |
| **Total** | **54** | **5** | **2** | |

Quedan **2 faltantes**: el modo competitivo del pool (§1) y el video explicativo (§6).
Los dos se pueden escribir sin nube; solo su verificación necesita cluster.

---

## 1. Funciones de blockchain requeridas

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Nodos con clave pública y privada | ✅ | ECDSA P-256, `app/src/lib/crypto/`, verificación de firma en `Pilar2/P5/nct.py` |
| Pool de minado — modo **cooperativo** | ✅ | TrP subdivide en chunks de 2.5M nonces (`Pilar2/P5/trp.py`) |
| Pool de minado — modo **competitivo** | ❌ | No implementado ni documentado. Hoy solo hay reparto de rangos disjuntos |
| Condiciones de validación del ganador | ✅ | El NCT recalcula MD5 y verifica la dificultad antes de aceptar la solución |
| Worker CPU en funcionamiento | ✅ | `Pilar2/P5/worker_cpu.py` |
| Worker GPU en funcionamiento | ✅ | `worker.py` + `gpu-server.py` + `brute_force_range.cu` |
| Protocolo: competencia y/o coordinación | ✅ | `Pilar2/P5/README.md` ahora documenta el eje cooperativo (reparto de rangos disjuntos) vs competitivo y por qué se eligió el primero |
| Detalle de arquitectura CUDA / versiones | ✅ | `Dockerfile.worker` compila `sm61`, `sm86` y `sm89`; Pilar 1 documenta el entorno (Colab T4) |
| Manejo de fallas en workers | ✅ | `basic_nack(requeue=True)` en el worker CPU + `MINING_TIMEOUT_SECONDS` en el NCT. Documentado y **probado 2026-08-05**: kill del worker a mitad del minado → RabbitMQ requeueó los 4 chunks (`redeliver` 0→4) → worker reiniciado re-minó los mismos rangos → 10/10 ops CONFIRMED (ver `Pilar2/P5/README.md` "Prueba realizada") |
| Keep-alive de mineros GPU hacia el pool | ✅ | Cola `heartbeat_gpu` → `heartbeat:gpu-server` con TTL en Redis |
| Fallback ante ausencia de GPUs | ✅ | `activate_fallback()`: baja dificultad a `"0"` y escala worker-cpu vía API de K8s |

### Métricas por tipo de recurso

| Métrica pedida | Estado | Detalle |
|---|---|---|
| Tasa de éxito CPU vs GPU | ✅ | Derivable: `worker_solutions_found_total{worker_type}` / `worker_tasks_processed_total` |
| Hashes por segundo (por nodo) | ✅ | `worker_hashes_total{worker_type}`; la tasa sale con `rate(...[5m])` en Grafana |
| Tiempos de minería por prefijo | ✅ | `nct_block_mining_seconds{difficulty}` — ahora con label de dificultad |
| Latencia entre RabbitMQ y worker | ✅ | `worker_task_queue_latency_seconds`, con el `_published_at` que inyecta el TrP al publicar |
| Tiempo de validación del bloque | ✅ | `nct_block_validation_seconds{difficulty}` |

**Métricas que existen hoy:** `nct_blocks_total`, `nct_block_mining_seconds{difficulty}`,
`nct_block_validation_seconds{difficulty}`, `nct_mining_timeouts_total`,
`nct_solutions_rejected_total`, `nct_transactions_received_total`,
`trp_chunks_published_total`, `trp_tasks_subdivided_total`, `trp_cpu_scale_events_total`,
`trp_gpu_alive`, `trp_fallback_active`, `worker_tasks_processed_total`,
`worker_solutions_found_total`, `worker_hashes_total`, `worker_task_duration_seconds`,
`worker_task_queue_latency_seconds`, `gpu_mine_requests_total`,
`gpu_mine_duration_seconds`, `gpu_solutions_found_total`.

> Las 4 métricas nuevas se agregaron en el Bloque 1 y se verificaron con un mint real
> (2026-08-04): `nct_block_mining_seconds{difficulty="0"}` y `nct_block_validation_seconds{difficulty="0"}`
> registraron 1 observación; `worker_hashes_total{cpu}=58` y
> `worker_task_queue_latency_seconds` con 4 muestras.

---

## 2. Configuración de plataforma escalable

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Base de datos | ✅ | `k8s/gke/apps/postgres-statefulset.yaml` + `volumeClaimTemplates` |
| Sistema de colas | ✅ | `k8s/gke/infra/rabbitmq-*.yaml` |
| Secretos | ✅ | `app-secrets`, plantilla en `secret.example.yaml.tpl`, valores fuera del repo |
| ConfigMaps | ✅ | `k8s/gke/apps/configmap.yaml` |
| Certificados (HTTPS) | ✅ | GKE Managed Certificate para `tesera.tech` |
| Plataforma de logging (N servicios, M réplicas) | ✅ | Alloy como DaemonSet → Loki |
| Monitoreo (alertas, dashboards) | ✅ | Prometheus + Grafana + `alerts.yaml` |
| **Sincronización de relojes con NTP** | ✅ | Nodos GKE (COS) sincronizan por `systemd-timesyncd` contra el NTP de Google. Monitoreo de drift vía `node_timex_offset_seconds` (collector `timex` de node-exporter). Documentado en `k8s/gke/observability/README.md` |
| Endpoint público de estado por servicio | ✅ | La app expone `/api/status` (Ingress de `tesera.tech`) con un JSON agregado: `frontend`, `nct` (via `/status` del NCT), `postgres`, `redis` y `rabbitmq` (`app/src/app/api/status/route.ts`) |

---

## 3. Configuraciones para ambiente productivo real

Era la sección más débil. Con el Cluster Autoscaler, los HPA, el `securityContext` y la
migración de Postgres, Redis y RabbitMQ a `StatefulSet` (todo el 2026-08-04), la sección
quedó sin faltantes.

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Autoscaler por uso de CPU (Cluster Autoscaler / Karpenter) | ✅ | `infra/gke.tf`: bloque `autoscaling` en los pools `apps` (2-5) e `infra` (1-2). `monitoring` queda fijo a propósito |
| HPA por métricas comunes o específicas | ✅ | `k8s/gke/apps/hpa.yaml`: frontend (2-6) y NCT (2-4) por CPU al 70%. worker-cpu queda fuera a propósito: su ciclo de vida lo maneja el TrP |
| Servicios como StatefulSet para escalar con PVC | ✅ | Postgres, Redis y RabbitMQ migrados a `StatefulSet` con `volumeClaimTemplates`; se borraron los PVC estáticos |
| Limitación de recursos | ✅ | Los 7 workloads tienen `resources:` |
| `securityContext` (no root, mínimo necesario) | ✅ | Los 7 workloads con `runAsNonRoot`, uid explícito, `seccompProfile` y `drop: [ALL]`. Pendiente menor: alertmanager, grafana y los 3 exporters de observabilidad |
| tolerations / affinity / nodeSelector | 🟡 | `nodeSelector` en los 7 workloads (separa `pool=infra` de `pool=apps`), pero `tolerations`/`affinity` solo en observabilidad |
| Uso de namespaces | ✅ | `sdypp` y `observability` |
| RBAC en Kubernetes | ✅ | `trp-rbac.yaml` (scale de worker-cpu), `observability/rbac.yaml` |
| Canal seguro entre nodos (TLS) | 🟡 | RabbitMQ es TLS-only en 5671. **Redis y Postgres van en texto plano** |
| Zero static keys (Workload Identity / OIDC) | ✅ | Los 5 pipelines autentican por WIF, sin llaves en el repo |
| Registros Docker (pull secrets o WI) | ✅ | Workload Identity con `artifactregistry.reader` |
| Logs gestionados en memoria y disco | ✅ | Lista `logs` en Redis (acotada por el janitor del NCT) + Loki |

---

## 4. Pruebas del sistema

Cubierta desde el 2026-08-04. **36 unit tests** (14 TypeScript con vitest + 22 Python con
pytest), los 3 specs de Playwright end-to-end, dos scripts de smoke, y un arnés de carga
(`Pilar2/P5/loadtest.py`) cuya matriz de resultados está en `Pilar2/P5/resultados/`.

Los tests de Python corren sin infraestructura: `tests/conftest.py` inyecta fakes de
`redis` y `pika` en `sys.modules` antes de importar `nct.py`.

| Ítem | Estado | Qué falta |
|---|---|---|
| Pruebas unitarias y de integración de lo crítico | ✅ | 36 unit tests (14 TS + 22 Python): firma ECDSA, pagos/refunds, PoW, ownership de tickets. En `app/src/**/*.test.ts` y `Pilar2/P5/tests/` |
| N transacciones con M recursos | ✅ | Matriz corrida y guardada en `Pilar2/P5/resultados/` (bulk 30, d4, chunk 25%: M=1 avg 17.7s, M=2 avg 8.3s) |
| N transacciones con 2×M recursos | ✅ | ídem (M=2 celdas en `c_m2_*`) |
| Bulks de transacciones (1 → 100.000) | 🟡 | Verificado con 30-50 tx; no se llegó a 100.000 (minado CPU con dificultad >4 se vuelve impracticable en minutos) |
| Dificultad de prefijo (1 → 8 caracteres) | 🟡 | Barrida 0-5 en las corridas. 6+ descartada: chunk 2.5M no resuelve (~15%/chunk) → loops de 65s |
| Fragmentación del pool (1% → 50%) | ✅ | `TRP_CHUNK_SIZE` parametrizable; barrido 10% vs 25% (5× más rápido el 10%). Docs en `resultados/RESUMEN.md` |
| Ingreso y egreso de nodos GPU | ✅ | Mecanismo verificado y **medido 2026-08-05**: egreso (parar el heartbeat) → fallback activo en ~45s (TTL Redis 30s + ciclo monitor 15s); ingreso → restaura en ~25-29s. Métricas `trp_gpu_alive` / `trp_fallback_active` (ver `Pilar2/P5/README.md` "Prueba realizada") |

---

## 5. Pipelines de despliegue

La sección mejor cubierta.

| Ítem | Estado | Evidencia |
|---|---|---|
| Pipeline 1 — infra básica | ✅ | `pipeline-1-infra.yml`, OpenTofu sobre GCP |
| Configuración de secretos para pipelines 2..N | ✅ | Documentado en `.github/workflows/README.md` |
| Pipeline 2 — servicios core | ✅ | `pipeline-2-services.yml` (Redis, RabbitMQ) |
| Pipeline 3..N — apps | ✅ | `pipeline-3-apps.yml` (4 imágenes), `pipeline-4-gpu-workers.yml`, `pipeline-5-observability.yml` |
| Pipeline de VMs externas | ➖ | Los nodos GPU adicionales vienen del cluster del profesor, no de VMs propias |
| Gitleaks que hace fallar el pipeline | ✅ | `gitleaks.yml` como workflow reutilizable, gate de los otros 5 |

**Defecto arreglado (Bloque 1):** el filtro de paths de Pipeline 4 no incluía
`observability.py` ni `requirements.txt`, pero el `Dockerfile.worker` los hornea
(`COPY . .` y `pip install -r requirements.txt`) y tanto `worker.py` como `gpu-server.py`
importan `observability`. Un cambio en esos archivos **no redesplegaba los workers GPU**;
ya se agregaron al filtro.

---

## 6. Repositorio y entrega

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Repositorio público con carpeta y README por pilar | ✅ | `Pilar1/`, `Pilar2/`, `infra/`+`k8s/`, todos con README |
| README con instrucciones, diagrama y decisiones | ✅ | README raíz + 24 ADRs en `app/docs/adr/` |
| Sin `.env`, credenciales ni secrets commiteados | ✅ | Verificado: solo plantillas. `.gitignore` cubre `*.pem`, `*.manual`, `.env*`, `tfvars` |
| App ejecutable desde terminal, sin IDE | ✅ | `docker compose up --build` desde la raíz levanta el sistema completo |
| **Video explicativo subido al repo** | ❌ | No existe |
| **Declaración de herramientas de IA usadas** | ✅ | `docs/USO-DE-IA.md` — declaración de qué se usó y cómo (asesor, revisado, sin secretos). Falta que el equipo la confirme/ajuste |

---

## 7. Informe

| Ítem | Estado | Qué falta |
|---|---|---|
| Comparativa y análisis de resultados | ✅ | [`docs/INFORME.md`](docs/INFORME.md) §2-§4 une el benchmark micro de Pilar 1 con las pruebas de sistema de Pilar 2 |
| Diagrama de arquitectura | ✅ | En el README raíz y en `Pilar2/README.md` |
| Cómo funciona el pool y cómo escala | ✅ | `INFORME.md` §3 con datos medidos: fragmentar el chunk domina sobre agregar workers |
| Casos de prueba N transacciones / M recursos | ✅ | Matriz corrida con M=1 y M=2, CSVs por transacción en `Pilar2/P5/resultados/` |
| Gráficos comparativos de tiempos de respuesta | ✅ | 4 gráficos en `Pilar2/P5/resultados/graficos/`, regenerables con `python Pilar2/P5/graficos.py` |
| Reflexión crítica (limitaciones, mejoras, contexto real) | ✅ | `INFORME.md` §5: limitaciones de arquitectura y de medición, 5 mejoras priorizadas, y por qué una blockchain propia con PoW no es la solución correcta para este negocio |

---

# Plan de implementación

Ordenado por dependencias y por lo que se puede hacer **sin nube**, que es la restricción
real hoy.

## Bloque 0 — Desbloquear (media hora)

Sin esto no se puede medir nada, y §4 y §7 dependen enteramente de medir.

- [x] **Levantar y verificar el compose raíz.** ✅ **Verificado 2026-08-04**: el stack completo
      levantó (`docker compose up --build`) con los 12 servicios healthy (Postgres, Redis,
      RabbitMQ, NCT, TrP, worker-cpu, app, Prometheus, Grafana, Loki, Tempo, Alloy).
- [x] Correr el flujo end-to-end: emitir entradas → ver los bloques minándose en
      `localhost:8000/blockchain`. ✅ **Verificado**: `POST /tx/mint` (firma ECDSA P-256 real)
      devolvió 202, la op quedó CONFIRMED en ~2s, la cadena pasó de 1 a 2 bloques y las
      métricas se registraron (`worker_solutions_found_total{cpu} = 4`, `worker_tasks_processed_total{cpu} = 4`).

> **Hallazgo:** en este clone `app/docker/entrypoint.sh` estaba con CRLF (checkout anterior al
> `.gitattributes`), lo que tiraba la app con `exec ./entrypoint.sh: no such file or directory`.
> El blob en git ya está en LF, así que un clone fresco no tiene el problema. También se
> observó un falso negativo del healthcheck de RabbitMQ en el primer arranque (race con el
> `start_period`), resuelto con un segundo `docker compose up -d`.

## Bloque 1 — Barato, alto impacto, sin nube (1-2 días)

- [x] **Agregar las 4 métricas faltantes** (§1). Se implementaron en los servicios
      (no en `observability.py`, que es solo plumbing) y se verificaron con un mint real:
  - `worker_hashes_total{worker_type}` en `worker_cpu.py` (contando MD5) y `worker.py`
    (aprox. por rango delegado) — la tasa sale con `rate(...[5m])` en Grafana
  - label `difficulty` en `nct_block_mining_seconds` en `nct.py` — habilita "tiempos por prefijo"
  - `worker_task_queue_latency_seconds`: `_published_at` que inyecta `trp.py` al publicar,
    delta al consumir en ambos workers
  - `nct_block_validation_seconds{difficulty}`: alrededor de la verificación de MD5 + dificultad
- [x] **Documentar el protocolo** (§1): sección **"Protocolo del pool: cooperativo vs.
      competitivo"** en `Pilar2/P5/README.md` (rango disjunto por chunk, por qué se eligió,
      qué implicaría el modo competitivo).
- [x] **Documentar el manejo de fallas de workers** (§1): sección **"Manejo de fallas en
      workers"** en `Pilar2/P5/README.md` (reentrega sin ack, reintento único, timeout del NCT,
      heartbeat/fallback).
- [x] **Declaración de uso de IA** (§6): `docs/USO-DE-IA.md` con qué herramientas se usaron
      y para qué. *Pendiente: confirmación/ajustes del equipo.*
- [x] **Arreglar el filtro de Pipeline 4** (§5): se agregaron `Pilar2/P5/observability.py` y
      `requirements.txt` a los paths.

## Bloque 2 — Pruebas (§4) — el hueco más grande (3-5 días)

- [x] **Tests unitarios de lo crítico** (en este orden de valor). Implementados y verdes:
  1. Verificación de firma ECDSA (server) — `Pilar2/P5/tests/test_signature.py` (canonicalize
     determinista, clave correcta, payload manipulado, otra clave, doble uso, input malformado)
  2. Lógica de pagos y refunds — `app/src/lib/payments/mercadopago.test.ts` (config/desconfig,
     public url, refund con nombre de pago)
  3. Verificación de PoW en el NCT — `Pilar2/P5/tests/test_pow.py` (hash válido, dificultad,
     hash reportado no coincide, encadenado, previous_hash incoherente)
  4. Ownership de tickets — `Pilar2/P5/tests/test_ownership.py` (dueño inicial, transferencia
     limpia al anterior, n tickets materializados, doble-gasto rechazado)
- [x] **Arnés de carga parametrizable**: `Pilar2/P5/loadtest.py` (`--tx`, `--batch`,
      `--difficulty`, `--csv`, `--ticket-count`). Emite N mints firmados ECDSA contra el NCT y
      mide time-to-confirm; `docker compose up -d --scale worker-cpu=M` escala los recursos.
      ✅ **Verificado 2026-08-04**: 20 txs → 20 CONFIRMED, avg_ttc=3.14s, p95=3.81s.
- [x] **Parametrizar el tamaño de chunk** para poder barrer la fragmentación del pool de
      1% a 50%: `trp.py` ahora lee `TRP_CHUNK_SIZE` (default 2.5M) y `TRP_TOTAL_RANGE` (default 10M).
      Expuestos también como env en `docker-compose.yml`.
- [x] **Correr la matriz de pruebas** y guardar los resultados crudos: se corrieron y
      guardaron CSVs + `resultados/RESUMEN.md`. Barrido de fragmentación (10% vs 25%) y de
      workers (M=1 vs M=2) a dificultad 4. Pendiente a escala completa: bulks >50 y las
      dificultades 6-8 (impracticables en CPU, → usar GPU workers o chunk más chico).

## Bloque 3 — Manifiestos de producción (§2, §3) — parcialmente hecho

Se pueden escribir y revisar sin cluster; quedan listos para el próximo despliegue.

- [x] **`securityContext` en los 7 workloads.** `runAsNonRoot`, uid derivado de lo que
      espera cada imagen (nextjs 1001, python 1000, postgres 70, redis/rabbitmq 999),
      `seccompProfile: RuntimeDefault` y `drop: [ALL]`. `readOnlyRootFilesystem` quedó
      fuera a propósito: Python escribe `__pycache__` y Postgres/RabbitMQ usan rutas de
      trabajo internas.
- [x] **Cluster Autoscaler** en `infra/gke.tf`: pools `apps` (2-5) e `infra` (1-2).
      `monitoring` queda fijo — singletons y único pool on-demand.
- [x] **HPA** en `k8s/gke/apps/hpa.yaml` para `frontend` (2-6) y `blockchain-nct` (2-4).
      **El `worker-cpu` quedó deliberadamente fuera** (ver ADR-026): sus réplicas ya las
      maneja el TrP y dos controladores sobre `spec.replicas` producirían flapping.
- [x] **Migrar Postgres, Redis y RabbitMQ a StatefulSet** con `volumeClaimTemplates`;
      se borraron los PVC estáticos y los `*-deployment.yaml`.
- [x] **NTP**: documentado. Los nodos GKE sincronizan por `systemd-timesyncd`
      (NTP de Google) y se monitorea el drift con `node_timex_offset_seconds` del
      collector `timex` de node-exporter → sección en `k8s/gke/observability/README.md`.
- [x] **Endpoint público de estado**: `/api/status` en la app agrega el estado de
      cada servicio (NCT, Redis, RabbitMQ, Postgres) y lo devuelve como JSON por el Ingress.
- [ ] **TLS para Redis** (y opcionalmente Postgres), para cerrar el ítem de canal seguro.

## Bloque 4 — Informe y entrega (§6, §7) — solo falta el video

- [x] **Gráficos comparativos**: `Pilar2/P5/graficos.py` genera 4 PNGs desde los CSVs.
- [x] **Análisis del pool y su escalado** con las mediciones reales — `docs/INFORME.md` §3.
- [x] **Reflexión crítica** — `docs/INFORME.md` §5.
- [ ] **Video explicativo** recorriendo servicios, componentes y configuraciones.

---

## Nota sobre el redespliegue

Varios ítems del Bloque 3 solo se pueden **verificar** con un cluster vivo. Cuando haya
cuenta nueva de GCP, además de aplicar los manifiestos hay cuatro pasos manuales que no
están en ningún README:

1. Recrear los 4 secrets de GitHub (`GCP_PROJECT_ID`, `GCP_WORKLOAD_IDENTITY_PROVIDER`,
   `GCP_WIF_SERVICE_ACCOUNT`, `KUBE_CONFIG_PROFESOR`).
2. Crear a mano el bucket del state de OpenTofu — `infra/backend.tf` lo exige antes del
   primer `tofu init`.
3. Actualizar el IP `34.46.108.71` hardcodeado en `k8s/profesor/*.yaml`.
4. Repuntar el DNS de `tesera.tech` al nuevo IP estático y esperar el Managed Certificate.
