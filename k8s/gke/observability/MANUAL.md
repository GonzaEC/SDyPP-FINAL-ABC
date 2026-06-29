# Manual de Observabilidad — Tesera

Manual operativo del stack de observabilidad. Cubre los 4 pilares (métricas,
logs, trazas, alertas), cómo acceder, cómo leer cada señal, y cómo extender.

> Para el "qué es / cómo desplegar" rápido, ver [README.md](README.md). Este
> documento es el manual de uso completo.

## Índice

1. [Arquitectura en 1 minuto](#1-arquitectura-en-1-minuto)
2. [Acceso](#2-acceso)
3. [Métricas (Prometheus)](#3-métricas-prometheus)
4. [Logs (Loki)](#4-logs-loki)
5. [Trazas (Tempo)](#5-trazas-tempo)
6. [Correlación entre pilares](#6-correlación-entre-pilares)
7. [Alertas (Alertmanager)](#7-alertas-alertmanager)
8. [Dashboards de Grafana](#8-dashboards-de-grafana)
9. [Entorno local](#9-entorno-local)
10. [Operación y mantenimiento](#10-operación-y-mantenimiento)
11. [Troubleshooting](#11-troubleshooting)
12. [Cómo extender](#12-cómo-extender)

---

## 1. Arquitectura en 1 minuto

```
Servicios (NCT, TrP, workers, frontend, gpu-server)
  ├─ exponen /metrics ───────────────► Prometheus ──┐
  ├─ logean JSON a stdout ─► Alloy ──► Loki ─────────┤
  └─ emiten spans OTLP ───► Alloy ──► Tempo ─────────┤
                                                     ▼
   exporters (redis/postgres/rabbitmq/ksm/node) ► Grafana ◄── vos
                                                     ▲
                                  Prometheus ──► Alertmanager
```

- **Namespace**: todo el stack vive en `observability`.
- **Node pool**: corre en un pool dedicado `monitoring` (taint + toleration) para
  no competir por recursos con la app.
- **Alloy** es el colector único: tail-ea logs de pods → Loki, y recibe trazas
  OTLP → Tempo.
- **Grafana** es la única UI: ve Prometheus, Loki y Tempo a la vez.

| Pilar | Backend | UI |
|-------|---------|-----|
| Métricas | Prometheus (`:9090`) | Grafana / Prometheus UI |
| Logs | Loki (`:3100`) | Grafana → Explore |
| Trazas | Tempo (`:3200`) | Grafana → Explore |
| Alertas | Alertmanager (`:9093`) | Grafana / Alertmanager UI |

---

## 2. Acceso

Nada se expone público. Se accede por `kubectl port-forward` (necesitás
credenciales del cluster: `gcloud container clusters get-credentials sdypp-cluster --zone us-central1-a`).

```bash
# Grafana — la puerta de entrada principal
kubectl -n observability port-forward svc/grafana 3001:3000
#   → http://localhost:3001   (usuario: admin / pass: admin)

# Prometheus — para PromQL crudo y ver targets/alertas
kubectl -n observability port-forward svc/prometheus 9090:9090
#   → http://localhost:9090

# Alertmanager — alertas activas y silencios
kubectl -n observability port-forward svc/alertmanager 9093:9093
#   → http://localhost:9093
```

**Verificar que el stack está sano:**
```bash
kubectl -n observability get pods
# Esperás: prometheus, grafana, loki, tempo, alertmanager, kube-state-metrics,
# redis-exporter, postgres-exporter (1/1 Running); alloy y node-exporter
# (DaemonSet, 1 por nodo).
```

---

## 3. Métricas (Prometheus)

### 3.1 Cómo se descubren los targets

Prometheus scrapea **cualquier pod con la annotation** `prometheus.io/scrape: "true"`
(en cualquier namespace), usando `prometheus.io/port` y `prometheus.io/path`.
Para ver qué está scrapeando: Prometheus UI → **Status → Targets**.

### 3.2 Métricas propias (instrumentadas en el código)

**NCT** (`nct_*`):

| Métrica | Tipo | Qué mide |
|---------|------|----------|
| `nct_blocks_total` | counter | bloques minados y confirmados |
| `nct_block_mining_seconds` | histogram | tiempo publicar tarea → solución válida |
| `nct_transactions_received_total{tx_type}` | counter | tx recibidas (`mint`/`transfer`/`legacy`) |
| `nct_solutions_rejected_total{reason}` | counter | soluciones descartadas (`invalid_pow`, `stale_task`, ...) |
| `nct_mining_timeouts_total` | counter | timeouts esperando solución |
| `nct_pending_transactions` | gauge | tx en cola sin minar |
| `nct_blockchain_length` | gauge | bloques en la cadena |
| `nct_difficulty_zeros` | gauge | ceros de dificultad exigidos |
| `nct_mining_active` | gauge | 1 si hay minado en curso |

**TrP** (`trp_*`): `trp_tasks_subdivided_total`, `trp_chunks_published_total`,
`trp_fallback_active` (0/1), `trp_gpu_alive` (0/1), `trp_cpu_scale_events_total{action}`.

**Workers** (`worker_*`, label `worker_type=cpu|gpu`): `worker_tasks_processed_total`,
`worker_solutions_found_total`, `worker_task_duration_seconds`.

**gpu-server** (`gpu_*`): `gpu_mine_requests_total`, `gpu_solutions_found_total`,
`gpu_mine_duration_seconds`.

**Frontend**: `nct_operations_submitted_total{kind,result}`, `payments_confirmed_total`,
y las default de Node (`nodejs_*`, `process_*`). *(`http_requests_total` y
`http_request_duration_seconds` están definidas pero se poblan solo si envolvés
los handlers con `observeHttp()` — ver §12.)*

**Infra (exporters)**: `redis_*` (memoria, ops, clientes), `pg_*` (conexiones,
`pg_up`), `rabbitmq_*` (profundidad de colas, consumers), `kube_*` (estado de
pods/deployments), `node_*` (CPU/RAM/disco de cada nodo).

### 3.3 Consultas PromQL útiles

```promql
# Throughput de minado (bloques por minuto)
sum(rate(nct_blocks_total[5m])) * 60

# Latencia de minado p95
histogram_quantile(0.95, sum(rate(nct_block_mining_seconds_bucket[5m])) by (le))

# ¿Está la GPU viva? ¿Estamos en fallback CPU?
max(trp_gpu_alive)
max(trp_fallback_active)

# Soluciones por tipo de worker
sum by (worker_type) (rate(worker_solutions_found_total[5m]))

# Profundidad de la cola de tareas en RabbitMQ
sum(rabbitmq_queue_messages{queue="tareas"})

# Memoria usada por Redis
redis_memory_used_bytes

# Reinicios de pods en sdypp (señal de inestabilidad)
sum by (pod) (kube_pod_container_status_restarts_total{namespace="sdypp"})
```

---

## 4. Logs (Loki)

Todos los servicios logean **JSON estructurado a stdout**; Alloy lo recoge y lo
manda a Loki con labels. En Grafana: **Explore → datasource Loki**.

**Labels disponibles** (para filtrar rápido): `namespace`, `app`, `pod`, `container`.
**Campos del JSON** (dentro de la línea): `ts`, `level`, `service`, `msg`,
`trace_id`, `span_id`, más campos de dominio.

### Consultas LogQL útiles

```logql
# Todos los logs del NCT
{app="blockchain-nct"}

# Solo errores de cualquier servicio de la blockchain
{namespace="sdypp"} | json | level="ERROR"

# Eventos de un bloque concreto (parseando el JSON)
{app="blockchain-nct"} | json | msg=~".*bloque_creado.*"

# Logs de una traza específica (correlación con Tempo)
{namespace="sdypp"} | json | trace_id="abc123..."

# Tasa de errores por servicio (métrica derivada de logs)
sum by (app) (rate({namespace="sdypp"} | json | level="ERROR" [5m]))
```

> Retención: 7 días (configurable en [loki.yaml](loki.yaml)). Los logs son
> telemetría, no fuente de verdad — la blockchain vive en Redis/Postgres.

---

## 5. Trazas (Tempo)

Una traza sigue **una operación de punta a punta**, incluso cruzando RabbitMQ.
El contexto W3C `traceparent` se propaga embebido en el payload de los mensajes
(campo `_trace`), por eso la traza no se corta al saltar de cola.

**Flujo de una emisión de entradas:**
```
frontend (fetch a NCT)
  └─ NCT: span "mine_block"
       └─ (RabbitMQ tareas_pool) → TrP: span "trp_subdivide"
            └─ (RabbitMQ tareas) → worker: span "worker_mine_cpu" / "worker_mine_gpu"
```

**Cómo ver una traza**: Grafana → Explore → datasource **Tempo**:
- **Search**: filtrá por `service.name` (ej. `nct`) y duración, o
- pegá un **Trace ID** (lo sacás de un log en Loki que tenga `trace_id`).

Atributos útiles en los spans: `task_id`, `tx_count`, `block_index`, `worker_id`,
`range_start`/`range_end`.

> Los workers GPU corren en el cluster del profesor (otra red): sus spans llegan
> solo si ese cluster puede alcanzar el Alloy de GKE por OTLP. Ver §11.

---

## 6. Correlación entre pilares

Lo más potente del stack: saltar de una señal a otra sin copiar/pegar a mano.

- **Log → Traza**: en un log de Loki que tenga `trace_id`, Grafana muestra un
  botón **TraceID** que abre la traza en Tempo (configurado con `derivedFields`).
- **Traza → Logs**: en una traza de Tempo, el botón **Logs for this span** filtra
  Loki por ese `trace_id` (configurado con `tracesToLogsV2`).
- **Métrica → Logs**: desde un pico en un panel, "Explore" con el mismo rango de
  tiempo y filtrás por `app`.

Flujo típico de debug: *alerta dispara* → mirás el **dashboard** → ves un pico de
`nct_mining_timeouts_total` → **Explore Loki** filtrando errores del NCT en esa
ventana → encontrás el `trace_id` → **abrís la traza** y ves en qué worker se
colgó.

---

## 7. Alertas (Alertmanager)

Las reglas las evalúa Prometheus ([alerts.yaml](alerts.yaml)) y las rutea
Alertmanager. Para ver alertas activas: Prometheus UI → **Alerts**, o
Alertmanager UI.

| Alerta | Severidad | Dispara cuando |
|--------|-----------|----------------|
| `GPUServerCaido` | critical | `trp_gpu_alive == 0` por >2m |
| `FallbackCPUProlongado` | warning | minando en CPU por >10m |
| `BlockchainEstancada` | critical | hay tx pendientes pero no se minan bloques (10m) |
| `MuchosTimeoutsDeMinado` | warning | >2 timeouts de minado en 10m |
| `RedisCaido` | critical | `redis_up == 0` |
| `PostgresCaido` | critical | `pg_up == 0` |
| `ColaRabbitMQCreciente` | warning | cola `tareas` >50 msgs por 10m |
| `PodCrashLoop` | warning | pod reinició >3 veces en 15m |
| `TargetCaido` | warning | Prometheus no scrapea un target por >5m |

**Notificaciones externas** (Discord/Slack): por defecto las alertas solo se ven
en la UI. Para notificar, descomentá el `webhook_configs` en el receiver `default`
de [alerts.yaml](alerts.yaml) y poné la URL del webhook.

---

## 8. Dashboards de Grafana

Vienen provisionados (no hay que armarlos a mano). En Grafana → **Dashboards →
carpeta Tesera**:

- **Tesera — Blockchain & Minería**: bloques en cadena, TX pendientes, dificultad,
  GPU viva/fallback, throughput de minado, latencia p50/p95, soluciones por tipo
  de worker, soluciones rechazadas por motivo.

Para agregar más, ver §12.

---

## 9. Entorno local

Sin cluster, todo en docker-compose (desde `app/`):

```bash
docker compose up
```
Levanta app + Postgres + Prometheus + Grafana + Loki + Tempo + Alloy.

- App: http://localhost:3000
- Grafana: http://localhost:3001 (admin/admin) — datasources ya provisionados
- Prometheus: http://localhost:9090

Acá Prometheus scrapea el frontend, Alloy recoge los logs de los contenedores
(vía Docker socket) y el frontend manda trazas a Tempo. Sirve para validar la
instrumentación sin tocar GKE. Configs en [`observability/local/`](../../../observability/local/).

---

## 10. Operación y mantenimiento

**Redesplegar el stack** (tras cambiar manifests): push a `main` con cambios en
`k8s/gke/observability/**` dispara Pipeline 5. A mano:
```bash
kubectl apply -f k8s/gke/observability/namespace.yaml
kubectl apply -f k8s/gke/observability/rbac.yaml
kubectl apply -f k8s/gke/observability/
```

**Recargar config de Prometheus sin reiniciar** (tiene `--web.enable-lifecycle`):
```bash
kubectl -n observability port-forward svc/prometheus 9090:9090 &
curl -X POST http://localhost:9090/-/reload
```

**Almacenamiento / retención**:
- Prometheus: PVC 10Gi, retención 15 días (`--storage.tsdb.retention.time`).
- Loki: PVC 10Gi, retención 7 días.
- Tempo: PVC 10Gi, retención 7 días.
Para cambiar tamaños, editá los PVC + flags en cada manifest.

**Costo**: el grueso es el node pool `monitoring` (e2-standard-2 on-demand). Si
hace falta apagarlo, `kubectl -n observability scale deploy --all --replicas=0`
no ahorra el nodo; bajá el node pool en Terraform.

---

## 11. Troubleshooting

| Síntoma | Causa probable | Solución |
|---------|----------------|----------|
| Pods de observability en `Pending` | node pool `monitoring` no existe | correr Pipeline 1 (`tofu apply`); los pods toleran el taint solo de ese pool |
| Un servicio no aparece en Prometheus Targets | falta la annotation o el puerto | verificar `prometheus.io/scrape/port/path` en el pod; ver §3.1 |
| `/metrics` vacío en un servicio Python | `prometheus_client` no instalado en la imagen | está en `requirements.txt`; rebuildear imagen (Pipeline 3) |
| No llegan logs a Loki | Alloy no corre en ese nodo, o no lee `/var/log/pods` | `kubectl -n observability get ds alloy`; revisar que tolere el taint del nodo |
| No hay trazas en Tempo | el servicio no resuelve el endpoint OTLP | revisar `OTEL_EXPORTER_OTLP_ENDPOINT`; default `alloy.observability:4317/4318` |
| No veo métricas/trazas de **workers GPU** | corren en el cluster del profesor (otra red) | limitación conocida: el Prometheus/Alloy de GKE no los alcanza. Su actividad se infiere por `trp_gpu_alive` y `worker_solutions_found_total`. Para verlos haría falta un agente con `remote_write` del lado del profesor |
| Grafana pide login y admin/admin no entra | password cambiada o secret | `GF_SECURITY_ADMIN_PASSWORD` en [grafana.yaml](grafana.yaml) |

**Comandos de diagnóstico:**
```bash
kubectl -n observability get pods -o wide          # qué corre y dónde
kubectl -n observability logs deploy/prometheus     # logs del propio Prometheus
kubectl -n observability logs ds/alloy              # logs del colector
kubectl get nodes -l pool=monitoring                # el node pool existe?
```

---

## 12. Cómo extender

**Agregar una métrica nueva (Python)**: en el servicio, definí el `Counter/Gauge/
Histogram` (importando de `prometheus_client`) y actualizalo donde corresponda.
Ya está el `/metrics` expuesto vía [observability.py](../../../Pilar2/P5/observability.py).

**Agregar métricas HTTP al frontend**: envolvé el handler con `observeHttp()` de
[metrics.ts](../../../app/src/lib/observability/metrics.ts):
```ts
import { observeHttp } from "@/lib/observability/metrics";
export const GET = (req) => observeHttp("/api/eventos", "GET", async () => { ... });
```

**Monitorear un servicio nuevo**: agregale al pod las annotations
`prometheus.io/scrape: "true"` + `prometheus.io/port: "<puerto>"`. Prometheus lo
descubre solo.

**Agregar un dashboard**: pegá su JSON como una key nueva en el ConfigMap
`grafana-dashboards` ([grafana-dashboards.yaml](grafana-dashboards.yaml)) y
`kubectl apply`. Grafana lo recarga.

**Agregar una alerta**: agregá la regla a [alerts.yaml](alerts.yaml) (ConfigMap
`prometheus-rules`), `kubectl apply`, y recargá Prometheus (§10).

**Logging estructurado**:
- Python: `from observability import setup_logging; log = setup_logging("mi-svc")`.
- Frontend: `import { log } from "@/lib/observability/log"; log.info("...", {campo})`.
