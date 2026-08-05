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

## Protocolo del pool: cooperativo vs. competitivo

El pool **es cooperativo por reparto de rangos disjuntos**: el TrP divide el espacio de nonces
`[0, TOTAL)` en chunks de `CHUNK_SIZE = 2_500_000` y cada worker recibe un rango único y
disjunto (`[start, end]`). Esto garantiza que **no hay trabajo duplicado**: entre todos los
workers vivos se barre el espacio completo exactamente una vez, y cualquiera de ellos puede
encontrar el nonce ganador.

```
nonces:  0 ───────────────────────── 10_000_000
chunks: [0, 2.5M)  [2.5M, 5M)  [5M, 7.5M)  [7.5M, 10M)
worker:      A          B          A            C
```

### Por qué se eligió así

1. **Determinismo y balance justo**: cada tarea tiene tiempo de cómputo acotado y conocido
   (a lo sumo `CHUNK_SIZE` hashes), lo que hace el escalado predecible: duplicar workers a lo
   sumo duplica el throughput de barrido.
2. **Sin coordinación entre workers**: al ser rangos disjuntos, los workers no necesitan
   acordar entre sí quién mina qué; el único coordinador es el TrP, un punto simple y testeable.
3. **Idempotencia del resultado**: como todos los workers prueban datos idénticos (mismo bloque,
   misma dificultad), cualquier rango que encuentre el nonce gana; la verificación de PoW del NCT
   es la autoridad final, no importa quién reporte.

### Qué implicaría el modo competitivo

En un modo competitivo todos los workers minarían el **mismo rango** y el primero en reportar
una solución válida ganaría el bloque (la cola `soluciones` es FIFO por worker y el NCT acepta
la primera válida que llega). Ventajas: no depende de que el TrP reparta bien y es más simple
de razonar. Costos: duplica/`N`-uplica el trabajo total, satura CPU/GPU con hashes redundantes
y vuelve el tiempo de resolución dependiente del worker más rápido en vez del esfuerzo total.
Para esta arquitectura (un pool pequeño de workers cooperando sobre un único espacio de nonces)
el modo competitivo no aporta — solo consume cómputo. Se deja documentado como decisión
(ver ADR correspondiente) y el protocolo actual queda clasificado como **cooperativo por
partición del espacio**.

## Manejo de fallas en workers

Qué pasa cuando un worker se cae o una tarea falla, capa por capa:

1. **Mensaje sin ackear** (`auto_ack=False` + ack manual): si el worker muere a mitad del
   minado, RabbitMQ **reentrega** el mensaje a otro worker en vez de perder la tarea. El ack
   se emite recién después de procesar.
2. **`basic_nack(requeue=True)` con reintento único**: si procesar la tarea lanza excepción,
   el worker la reintenta **una sola vez** (usa `method.redelivered` como contador). Si vuelve
   a fallar, hace `basic_ack` y la suelta, evitando el requeue infinito (poison message) y la
   tormenta de reintentos que saturó el pipeline (bug M3). El mismo patrón está en
   `worker_cpu.py` y `worker.py`.
3. **`MINING_TIMEOUT_SECONDS` en el NCT** (default 180s): si ninguna solución llega a tiempo,
   el auto-miner descarta la tarea, `NCT_MINING_TIMEOUTS` incrementa y el siguiente ciclo
   re-publica un task nuevo. Es la red de seguridad final si el problema es de red, no de worker.
4. **Heartbeat con TTL**: cada worker y el gpu-server publican `heartbeat:{id}` / `heartbeat:gpu-server`
   en Redis con TTL. Si el worker muere, su clave desaparece sola y el TrP deja de contarlo;
   si muere la GPU, se dispara el fallback a CPU (sección anterior).

Combinados: la reentrega de RabbitMQ cubre la caída brusca, el reintento único cubre fallas
transitorias, el timeout del NCT cubre el agotamiento de reintentos, y el heartbeat/fallback
cubre la pérdida de capacidad de minado.

### Prueba realizada (2026-08-05): kill del worker-cpu a mitad del minado

Con el compose raíz arriba se emitieron 10 mints (bloque único con dificultad `00000`) y se
mató el worker-cpu **mientras minaba**. La evidencia se tomó del API de management de
RabbitMQ (cola `tareas`) y de los logs del worker:

| Momento | `messages_ready` | `messages_unacknowledged` | `redeliver` | Qué pasó |
|---|---|---|---|---|
| Antes del mint | 0 | 0 | 0 | — |
| Worker minando | 0 | **4** | 0 | El TrP subdividió el bloque en 4 chunks y el worker los tomó (unacked, sin ack) |
| `docker compose kill worker-cpu` | — | — | — | SIGKILL a mitad del minado: el worker muere sin ackear |
| ~2s después del kill | **4** | 0 | 0 | RabbitMQ requeueó los 4 chunks (`basic_ack` nunca llegó) |
| Worker reiniciado | 0 | 0 | **4** | Los chunks se redelivered; el worker re-minó los **mismos rangos** (`[0-2499999]`, `[2500000-4999999]`, `[5000000-7499999]`, `[7500000-9999999]`) |
| Resultado | — | — | — | **10/10 ops CONFIRMED**, cadena pasó de 27 → 28 bloques |

Puntos a destacar del resultado:

- La reentrega es **por diseño de `auto_ack=False` + ack manual** en `worker_cpu.py:143-203`:
  la tarea queda unacked mientras se mina y RabbitMQ la devuelve a la cola si la conexión
  muere. Ninguna transacción se pierde.
- En el registro de RabbitMQ el `redeliver` pasa de 0 a 4: son los 4 chunks que se
  reentregaron exactamente una vez. No hubo duplicados (los rangos disjuntos del pool
  cooperativo impiden doble minado del mismo nonce).
- **Matar el worker no bloquea el pipeline**: el NCT sigue esperando con
  `MINING_TIMEOUT_SECONDS`, y el worker que retoma la tarea publica la solución en
  `soluciones`; el NCT la valida (MD5 + dificultad) y confirma el bloque igual que siempre.
- **Matar el contenedor vs. el proceso**: `docker compose kill` (y `docker kill`) son un
  stop **manual** de Docker y, aunque requeuean el mensaje, **no** disparan la restart
  policy `unless-stopped` del compose (hay que relanzar con `docker compose start`). En el
  cluster GKE esto no aplica: el ReplicaSet del deployment `worker-cpu` recrea el pod
  automáticamente, que es el escenario real de caída que cubre esta capa.

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
  abren `METRICS_PORT`, default 9000). Métricas de dominio:
  - NCT: `nct_blocks_total`, `nct_block_mining_seconds{difficulty}`, `nct_block_validation_seconds{difficulty}`,
    `nct_transactions_received_total`, `nct_solutions_rejected_total`, `nct_mining_timeouts_total`.
  - TrP: `trp_tasks_subdivided_total`, `trp_chunks_published_total`, `trp_gpu_alive`,
    `trp_fallback_active`, `trp_cpu_scale_events_total`.
  - Workers: `worker_tasks_processed_total`, `worker_solutions_found_total`, `worker_hashes_total`,
    `worker_task_duration_seconds`, `worker_task_queue_latency_seconds`.
  - gpu-server: `gpu_mine_requests_total`, `gpu_mine_duration_seconds`, `gpu_solutions_found_total`.
  - La tasa de éxito CPU vs GPU es `worker_solutions_found_total / worker_tasks_processed_total`
    por `worker_type`; los hashes/segundo se derivan de `rate(worker_hashes_total[5m])`.
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

**Local (stack completo + observabilidad):** desde la raíz del repo:
```bash
docker compose up --build
```

Solo la blockchain, sin la app web:
```bash
docker compose up --build redis rabbitmq nct trp worker-cpu
```

Dos cosas a tener en cuenta en local:

- **No hay worker GPU** (necesita CUDA). Al no llegar `heartbeat:gpu-server`, el TrP
  activa el fallback: baja la dificultad a `"0"` y mina el worker CPU. Es el
  comportamiento buscado — el minado es rápido y no hace falta placa.
- El TrP loguea `Error escalando worker-cpu: [Errno 2] No such file or directory`
  porque intenta escalar el deployment vía la API de Kubernetes, que no existe fuera
  del cluster. `scale_cpu_workers()` lo captura y sigue; el worker-cpu ya está
  levantado por compose.

**GKE:** las imágenes las construye y despliega Pipeline 3
([.github/workflows/pipeline-3-apps.yml](../../.github/workflows/pipeline-3-apps.yml)); los
workers GPU van al cluster del profesor vía Pipeline 4. Manifiestos en
[k8s/gke/apps/](../../k8s/gke/apps/) y [k8s/profesor/](../../k8s/profesor/).

Dockerfiles: `Dockerfile.api` (NCT), `.trp`, `.cpu`, `.worker` (GPU, base `nvidia/cuda`).
