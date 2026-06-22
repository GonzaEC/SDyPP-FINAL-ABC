# Kubernetes — Manifiestos de despliegue

Manifiestos para dos clusters: el propio (GKE) y el del profesor (GPU).

## Estructura

```
k8s/
├── gke/
│   ├── namespaces.yaml       # Namespace sdypp
│   ├── infra/                # Servicios base (infra node pool)
│   │   ├── redis-deployment.yaml
│   │   ├── redis-pvc.yaml
│   │   ├── redis-service.yaml
│   │   ├── rabbitmq-deployment.yaml
│   │   └── rabbitmq-service.yaml
│   └── apps/                 # Aplicaciones (apps node pool)
│       ├── frontend-deployment.yaml
│       ├── frontend-service.yaml
│       ├── nct-deployment.yaml
│       ├── nct-service.yaml
│       ├── trp-deployment.yaml
│       ├── worker-cpu-deployment.yaml
│       ├── postgres-deployment.yaml
│       ├── postgres-pvc.yaml
│       ├── postgres-service.yaml
│       ├── configmap.yaml
│       ├── secret.example.yaml
│       ├── ingress.yaml
│       └── managed-cert.yaml
└── profesor/                 # Cluster del profesor (GPU)
    ├── gpu-server-deployment.yaml
    └── worker-deployment.yaml
```

## Cluster propio (GKE)

### Capa infra (node pool `infra`, 1 nodo e2-medium)

| Servicio | Réplicas | Persistencia | Exposición |
|----------|----------|-------------|-----------|
| **Redis** | 1 | PVC 1 GiB + AOF | ClusterIP :6379 |
| **RabbitMQ** | 1 | — (efímero) | ClusterIP :5672, LoadBalancer :5672 (externo) |

Redis tiene AOF habilitado (`--appendonly yes`) para que la blockchain sobreviva reinicios.

### Capa apps (node pool `apps`, 2 nodos e2-medium spot)

| Servicio | Réplicas | Imagen | Puerto | Health check |
|----------|----------|--------|--------|-------------|
| **Frontend** | 2 | `frontend:SHA` | 3000 | `/api/health` |
| **NCT** | 2 | `blockchain-nct:SHA` | 8000 | `/status` |
| **TrP** | 1 | `blockchain-trp:SHA` | — | — |
| **Worker CPU** | 2 | `blockchain-worker-cpu:SHA` | — | — |
| **Postgres** | 1 | `postgres:17-alpine` | 5432 | — |

### Networking

- **Ingress** con GKE Managed Certificate para HTTPS en `tesera.tech`.
- IP estática global `frontend-ip` (34.160.1.16).
- Frontend expuesto via NodePort → Ingress.
- NCT como ClusterIP (solo accesible dentro del cluster).
- Redis y RabbitMQ con LoadBalancer para que los workers del profesor se conecten.

### ConfigMap (`app-config`)

```
DATABASE_URL=postgres://entradas:entradas@postgres:5432/entradas
NCT_URL=http://blockchain-nct
RABBITMQ_HOST=rabbitmq
REDIS_HOST=redis
MP_PUBLIC_URL=https://tesera.tech
```

### Secrets (`app-secrets`)

- `SESSION_PASSWORD`: clave para iron-session (mín. 32 chars).
- `MP_ACCESS_TOKEN`: token de MercadoPago.

**No commitear `secret.yaml` con valores reales.** Usar `secret.example.yaml` como template.

### Patrón IMAGE_TAG

Los deployments usan `IMAGE_TAG` como placeholder de imagen. Pipeline 3 reemplaza esto
con `sed` antes de aplicar:

```bash
sed -i "s|IMAGE_TAG|us-central1-docker.pkg.dev/PROYECTO/sdypp/IMAGEN:SHA|g" *.yaml
kubectl apply -f .
```

Para deploy manual:
```bash
kubectl set image deployment/frontend frontend=IMAGEN:TAG -n sdypp
```

## Cluster del profesor (GPU)

| Servicio | Réplicas | GPU | Conexión |
|----------|----------|-----|----------|
| **GPU Server** | 1 | 1× nvidia.com/gpu | Redis externo |
| **Worker** | 4 | — | RabbitMQ externo, GPU Server interno |

Los workers se conectan a nuestro Redis/RabbitMQ via IPs externas hardcodeadas en los yamls.
Si las IPs cambian (por recrear los LoadBalancers), hay que actualizar los yamls.

## Cómo aplicar

```bash
# Infra
kubectl apply -f k8s/gke/namespaces.yaml
kubectl apply -f k8s/gke/infra/

# Apps (con imágenes reales)
kubectl apply -f k8s/gke/apps/

# Profesor
kubectl apply -f k8s/profesor/ --kubeconfig=profesor.kubeconfig
```
