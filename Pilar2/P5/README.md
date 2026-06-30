# Pilar 2 / P5 — Blockchain distribuida (versión de producción)

Versión final del nodo blockchain. Es la que corre en el cluster GKE e integra con la app web.
Agrega sobre [P4](../P4/): TrP (pool de tareas), fallback GPU→CPU, endpoints ticket-aware con
firma ECDSA, y la capa de observabilidad.

> Para la evolución P1→P5 ver [Pilar2/README.md](../README.md).
> Para el manual de observabilidad ver [k8s/gke/observability/MANUAL.md](../../k8s/gke/observability/MANUAL.md).

## Componentes

| Archivo | Servicio | Rol |
|---------|----------|-----|
| [nct.py](nct.py) | **NCT** (FastAPI :8000) | Nodo Coordinador: API REST, auto-miner, ownership de tickets, verificación de firma ECDSA y de PoW |
| [trp.py](trp.py) | **TrP** | Subdivide tareas en chunks de 2.5M nonces, monitorea la GPU, dispara el fallback a CPU |
| [worker.py](worker.py) | **Worker GPU** | Consume tareas, delega el cómputo al gpu-server por HTTP |
| [worker_cpu.py](worker_cpu.py) | **Worker CPU** | Minero puro Python (hashlib). Respaldo cuando no hay GPU |
| [gpu-server.py](gpu-server.py) | **gpu-server** (FastAPI :8000) | Wrapper HTTP del binario CUDA; publica heartbeats |
| [observability.py](observability.py) | (módulo) | Logging JSON, métricas Prometheus y trazas OTLP compartidas |

Infra requerida: **Redis** (estado) y **RabbitMQ** (colas, TLS :5671).

## Flujo de minado

```
app → NCT.POST /tx/mint|/tx/transfer → pending_transactions (Redis)
auto-miner (NCT) detecta pendientes → publica en [tareas_pool]
   → TrP subdivide en chunks → [tareas]
      → Worker GPU → gpu-server → binario CUDA   (o Worker CPU → hashlib)
         → solución → [soluciones]
   → NCT verifica MD5 + dificultad → guarda bloque → aplica efectos ticket-aware
```

## Colas RabbitMQ

| Cola | Productor → Consumidor | Payload |
|------|------------------------|---------|
| `tareas_pool` | NCT → TrP | bloque a minar + dificultad (lleva `_trace` para trazas) |
| `tareas` | TrP → Workers | chunk `{data, difficulty, start, end}` |
| `soluciones` | Workers → NCT | `{task_id, nonce, hash}` |
| `heartbeat_gpu` | gpu-server → TrP | latido cada 10s |

## Claves Redis principales

| Clave | Tipo | Para qué |
|-------|------|----------|
| `blockchain` | list | cadena de bloques (JSON) |
| `block:{index}` | hash | acceso O(1) a un bloque |
| `pending_transactions` | list | tx esperando ser minadas |
| `difficulty` / `difficulty_original` | string | dificultad actual / guardada antes del fallback |
| `minando` | string | lock distribuido de minado (Redlock simplificado) |
| `ticket_owner:{id}` / `owner_tickets:{pubkey}` | string / set | índice de propiedad de tickets |
| `heartbeat:gpu-server` / `heartbeat:{worker_id}` | string (TTL) | vitalidad de GPU / workers |
| `trp:fallback_active` | string | flag de fallback CPU activo (SET NX entre réplicas) |
| `logs` | list | telemetría de dominio (acotada por el logs-janitor del NCT) |

## Fallback GPU → CPU

El TrP (`monitor_loop`, cada 15s) revisa `heartbeat:gpu-server`:

- **GPU cae** → `activate_fallback()`: guarda la dificultad actual, la baja a `"0"` (más fácil),
  y escala los `worker-cpu` vía la API de Kubernetes.
- **GPU vuelve** → `restore_from_fallback()`: restaura la dificultad a `"00"` (constante
  `GPU_DIFFICULTY`, robusto ante pérdida del original) y baja los `worker-cpu` a 0.

El estado vive en Redis (`trp:fallback_active`) con `SET NX` para que, con N réplicas de TrP,
solo una ejecute la transición.

## Endpoints del NCT (ticket-aware)

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/tx/mint` | Emitir N tickets (verifica firma ECDSA del organizador) |
| POST | `/tx/transfer` | Transferir un ticket (valida ownership; firma en validación) |
| GET | `/ops/{op_id}` | Estado de una operación (PENDING/CONFIRMED/FAILED) |
| GET | `/tickets/{id}/owner` · `/tickets/owner/{pubkey}` | Consultas de ownership |
| GET | `/blockchain` · `/block/{i}` · `/validate` · `/status` · `/logs` | Cadena y estado |
| GET/POST | `/difficulty` | Leer / fijar dificultad (solo ceros) |
| GET | `/healthz` | Liveness (no toca Redis) · `/metrics` (Prometheus) |

Firma: ECDSA **P-256 / SHA-256 / IEEE P1363** (raw 64 bytes), sobre `canonicalize(payload)`
(JSON con keys ordenadas). Debe coincidir con `app/src/lib/crypto/common.ts`.

## Observabilidad

Todos los servicios usan [observability.py](observability.py):

- **Métricas** Prometheus en `/metrics` (NCT y gpu-server montan en su puerto; TrP/workers
  abren `METRICS_PORT`, default 9000). Ej: `nct_blocks_total`, `nct_block_mining_seconds`,
  `trp_gpu_alive`, `trp_fallback_active`, `worker_solutions_found_total{worker_type}`.
- **Logs** JSON a stdout (recogidos por Alloy → Loki).
- **Trazas** OTLP → Tempo, con el contexto W3C propagado por RabbitMQ (campo `_trace` en el
  payload), de modo que una operación se sigue NCT → TrP → worker de punta a punta.

### Variables de entorno

| Var | Default | Para qué |
|-----|---------|----------|
| `LOG_LEVEL` | `INFO` | nivel de logging |
| `METRICS_PORT` | `9000` | puerto `/metrics` en TrP/workers |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://alloy.observability...:4317` | collector de trazas |
| `OTEL_SDK_DISABLED` | — | `true` apaga trazas (usar donde no se alcanza el collector, p.ej. cluster del profesor) |
| `MINING_TIMEOUT_SECONDS`, `MAX_LOGS`, `RABBIT_HEARTBEAT_SECONDS` | ver código | tuning |

## Cómo correr

**Local (stack completo + observabilidad):** desde [`app/`](../../app/):
```bash
docker compose up
```

**GKE:** las imágenes las construye y despliega Pipeline 3
([.github/workflows/pipeline-3-apps.yml](../../.github/workflows/pipeline-3-apps.yml)); los
workers GPU van al cluster del profesor vía Pipeline 4. Manifiestos en
[k8s/gke/apps/](../../k8s/gke/apps/) y [k8s/profesor/](../../k8s/profesor/).

Dockerfiles: `Dockerfile.api` (NCT), `.trp`, `.cpu`, `.worker` (GPU, base `nvidia/cuda`).
