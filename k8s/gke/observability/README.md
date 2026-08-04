# Observabilidad — stack LGTM self-hosted

Stack de observabilidad de los 4 pilares para la plataforma, desplegado en el
propio cluster GKE (namespace `observability`, node pool dedicado `monitoring`).

| Pilar | Herramienta | Cómo llega la señal |
|-------|-------------|---------------------|
| Métricas | **Prometheus** + **Grafana** | scrape de `/metrics` por annotations `prometheus.io/*` |
| Logs | **Loki** + **Alloy** | Alloy (DaemonSet) tail-ea `/var/log/pods` → Loki |
| Trazas | **Tempo** + OpenTelemetry | servicios → OTLP → Alloy → Tempo |
| Alertas | **Alertmanager** | reglas en Prometheus (`alerts.yaml`) |

Exporters: `redis_exporter`, `postgres_exporter`, plugin `rabbitmq_prometheus`,
`kube-state-metrics`, `node-exporter`.

## Despliegue

1. **Infra** (una vez): aplicar Terraform para crear el node pool `monitoring`
   (`infra/gke.tf`). Sin él, los pods quedan `Pending` por el taint.
   ```bash
   cd infra && tofu apply
   ```
2. **Stack**: vía Pipeline 5 (push a `k8s/gke/observability/**` o `workflow_dispatch`),
   o a mano:
   ```bash
   kubectl apply -f k8s/gke/observability/namespace.yaml
   kubectl apply -f k8s/gke/observability/rbac.yaml
   kubectl apply -f k8s/gke/observability/
   ```

## Acceso

Nada se expone públicamente. Port-forward:
```bash
kubectl -n observability port-forward svc/grafana 3001:3000      # Grafana  → http://localhost:3001 (admin/admin)
kubectl -n observability port-forward svc/prometheus 9090:9090    # Prometheus
kubectl -n observability port-forward svc/alertmanager 9093:9093  # Alertmanager
```
En Grafana ya vienen provisionados los 3 datasources y el dashboard
**Tesera — Blockchain & Minería**.

## Local (sin cluster)

Desde la **raíz del repo**:
```bash
docker compose up --build
```
Levanta el sistema completo —app, blockchain e infra— con el stack de observabilidad
en un solo compose. Grafana en http://localhost:3001. Configs en `observability/local/`.

## Instrumentación en el código

- **Python** (NCT/TrP/workers/gpu-server): módulo `Pilar2/P5/observability.py`
  (logging JSON, métricas `prometheus_client`, trazas OTel con propagación por
  RabbitMQ embebida en el payload `_trace`).
- **Frontend**: `app/src/lib/observability/{metrics,log}.ts`,
  `app/src/app/api/metrics/route.ts`, `app/src/instrumentation.ts` (`@vercel/otel`).

## Sincronización de relojes (NTP)

Los servicios distribuidos (NCT, TrP, workers) dependen de que los relojes de los
nodos estén alineados — sobre todo para las mediciones de latencia
(`worker_task_queue_latency_seconds`) y los timeouts del NCT. No hace falta
provisionar un daemon NTP propio:

- Los nodos **GKE (COS)** ya sincronizan con **`systemd-timesyncd`** contra el
  servidor NTP interno de Google (`metadata.google.internal`, 169.254.169.254).
- **node-exporter** corre como DaemonSet en todos los nodos con su collector
  `timex` habilitado por defecto, que expone el **drift del kernel**:
  - `node_timex_offset_seconds` → desvío actual (deriva), en segundos.
  - `node_timex_status` → bit `0x0040` despejado = reloj **sincronizado**;
    set = `STA_UNSYNC`.

Verificación con Prometheus (port-forward `9090:9090`):

```promql
# Desvío por nodo (debería estar en el orden de los µs/ms)
node_timex_offset_seconds{cluster="sdypp"}

# Nodos desincronizados
count(node_timex_status & 0x0040 > 0) by (node)
```

No hay reloj único que derive: es sin estado y desacoplado. Si alguna vez hiciera
falta un pool de NTP propio (p. ej. nodos que no pasan por la red de GKE), se puede
documentar/comprobar con `chrony` y monitorear su `reachability`; hoy no aplica.

## Limitación conocida: workers GPU (cluster del profesor)

Los workers GPU y el `gpu-server` corren en el **cluster del profesor**, en otra
red. El Prometheus de GKE **no** los alcanza para scrapear `/metrics` (solo hay
LoadBalancer para Redis/RabbitMQ). Sus deployments ya están anotados, pero para
verlos en Grafana habría que correr un Alloy/Prometheus-agent del lado del
profesor con `remote_write` al Prometheus de GKE. Mientras tanto, su actividad
se infiere por las métricas que el NCT/TrP derivan de RabbitMQ y los heartbeats
(`trp_gpu_alive`, soluciones por `worker_type`).
