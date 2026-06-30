# Pilar 2 / P4 — NCT endurecido

Cuarta iteración. El nodo coordinador se renombra a **NCT** (Nodo Coordinador de Tareas) y se
endurece para correr con réplicas y sobrevivir fallas. Mantiene la arquitectura distribuida de
[P3](../P3/) (RabbitMQ + Redis) pero le agrega correctitud y resiliencia.

> Para la evolución completa P1→P5 ver [Pilar2/README.md](../README.md).
> La versión de producción (con TrP, fallback CPU y tickets) es [P5](../P5/).

## Qué agrega sobre P3

- **Lock distribuido de minado** (`minando` en Redis): evita que dos réplicas del NCT minen el
  mismo bloque a la vez. Patrón Redlock simplificado (`SET NX EX` con token + release con Lua).
- **Verificación de hash**: el NCT recalcula el MD5 de la solución del worker antes de aceptarla
  — no confía en el valor reportado.
- **Almacenamiento dual**: cada bloque va a la lista `blockchain` (orden) y a un hash
  `block:{index}` (acceso O(1) por índice).
- **Dificultad dinámica**: `POST /difficulty` ajusta el prefijo de ceros exigido.
- **Reconexión automática** a RabbitMQ ante caídas de conexión.

## Componentes

| Archivo | Servicio | Rol |
|---------|----------|-----|
| [nct.py](nct.py) | **NCT** (FastAPI :8000) | API REST, minería coordinada, lock, verificación |
| [worker.py](worker.py) | **Worker GPU** | Consume `tareas`, delega al gpu-server |
| [gpu-server.py](gpu-server.py) | **gpu-server** (FastAPI) | Wrapper HTTP del binario CUDA |
| [brute_force_range.cu](brute_force_range.cu) | binario CUDA | Brute-force MD5 en un rango de nonces |

Infra: **Redis** (blockchain, lock, pendientes) y **RabbitMQ** (colas `tareas` / `soluciones`).

## Endpoints principales

| Método | Ruta | Función |
|--------|------|---------|
| POST | `/transaction` | Agrega una tx al pool de pendientes |
| POST | `/create-block` | Dispara el minado de un bloque con las pendientes |
| GET | `/blockchain` · `/block/{i}` · `/validate` | Consultar la cadena |
| GET/POST | `/difficulty` | Leer / fijar la dificultad |

## Cómo correr (Kubernetes)

```bash
cd k8s
kubectl apply -R -f .
kubectl port-forward service/blockchain-nct 8000:80
# API: http://localhost:8000/docs
```

Manifiestos en [`k8s/`](k8s/): `api/`, `worker/`, `gpu/`, `rabbitmq/`, `redis/`.
Imágenes: `Dockerfile.api` (NCT) y `Dockerfile.worker` (worker GPU).
