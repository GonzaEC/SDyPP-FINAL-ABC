# Infraestructura — Terraform/OpenTofu contra Hetzner Cloud

IaC declarativa del cluster productivo: un VPS Hetzner Cloud con k3s single-node
que se auto-configura al boot via cloud-init. Ejecutable con `tofu apply` desde
local o a traves de Pipeline 1.

## Recursos provisionados

| Recurso | Descripcion |
|---|---|
| `hcloud_ssh_key.main` | Sube la clave SSH publica al proyecto de Hetzner. |
| `hcloud_firewall.main` | Firewall de perimetro. Solo abre: 22 (SSH), 6443 (k8s API), 80 (HTTP), 443 (HTTPS), 5671 (AMQPS RabbitMQ), 6379 (Redis). |
| `hcloud_server.cluster` | El VPS (default: `cpx32` en `nbg1`, Ubuntu 24.04). Al bootear ejecuta `cloud-init` que instala k3s, etiqueta el nodo con `pool=apps` y crea el namespace `sdypp`. |

**Arquitectura**: un solo servidor que corre k3s con Traefik built-in como
ingress controller. Todo el stack (frontend, NCT, TrP, workers, Postgres,
Redis, RabbitMQ, LGTM) queda en el mismo nodo. Los servicios que necesitan
exponerse (Ingress HTTPS, Redis y RabbitMQ para los workers GPU del profe)
salen por los puertos abiertos en el firewall.

## Archivos

| Archivo | Contenido |
|---|---|
| `providers.tf` | Provider `hetznercloud/hcloud ~> 1.48` |
| `backend.tf` | State local (para CI/CD colaborativo migrar a Hetzner Object Storage) |
| `variables.tf` | hcloud_token, server_name, server_type, location, image, ssh_public_key, domain |
| `terraform.tfvars.example` | Ejemplo de valores para copiar y editar |
| `server.tf` | Server + firewall + SSH key + cloud-init de bootstrap de k3s |
| `outputs.tf` | IPv4/IPv6 publicas + hints para SSH y kubeconfig |

## Bootstrap (una sola vez)

### 1. Obtener API token de Hetzner
Consola Hetzner Cloud → tu proyecto → `Security` → `API Tokens` → **Generate API Token**
con permisos `Read & Write`. Copiar (se muestra una sola vez).

### 2. Generar SSH keypair (o reusar `oke_nodes`)
```powershell
ssh-keygen -t rsa -b 4096 -f "$HOME\.ssh\oke_nodes" -N '""'
```

### 3. Crear `terraform.tfvars`
```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
```

Editar con el token y el contenido de `~/.ssh/oke_nodes.pub`.

## Aplicar

```bash
cd infra
tofu init
tofu plan -out=plan.tfplan
tofu apply plan.tfplan
```

Tarda ~30-60 seg (crea el firewall, la key y el server). El `cloud-init` de
k3s puede tardar 1-2 min mas en terminar dentro del server. Chequeo:

```bash
ssh -i ~/.ssh/oke_nodes root@$(tofu output -raw server_ipv4) 'kubectl get nodes'
```

Cuando el nodo aparezca `Ready`, bajar el kubeconfig:

```bash
tofu output -raw kubeconfig_hint | sh
export KUBECONFIG=~/.kube/config-hetzner
kubectl get nodes
```

## Secrets a cargar en GitHub tras el primer apply

Para que los pipelines corran:

| Secret | Valor |
|---|---|
| `HCLOUD_TOKEN` | El API token de Hetzner |
| `SSH_PUBLIC_KEY` | Contenido de `~/.ssh/oke_nodes.pub` |
| `KUBE_CONFIG_HETZNER` | `cat ~/.kube/config-hetzner \| base64 -w0` |
| `DOCKERHUB_USERNAME` | `gonzaec` |
| `DOCKERHUB_TOKEN` | PAT de Docker Hub con permisos `Read, Write, Delete` |

Ver `.github/workflows/README.md` para la lista completa (incluye los secrets
de la app: MP, Cloudinary, RabbitMQ TLS).

## Costos

CPX32 en Nuremberg: **~€7.05/mes** (~$0.01/hora prorrateado). El server se
puede apagar sin destruirlo desde el dashboard de Hetzner (siguen los cobros
del disco), o destruir por completo con `tofu destroy` (pierde el state,
los PVCs y las imagenes locales de k3s).

## Diferencia vs la arquitectura declarada en el TP

Los ADRs 019-024 y el checklist §3 describen un cluster Kubernetes con **3
node pools** (`apps`, `infra`, `monitoring`) con taints y tolerations
imponiendo la separacion de cargas. En un VPS Hetzner single-node esa
separacion es fisica imposible; la mantenemos declarada en los YAMLs (labels
y taints en los manifests, comentarios en el codigo) como intencion
arquitectonica, y la explicamos en [ADR-029](../app/docs/adr/029-deploy-iteracion-gcp-oci-hetzner.md).

Para una re-provision con multiples nodos alcanza con cambiar el server_type
a algo mas grande o mover a un k3s multi-node (agregando `hcloud_server`
extras y configurando el `K3S_TOKEN`). Los manifests actuales seguirian
funcionando.
