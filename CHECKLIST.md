# Checklist de entrega — estado del proyecto

Auditoría del repositorio contra `2026_SDYPP_checklist-blockchain-v2.docx` (checklist de
blockchain de la cátedra).

**Auditado sobre:** commit `0f01ebf` + el compose raíz sin commitear
**Fecha:** 2026-08-04

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
| 1. Funciones de blockchain | 9 | 3 | 4 | Sólido, faltan métricas y el modo competitivo |
| 2. Plataforma escalable en K8s | 7 | 1 | 1 | Casi completo |
| 3. Ambiente productivo real | 6 | 2 | 4 | El más flojo: falta todo el eje de autoescalado |
| 4. Pruebas del sistema | 0 | 1 | 6 | **El hueco más grande del proyecto** |
| 5. Pipelines | 5 | 0 | 0 | Completo (1 ítem N/A) |
| 6. Repositorio y entrega | 4 | 0 | 2 | Falta video y declaración de IA |
| 7. Informe | 1 | 2 | 3 | No arrancado |
| **Total** | **32** | **9** | **20** | |

Lo que mejor está: **blockchain, pipelines y repositorio**. Lo que peor: **pruebas e
informe**, que además son las dos secciones que el checklist pide demostrar con evidencia
medida, no con código.

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
| Protocolo: competencia y/o coordinación | 🟡 | El flujo está en `Pilar2/P5/README.md`, pero no discute el eje competencia vs coordinación |
| Detalle de arquitectura CUDA / versiones | ✅ | `Dockerfile.worker` compila `sm61`, `sm86` y `sm89`; Pilar 1 documenta el entorno (Colab T4) |
| Manejo de fallas en workers | 🟡 | `basic_nack(requeue=True)` en el worker CPU + `MINING_TIMEOUT_SECONDS` en el NCT. Falta documentarlo y probarlo |
| Keep-alive de mineros GPU hacia el pool | ✅ | Cola `heartbeat_gpu` → `heartbeat:gpu-server` con TTL en Redis |
| Fallback ante ausencia de GPUs | ✅ | `activate_fallback()`: baja dificultad a `"0"` y escala worker-cpu vía API de K8s |

### Métricas por tipo de recurso

| Métrica pedida | Estado | Detalle |
|---|---|---|
| Tasa de éxito CPU vs GPU | ✅ | Derivable: `worker_solutions_found_total{worker_type}` / `worker_tasks_processed_total` |
| Hashes por segundo (por nodo) | ❌ | No existe ninguna métrica de throughput de hashing |
| Tiempos de minería por prefijo | 🟡 | `nct_block_mining_seconds` existe pero **sin label de dificultad**, así que no se puede desagregar por prefijo |
| Latencia entre RabbitMQ y worker | ❌ | No existe |
| Tiempo de validación del bloque | ❌ | Se mide el minado, no la validación |

**Métricas que sí existen hoy:** `nct_blocks_total`, `nct_block_mining_seconds`,
`nct_mining_timeouts_total`, `nct_solutions_rejected_total`, `nct_transactions_received_total`,
`trp_chunks_published_total`, `trp_tasks_subdivided_total`, `trp_cpu_scale_events_total`,
`trp_gpu_alive`, `trp_fallback_active`, `worker_tasks_processed_total`,
`worker_solutions_found_total`, `worker_task_duration_seconds`, `gpu_mine_requests_total`,
`gpu_mine_duration_seconds`, `gpu_solutions_found_total`.

---

## 2. Configuración de plataforma escalable

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Base de datos | ✅ | `k8s/gke/apps/postgres-deployment.yaml` + PVC |
| Sistema de colas | ✅ | `k8s/gke/infra/rabbitmq-*.yaml` |
| Secretos | ✅ | `app-secrets`, plantilla en `secret.example.yaml.tpl`, valores fuera del repo |
| ConfigMaps | ✅ | `k8s/gke/apps/configmap.yaml` |
| Certificados (HTTPS) | ✅ | GKE Managed Certificate para `tesera.tech` |
| Plataforma de logging (N servicios, M réplicas) | ✅ | Alloy como DaemonSet → Loki |
| Monitoreo (alertas, dashboards) | ✅ | Prometheus + Grafana + `alerts.yaml` |
| **Sincronización de relojes con NTP** | ❌ | Sin ninguna referencia a NTP/chrony en el repo |
| Endpoint público de estado por servicio | 🟡 | La app expone `/api/health` y `/api/status` por el Ingress, pero el NCT es ClusterIP: su `/status` **no es accesible desde Internet**. Falta un JSON agregado con el estado de cada servicio |

---

## 3. Configuraciones para ambiente productivo real

La sección más débil. El eje de **autoescalado no existe**: los node pools tienen
`node_count` fijo y no hay ningún HPA.

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Autoscaler por uso de CPU (Cluster Autoscaler / Karpenter) | ❌ | `infra/gke.tf` usa `node_count` fijo, sin bloque `autoscaling` |
| HPA por métricas comunes o específicas | ❌ | No hay ningún `HorizontalPodAutoscaler` en el repo |
| Servicios como StatefulSet para escalar con PVC | ❌ | Postgres, Redis y RabbitMQ son `Deployment` + PVC |
| Limitación de recursos | ✅ | Los 7 workloads tienen `resources:` |
| `securityContext` (no root, mínimo necesario) | ❌ | Solo en observabilidad (Loki, Prometheus, Tempo). **Ninguno** en frontend, NCT, TrP, worker-cpu, Postgres, Redis ni RabbitMQ |
| tolerations / affinity / nodeSelector | 🟡 | `nodeSelector` en los 7 workloads (separa `pool=infra` de `pool=apps`), pero `tolerations`/`affinity` solo en observabilidad |
| Uso de namespaces | ✅ | `sdypp` y `observability` |
| RBAC en Kubernetes | ✅ | `trp-rbac.yaml` (scale de worker-cpu), `observability/rbac.yaml` |
| Canal seguro entre nodos (TLS) | 🟡 | RabbitMQ es TLS-only en 5671. **Redis y Postgres van en texto plano** |
| Zero static keys (Workload Identity / OIDC) | ✅ | Los 5 pipelines autentican por WIF, sin llaves en el repo |
| Registros Docker (pull secrets o WI) | ✅ | Workload Identity con `artifactregistry.reader` |
| Logs gestionados en memoria y disco | ✅ | Lista `logs` en Redis (acotada por el janitor del NCT) + Loki |

---

## 4. Pruebas del sistema

**El hueco más grande del proyecto.** Hay 3 specs de Playwright end-to-end
(`auth`, `organizer`, `listing`) y dos scripts de smoke, pero **cero tests unitarios** y
ninguna prueba de carga.

| Ítem | Estado | Qué falta |
|---|---|---|
| Pruebas unitarias y de integración de lo crítico | ❌ | No hay unit tests. Lo crítico sin cubrir: lógica de pagos/refunds, verificación de firma ECDSA, ownership de tickets, verificación de PoW |
| N transacciones con M recursos | ❌ | No hay arnés de carga |
| N transacciones con 2×M recursos | ❌ | ídem |
| Bulks de transacciones (1 → 100.000) | ❌ | Sin medir |
| Dificultad de prefijo (1 → 8 caracteres) | ❌ | Sin medir. Ojo: con 8 caracteres el minado puede volverse impracticable en CPU |
| Fragmentación del pool (1% → 50%) | ❌ | El chunk es fijo en 2.5M nonces; no es parametrizable hoy |
| Ingreso y egreso de nodos GPU | 🟡 | El mecanismo funciona (fallback verificado en producción), falta la prueba sistemática y medida |

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

**Defecto detectado:** el filtro de paths de Pipeline 4 no incluye `observability.py`, pero
el `Dockerfile.worker` lo hornea (`COPY . .`) y tanto `worker.py` como `gpu-server.py` lo
importan. Un cambio en ese archivo **no redespliega los workers GPU**.

---

## 6. Repositorio y entrega

| Ítem | Estado | Evidencia / qué falta |
|---|---|---|
| Repositorio público con carpeta y README por pilar | ✅ | `Pilar1/`, `Pilar2/`, `infra/`+`k8s/`, todos con README |
| README con instrucciones, diagrama y decisiones | ✅ | README raíz + 24 ADRs en `app/docs/adr/` |
| Sin `.env`, credenciales ni secrets commiteados | ✅ | Verificado: solo plantillas. `.gitignore` cubre `*.pem`, `*.manual`, `.env*`, `tfvars` |
| App ejecutable desde terminal, sin IDE | ✅ | `docker compose up --build` desde la raíz levanta el sistema completo |
| **Video explicativo subido al repo** | ❌ | No existe |
| **Declaración de herramientas de IA usadas** | ❌ | Hay `CLAUDE.md` y `AGENTS.md` en el repo, pero ninguna declaración explícita de qué se usó y cómo |

---

## 7. Informe

| Ítem | Estado | Qué falta |
|---|---|---|
| Comparativa y análisis de resultados | 🟡 | Existe el benchmark GPU vs CPU de Pilar 1 (hasta 128× con prefijo de 6). Falta el análisis del sistema distribuido completo |
| Diagrama de arquitectura | ✅ | En el README raíz y en `Pilar2/README.md` |
| Cómo funciona el pool y cómo escala | 🟡 | El flujo está documentado; falta el análisis de escalado con distintas cargas |
| Casos de prueba N transacciones / M recursos | ❌ | Depende de §4 |
| Gráficos comparativos de tiempos de respuesta | ❌ | Depende de §4 |
| Reflexión crítica (limitaciones, mejoras, contexto real) | ❌ | No escrita |

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

- [ ] **Agregar las 4 métricas faltantes** (§1). Todas van en `Pilar2/P5/observability.py`
      y sus servicios:
  - `worker_hashes_per_second` (o un counter `worker_hashes_total` y calcular la tasa en Grafana)
  - label `difficulty` en `nct_block_mining_seconds` — habilita "tiempos por prefijo"
  - `worker_task_queue_latency_seconds`: timestamp al publicar en `tareas`, delta al consumir
  - `nct_block_validation_seconds`: alrededor de la verificación de MD5 + dificultad
- [ ] **Documentar el protocolo** (§1): sección en `Pilar2/P5/README.md` explicando que el
      pool es cooperativo por reparto de rangos disjuntos, por qué se eligió así, y qué
      implicaría el modo competitivo.
- [ ] **Documentar el manejo de fallas de workers** (§1): qué pasa cuando uno cae, cómo
      actúan `basic_nack(requeue=True)` y `MINING_TIMEOUT_SECONDS`.
- [ ] **Declaración de uso de IA** (§6): archivo `docs/USO-DE-IA.md` con qué herramientas se
      usaron y para qué.
- [ ] **Arreglar el filtro de Pipeline 4** (§5): agregar `Pilar2/P5/observability.py` y
      `requirements.txt` a los paths.

## Bloque 2 — Pruebas (§4) — el hueco más grande (3-5 días)

- [ ] **Tests unitarios de lo crítico**, en este orden de valor:
  1. Verificación de firma ECDSA (server) — ya existe `test-ecdsa-roundtrip.mjs`, formalizarlo
  2. Lógica de pagos y refunds — hoy sin ningún test, y es donde hay plata real
  3. Verificación de PoW en el NCT (hash válido, dificultad correcta, rechazo de inválidos)
  4. Ownership de tickets (transferencias, doble-gasto)
- [ ] **Arnés de carga parametrizable**: script que emita N transacciones contra el NCT y
      mida tiempos. Con el compose raíz, escalar "M recursos" es
      `docker compose up -d --scale worker-cpu=M`.
- [ ] **Parametrizar el tamaño de chunk** para poder barrer la fragmentación del pool de
      1% a 50% (hoy fijo en 2.5M nonces).
- [ ] **Correr la matriz de pruebas** y guardar los resultados crudos:
      bulks 1 → 100.000 · dificultad 1 → 8 · fragmentación 1% → 50% · M y 2×M workers.

## Bloque 3 — Manifiestos de producción (§2, §3) — escribir ahora, aplicar al redeployar

Se pueden escribir y revisar sin cluster; quedan listos para el próximo despliegue.

- [ ] **`securityContext` en los 7 workloads** (`runAsNonRoot`, `readOnlyRootFilesystem`
      donde se pueda, drop de capabilities). Es el ítem más barato de los que faltan.
- [ ] **Cluster Autoscaler**: bloque `autoscaling { min_node_count / max_node_count }` en
      los node pools de `infra/gke.tf`.
- [ ] **HPA** para `worker-cpu` (por CPU) y para `frontend` (por CPU o por requests).
- [ ] **Migrar Postgres, Redis y RabbitMQ a StatefulSet** con `volumeClaimTemplates`.
- [ ] **NTP**: verificar la sincronización de los nodos (en GKE viene por `timesyncd` del
      SO); documentarlo y, si hace falta, exponer la métrica de drift del `node-exporter`.
- [ ] **Endpoint público de estado**: un `/api/status` en la app que agregue el estado de
      cada servicio (NCT, Redis, RabbitMQ, Postgres) y lo devuelva como JSON por el Ingress.
- [ ] **TLS para Redis** (y opcionalmente Postgres), para cerrar el ítem de canal seguro.

## Bloque 4 — Informe y entrega (§6, §7) — al final, porque depende del Bloque 2

- [ ] **Gráficos comparativos** a partir de los datos crudos del Bloque 2.
- [ ] **Análisis del pool y su escalado** con las mediciones reales.
- [ ] **Reflexión crítica**: limitaciones (single point of failure del NCT, dificultad fija,
      chunk fijo), mejoras posibles, y en qué contexto real aplicaría esta arquitectura.
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
