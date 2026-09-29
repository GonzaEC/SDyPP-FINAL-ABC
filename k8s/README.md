# Kubernetes — Manifiestos de despliegue

Manifiestos para dos clusters: el propio (OKE Always Free) y el del profesor (GPU).
El directorio se sigue llamando `k8s/gke/` por compatibilidad histórica —
los manifests son estándar y funcionan igual en OKE.

## Estructura

```
k8s/
├── gke/
│   ├── namespaces.yaml       # Namespace sdypp
│   ├── infra/                # Servicios base (infra node pool)
│   │   ├── redis-statefulset.yaml
│   │   ├── redis-service.yaml
│   │   ├── rabbitmq-statefulset.yaml
│   │   └── rabbitmq-service.yaml
│   └── apps/                 # Aplicaciones (apps node pool)
│       ├── frontend-deployment.yaml
│       ├── frontend-service.yaml
│       ├── nct-deployment.yaml
│       ├── nct-service.yaml
│       ├── trp-deployment.yaml
│       ├── worker-cpu-deployment.yaml
│       ├── postgres-statefulset.yaml
│       ├── postgres-service.yaml
│       ├── configmap.yaml
│       ├── secret.example.yaml
│       ├── ingress.yaml
│       └── managed-cert.yaml
└── profesor/                 # Cluster del profesor (GPU)
    ├── gpu-server-deployment.yaml
    └── worker-deployment.yaml
```

## Cluster propio (OKE Always Free)

**Nota importante sobre la arquitectura de pools**: OKE Always Free tiene un
único node pool ARM (`VM.Standard.A1.Flex`) con 4 nodos × 1 OCPU / 6 GB. La
separación en 3 "pools lógicos" (infra, apps, monitoring) se logra aplicando
**labels y taints por nodo** después del bootstrap. Ver la sección "Bootstrap
manual de labels/taints" más abajo.

### Capa infra (1 nodo etiquetado `pool=infra`, sin taint)

| Servicio | Réplicas | Persistencia | Exposición |
|----------|----------|-------------|-----------|
| **Redis** | 1 | PVC 1 GiB + AOF (StatefulSet) | ClusterIP :6379 |
| **RabbitMQ** | 1 | PVC 1 GiB (StatefulSet) | ClusterIP :5672, LoadBalancer :5672 (externo) |

Redis tiene AOF habilitado (`--appendonly yes`) para que la blockchain sobreviva reinicios.
Postgres, Redis y RabbitMQ son `StatefulSet` con `volumeClaimTemplates`: K8s crea un PVC por
réplica (`<volumen>-<statefulset>-<ordinal>`, p. ej. `postgres-storage-postgres-0`) y los
reutiliza entre reinicios.

### Capa apps (2 nodos etiquetados `pool=apps` con taint `apps=true:NoSchedule`)

| Servicio | Réplicas | Imagen | Puerto | Health check |
|----------|----------|--------|--------|-------------|
| **Frontend** | 2 | `frontend:SHA` | 3000 | `/api/health` |
| **NCT** | 2 | `blockchain-nct:SHA` | 8000 | `/status` |
| **TrP** | 1 | `blockchain-trp:SHA` | — | — |
| **Worker CPU** | 2 | `blockchain-worker-cpu:SHA` | — | — |
| **Postgres** | 1 | `postgres:17-alpine` | 5432 | — |

### Networking

- **Ingress** con `ingress-nginx` + `cert-manager` (Let's Encrypt) para HTTPS
  en `tesera.tech`.
- OCI **crea automáticamente un Flex Load Balancer** cuando el Service
  `ingress-nginx-controller` con `type: LoadBalancer` se aplica (usa la subnet
  `sdypp-lb-subnet`). La IP pública queda asignada al LB — la sacamos con
  `kubectl get svc -n ingress-nginx`.
- Frontend expuesto via NodePort → Ingress.
- NCT como ClusterIP (solo accesible dentro del cluster).
- Redis y RabbitMQ con LoadBalancer para que los workers del profesor se conecten.

### Bootstrap manual de labels/taints (una vez, tras `tofu apply`)

OKE Always Free entrega 4 nodos idénticos en un solo node pool. Los etiquetamos
por función para reproducir la arquitectura de 3 pools lógicos:

```bash
# Bajar kubeconfig
oci ce cluster create-kubeconfig \
  --cluster-id $(cd infra && tofu output -raw cluster_id) \
  --file ~/.kube/config \
  --region sa-santiago-1 \
  --token-version 2.0.0 \
  --kube-endpoint PUBLIC_ENDPOINT

# Listar los 4 nodos y elegir cuál va a cada rol
kubectl get nodes -o wide

# Ejemplo (reemplazar los NAME reales):
NODE1=<name-nodo-1>
NODE2=<name-nodo-2>
NODE3=<name-nodo-3>
NODE4=<name-nodo-4>

# 2 nodos para apps (frontend, NCT, TrP, worker-cpu, Postgres)
kubectl label node $NODE1 pool=apps
kubectl label node $NODE2 pool=apps
kubectl taint node $NODE1 apps=true:NoSchedule
kubectl taint node $NODE2 apps=true:NoSchedule

# 1 nodo para infra (Redis, RabbitMQ) — SIN taint para que los addons de
# kube-system tengan landing zone.
kubectl label node $NODE3 pool=infra

# 1 nodo para monitoring (LGTM stack)
kubectl label node $NODE4 pool=monitoring
kubectl taint node $NODE4 monitoring=true:NoSchedule
```

### Bootstrap de ingress-nginx + cert-manager (una vez)

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --set controller.service.type=LoadBalancer \
  --set controller.service.annotations."oci\.oraclecloud\.com/load-balancer-type"=lb

# cert-manager (CRDs + controller)
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --set crds.enabled=true

# Sacar la IP publica que OCI le asignó al LB
kubectl get svc -n ingress-nginx ingress-nginx-controller

# Apuntar el A record de tesera.tech a esa IP en el DNS.
```

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
sed -i "s|IMAGE_TAG|scl.ocir.io/<namespace>/IMAGEN:SHA|g" *.yaml
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
