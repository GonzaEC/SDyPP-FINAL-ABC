# CI/CD — GitHub Actions Pipelines

Cinco pipelines que despliegan el sistema al cluster productivo (k3s single-node
sobre VPS Hetzner) y al cluster del profesor (workers GPU). Todos gatean por
**Gitleaks** (secret scanning) antes de ejecutar.

## Pipelines

### Pipeline 1 — Infraestructura (`pipeline-1-infra.yml`)

**Trigger:** push a `infra/**` (corre `tofu plan`), o `workflow_dispatch` con
`action=apply` para aplicar de verdad.

Provisiona el VPS Hetzner con OpenTofu:
1. Autentica contra la API de Hetzner con `HCLOUD_TOKEN`.
2. `tofu init` → `tofu plan` (siempre) → `tofu apply` (solo en dispatch manual).
3. Crea/actualiza: `hcloud_ssh_key`, `hcloud_firewall` (puertos 22/6443/80/443/5671/6379),
   `hcloud_server` (CPX32 con `cloud-init` que instala k3s, labelea el nodo con
   `pool=apps` y crea el namespace `sdypp`).

El apply queda detrás de `workflow_dispatch` para no recrear el server por
accidente en cada push (perderíamos los PVCs locales de k3s).

### Pipeline 2 — Servicios base (`pipeline-2-services.yml`)

**Trigger:** manual (`workflow_dispatch`), push a `k8s/gke/infra/**`, o después
de Pipeline 1.

Despliega los servicios de infraestructura al cluster k3s:
1. Baja el kubeconfig del cluster desde `KUBE_CONFIG_HETZNER` (base64).
2. `kubectl apply` de `k8s/gke/namespaces.yaml`.
3. Crea el secret `rabbitmq-tls` desde `RABBITMQ_TLS_CERT_B64` + `RABBITMQ_TLS_KEY_B64`.
4. `kubectl apply -f k8s/gke/infra/` (Redis + RabbitMQ).

### Pipeline 3 — Aplicaciones (`pipeline-3-apps.yml`)

**Trigger:** push a `app/**`, `Pilar2/P5/**`, o `k8s/gke/apps/**`.

El pipeline principal de la app:
1. **Build en paralelo** de 4 imágenes Docker (linux/amd64 nativo):
   - `frontend` (Next.js)
   - `blockchain-nct` (FastAPI)
   - `blockchain-trp` (Python)
   - `blockchain-worker-cpu` (Python)
2. **Push** a Docker Hub público (`docker.io/<DOCKERHUB_USERNAME>/*`) con tag
   `github.sha` y `latest`.
3. **Deploy**: baja el kubeconfig, sincroniza `app-secrets`, reemplaza
   `IMAGE_TAG` en los yamls con la ruta real de Docker Hub y aplica con `kubectl`.

### Pipeline 4 — GPU Workers (`pipeline-4-gpu-workers.yml`)

**Trigger:** push a `Pilar2/P5/gpu-server.py`, `Pilar2/P5/worker.py`,
`Pilar2/P5/Dockerfile.worker`, o `k8s/profesor/**`.

Despliega al cluster del profesor:
1. Build de la imagen `blockchain-worker-gpu` (x86 nativo).
2. Push a Docker Hub.
3. Deploy al cluster externo usando `KUBE_CONFIG_PROFESOR` (secret base64).

### Pipeline 5 — Observabilidad (`pipeline-5-observability.yml`)

**Trigger:** push a `k8s/gke/observability/**`, manual, o después de Pipeline 1.

Despliega el stack LGTM (Prometheus, Grafana, Loki, Tempo, Alloy, Alertmanager,
exporters):
1. Baja el kubeconfig del cluster k3s.
2. Aplica `namespace.yaml` + `rbac.yaml` primero (los otros recursos viven en
   el ns `observability`).
3. `kubectl apply -f k8s/gke/observability/` con el resto.
4. Espera el rollout de Prometheus y Grafana (timeout 5 min por si el nodo
   tiene que bajar las imágenes por primera vez).

### Gitleaks (`gitleaks.yml`)

**Workflow reutilizable** que escanea el historial de git completo buscando
secrets (API keys, tokens, passwords). Llamado como gate por todos los otros
pipelines.

## Flujo de despliegue

```
Push a infra/     → P1 (tofu plan; apply solo en dispatch manual)
Push a app/       → P3 (build 4 imágenes → push Docker Hub → deploy a k3s)
Push a Pilar2/P5/ → P3 + P4 (deploy a k3s + Profesor)
Push a k8s/       → P2 o P3 o P5 según el subdirectorio
```

## Secrets necesarios en GitHub

### De Hetzner + kubeconfig

| Secret | Uso |
|--------|-----|
| `HCLOUD_TOKEN` | API token del proyecto Hetzner (Read & Write). Pipeline 1. |
| `SSH_PUBLIC_KEY` | Contenido de `~/.ssh/oke_nodes.pub`. Pipeline 1. |
| `KUBE_CONFIG_HETZNER` | Kubeconfig del cluster k3s en base64. Pipelines 2, 3, 5. |
| `KUBE_CONFIG_PROFESOR` | Kubeconfig del cluster GPU del profesor en base64. Pipeline 4. |

### De Docker Hub

| Secret | Uso |
|--------|-----|
| `DOCKERHUB_USERNAME` | Usuario (`gonzaec`). Pipelines 3, 4. |
| `DOCKERHUB_TOKEN` | Personal Access Token con permisos Read/Write/Delete. Pipelines 3, 4. |

### De la app y stack

| Secret | Uso |
|--------|-----|
| `MP_ACCESS_TOKEN` | Token MercadoPago. Sincronizado en `app-secrets` por P3. |
| `SESSION_PASSWORD` | Iron-session key (≥32 chars). Sincronizado en `app-secrets` por P3. |
| `RABBITMQ_TLS_CERT_B64` | Cert TLS de RabbitMQ (base64). Sincronizado por P2. |
| `RABBITMQ_TLS_KEY_B64` | Key TLS de RabbitMQ (base64). Sincronizado por P2. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Build arg del frontend en P3. |
| `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` | Build arg del frontend en P3. |

## Comandos útiles para cargar secrets

Con `gh` CLI logueado:

```bash
# HCLOUD y Docker Hub
gh secret set HCLOUD_TOKEN
gh secret set DOCKERHUB_USERNAME --body "gonzaec"
gh secret set DOCKERHUB_TOKEN

# Kubeconfigs en base64
cat ~/.kube/config-hetzner | base64 -w0 | gh secret set KUBE_CONFIG_HETZNER
cat kubeconfig-profesor.yaml | base64 -w0 | gh secret set KUBE_CONFIG_PROFESOR

# SSH pub key
gh secret set SSH_PUBLIC_KEY < ~/.ssh/oke_nodes.pub
```
