# Pilar 2 — Blockchain Distribuida con Proof of Work

Construcción iterativa de una blockchain con minería distribuida, desde un nodo monolítico
hasta un sistema con colas de mensajes, persistencia, GPU/CPU fallback y soporte de tickets.

## Evolución por práctica

### P1 — Nodo monolítico

Un solo proceso FastAPI que acepta transacciones, mina bloques localmente invocando un
binario CUDA, y mantiene la cadena en memoria.

```
Cliente → main.py (API + minería + blockchain)
```

### P2 — Minería distribuida con RabbitMQ

Separa la minería del nodo coordinador. La API (`consumidor.py`) subdivide el rango de nonces
en 4 partes y publica tareas en RabbitMQ. Workers (`worker.py`) consumen tareas y delegan
el cómputo al `gpu-server.py` (HTTP wrapper del binario CUDA).

```
API → [tareas] → Workers → gpu-server (CUDA) → [soluciones] → API
```

### P3 — Persistencia en Redis

Misma arquitectura que P2, pero la blockchain, transacciones pendientes y logs se persisten
en Redis. La cadena sobrevive reinicios del nodo.

### P4 — NCT hardened

El nodo se renombra a **NCT** (Nodo Coordinador de Tareas). Cambios principales:

- **Lock distribuido** en Redis (`minando`) evita que dos réplicas minen simultáneamente.
- **Verificación de hash**: el NCT recalcula el MD5 antes de aceptar la solución del worker.
- **Almacenamiento dual**: bloques en lista `blockchain` + hash `block:{index}` para O(1) access.
- **Dificultad dinámica** via `POST /difficulty`.
- **Reconexión automática** a RabbitMQ.

### P5 — TrP, CPU fallback y tickets (versión final)

La versión que corre en producción. Agrega:

- **TrP (Transaction Pool)**: intermediario que subdivide tareas grandes en chunks de 2.5M
  nonces y las distribuye a los workers.
- **Monitor de GPU**: el TrP chequea heartbeats del gpu-server cada 15s. Si la GPU muere,
  reduce la dificultad a `"0"` y activa workers CPU como fallback.
- **Worker CPU** (`worker_cpu.py`): minero puro Python, sin GPU. Respaldo cuando no hay GPU.
- **Auto-miner**: thread de fondo en el NCT que dispara `create-block` automáticamente
  cuando hay transacciones pendientes (cada 3s).
- **Endpoints ticket-aware**: `POST /tx/mint`, `POST /tx/transfer`, `GET /ops/{op_id}`,
  `GET /tickets/{id}/owner` — con verificación de firma ECDSA P-256.
- **Ownership index** en Redis: `ticket_owner:{id}`, `owner_tickets:{pubkey}`.

## Arquitectura final (P5)

```
                         ┌─────────────┐
                         │   Cliente   │
                         │  (app web)  │
                         └──────┬──────┘
                                │ HTTP
                         ┌──────┴──────┐
                         │     NCT     │  ←→  Redis (blockchain, ownership, logs)
                         │  (FastAPI)  │
                         └──────┬──────┘
                                │ RabbitMQ [tareas_pool]
                         ┌──────┴──────┐
                         │     TrP     │  ←→  Redis (heartbeats GPU)
                         │  (Python)   │
                         └──────┬──────┘
                                │ RabbitMQ [tareas] (chunks de 2.5M)
                    ┌───────────┼───────────┐
                    │           │           │
              ┌─────┴─────┐ ┌──┴──┐  ┌─────┴─────┐
              │ Worker GPU│ │ ... │  │ Worker CPU│
              │ → gpu-srv │ │     │  │ (Python)  │
              │ → CUDA bin│ │     │  │ hashlib   │
              └─────┬─────┘ └──┬──┘  └─────┬─────┘
                    │          │           │
                    └──────────┼───────────┘
                               │ RabbitMQ [soluciones]
                         ┌─────┴──────┐
                         │    NCT     │ → verifica hash → guarda bloque
                         └────────────┘
```

## Archivos clave

| Archivo | Función |
|---------|---------|
| `P5/nct.py` | Nodo coordinador — API REST, auto-miner, ownership, firma ECDSA |
| `P5/trp.py` | Task router — subdivide tareas, monitorea GPU, fallback CPU |
| `P5/worker.py` | Worker GPU — consume tareas, delega a gpu-server |
| `P5/worker_cpu.py` | Worker CPU — minero Python puro (fallback) |
| `P5/gpu-server.py` | HTTP wrapper del binario CUDA de minería |

## Cómo correr (Docker Compose)

```bash
docker compose up
```

Esto levanta: NCT, TrP, Redis, RabbitMQ, worker-cpu. Para GPU se necesita `nvidia-docker`.
