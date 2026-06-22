# ADR-019: Deploy en GKE con dos clusters (propio + profesor)

**Estado:** Accepted
**Fecha:** 2026-06-22

## Contexto

El TP requiere demostrar minería con GPU reales. Nuestro cluster GKE usa nodos `e2-medium`
(sin GPU). El profesor pone a disposición un cluster con nodos GPU (Tesla T4) para que los
equipos desplieguen sus workers de minería.

Necesitamos una arquitectura donde la app y la blockchain corran en nuestro cluster, pero los
workers GPU corran en el del profesor, comunicándose con nuestros servicios.

## Decisión

Usamos **dos clusters de Kubernetes**:

1. **Cluster propio (GKE):** corre todo el stack (frontend, Postgres, NCT, TrP, worker-cpu,
   Redis, RabbitMQ). Nodos spot `e2-medium` en `us-central1-a`.
2. **Cluster del profesor:** corre `gpu-server` (1 pod con GPU) y `worker` (4 réplicas).
   Se conectan a nuestro Redis y RabbitMQ via IPs externas (LoadBalancer).

La comunicación entre clusters es via RabbitMQ (tareas/soluciones) y Redis (heartbeats, estado).
Los workers del profesor consumen tareas de la cola `tareas` y publican soluciones en `soluciones`.

## Consecuencias

### Positivas
- Los workers GPU minan bloques reales con PoW usando CUDA.
- La app no depende del cluster del profesor para funcionar (worker-cpu como fallback).
- Cada equipo gestiona su propio cluster sin interferir con el del profesor.

### Negativas
- Redis y RabbitMQ necesitan IPs externas (LoadBalancer), consumiendo quota de IPs.
- Las IPs hardcodeadas en los yamls del profesor cambian si se recrean los services.
- Latencia de red entre clusters agrega tiempo al ciclo de minado.

### Abiertas
- Si el profesor recicla su cluster, hay que re-deployar los yamls con `kubectl apply`.

## Alternativas consideradas

### A. Todo en un solo cluster con GPU
No es posible: GKE no ofrece GPUs en el free tier y el costo es prohibitivo para un TP.

### B. Workers GPU corriendo fuera de K8s (bare metal / Colab)
Más difícil de gestionar, no demuestra orquestación con K8s que pide la materia.
