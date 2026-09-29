# ADR-029: Deploy productivo — iteración GCP → OCI → Hetzner + k3s

**Estado**: Accepted
**Fecha**: 2026-09-28 (revisado 2026-09-29)

## Contexto

Entre agosto y septiembre de 2026 el deploy pasó por tres proveedores distintos antes de
llegar a un stack productivo estable. Este ADR documenta el recorrido y las restricciones
que cerraron cada opción, porque cambia la infraestructura descrita en el resto de los
documentos del repo (ADRs 019, 020, 023, 024).

Los ADRs previos ([ADR-019](019-deploy-gke-dos-clusters.md), [ADR-020](020-https-gke-managed-cert.md),
[ADR-023](023-iac-terraform-gcp.md), [ADR-024](024-ci-cd-cuatro-pipelines.md)) describen el
plan original: GKE con dos node pools tainted, IaC en Terraform contra GCP, HTTPS con Managed
Certificate, 4 pipelines de GitHub Actions autenticados por Workload Identity Federation. Ese
stack funcionó y estuvo en producción durante julio-agosto de 2026 en `tesera.tech`.

## Decisión

El deploy productivo actual corre en **un VPS Hetzner Cloud CPX32** (Nuremberg, 4 vCPU AMD /
8 GB / 160 GB SSD) con **k3s single-node**. Las imágenes se publican en **Docker Hub público**
(`gonzaec/*`). El TLS de `tesera.tech` se emite con **cert-manager + Let's Encrypt** sobre el
**Traefik built-in de k3s**.

**La IaC y los 5 pipelines se reescribieron a este stack** (provider `hetznercloud/hcloud`,
auth por kubeconfig base64, registry Docker Hub). Son ejecutables, no aspiracionales.

## Recorrido y por qué cada opción se cerró

### 1. GCP (julio 2026, deploy original — ADR-019 a ADR-024)
Funcionó bien. Se agotaron los créditos del free trial y la cuenta se eliminó el 2026-07-27
para evitar seguir consumiendo. Volver a GCP requiere tarjeta y un prepago mínimo de USD 30
que fue rechazado por el banco emisor cuando se intentó reactivar. Descartado.

### 2. Azure for Students (2026-08-06, intento)
$100 de crédito sin tarjeta vía GitHub Student Pack. Se reescribió toda la infra a `azurerm` y
los pipelines a `azure/login`. Bloqueado en Azure Kubernetes Service por dos capas de
restricciones:

- Region policy: solo `eastus` habilitada; el resto rechaza la creación con
  `RequestDisallowedByAzure`.
- Cuota de vCPUs para todas las familias v7 (las únicas que AKS acepta en Students en `eastus`)
  fija en 0, con la solicitud de aumento rechazada automáticamente.

La intersección de "SKUs que AKS Students acepta" ∩ "SKUs con cuota > 0" quedó vacía.
Descartado.

### 3. Oracle Cloud Infrastructure OKE Always Free (2026-08-07 al 2026-09-28)
4 OCPU ARM Ampere A1 + 24 GB RAM sin límite de tiempo. Se reescribió otra vez la infra a
`oracle/oci`, se adaptaron los pipelines a `oracle-actions/configure-oci-cli`, se agregó
buildx multi-arch para producir imágenes ARM64. El cluster OKE Basic se creó sin problemas
en `sa-santiago-1` (única región que la policy de Students permite en la práctica), pero la
creación del node pool falló repetidamente con `Out of host capacity` — el problema conocido
de OCI de tener sobrevendida la capacidad Ampere en LATAM. Con 15+ intentos de retry en 45
minutos, distintos tamaños de instancia (4×1 OCPU, 2×2 OCPU, 1×1 OCPU) y las tres regiones
disponibles para la tenancy (eastus, canadacentral, brazilsouth), no hubo un solo slot
disponible.

### 4. Hetzner Cloud + k3s (2026-09-28, actual)
Un VPS pago de €7/mes con Ubuntu 24.04 e instalación de k3s con un solo comando. Sin cuotas,
sin capacity limits, sin espera de aprobación. Ejecución del deploy end-to-end en ~2 horas
desde signup hasta `https://tesera.tech` con TLS válido de Let's Encrypt.

## Consecuencias

### Positivas
- **El sistema está vivo y demostrable** para la defensa, cosa que ninguna opción free lograba.
- **La IaC volvió a ser ejecutable end-to-end**: `tofu apply` provisiona el server con
  cloud-init que instala k3s automáticamente. Reproducir el deploy desde cero es un comando.
- **k3s single-node es más simple**: sin pools, sin taints, sin coordinación entre nodos.
  Todo el debug pasa por un único `kubectl logs` y `journalctl` del server.
- **Traefik built-in** ahorra la instalación de ingress-nginx y su `LoadBalancerIP`.
- **Docker Hub público** para las imágenes elimina la fricción de OCIR/ACR auth tokens y
  simplifica el pipeline mental del deploy.
- El costo real es marginal (~USD 10 por semana; el server se puede apagar cuando no
  se lo necesita).

### Negativas
- **Un solo nodo ≠ arquitectura de 3 pools con taints**. Los ADRs 019 y 024 hablan de
  separación impuesta de cargas con `apps=true:NoSchedule` y `monitoring=true:NoSchedule`;
  en este deploy los taints no se aplican porque no hay nodos donde imponerlos. Los manifests
  colapsaron todos los `nodeSelector` a `pool=apps`. La documentación del checklist §3 sigue
  siendo válida como intención arquitectónica pero no describe el runtime.
- **El HPA solo escala hasta el techo del VPS** (4 vCPU). Sirve para demostrar el mecanismo,
  no para carga real.
- **Sin backup ni HA del cluster**: si el VPS muere, hay que reprovisionar desde cero. Los PVCs
  de `local-path` viven en el disco del server, no en storage replicado.
- **El cert TLS del RabbitMQ es self-signed**, generado con `docker run alpine/openssl` para
  el AMQPS del puerto 5671. Los workers del cluster del profesor tienen que aceptarlo
  explícitamente o hacer skip verification.
- **Pipeline 1 apply queda detrás de `workflow_dispatch` manual**, no auto en push. Motivo:
  un `tofu apply` accidental recreando el server borraría los PVCs y todo el estado local
  de k3s. Se prefiere pagar el costo de un `apply` manual antes que un reset por accidente.

### Abiertas
- **Migrar el state de Terraform a Hetzner Object Storage** (S3-compatible) para que
  Pipeline 1 pueda hacer `apply` idempotente y colaborativo. Hoy el state es local del
  runner o de la laptop del que corre `tofu`.
- **Escalar a k3s multi-node** si aparece la necesidad: agregar 2-3 `hcloud_server` extras
  como agents apuntando al mismo `K3S_TOKEN`, recuperando la arquitectura de 3 pools con
  labels y taints reales.
- **Migrar el deploy** al cluster del profesor (namespace `sdypp-gonza` en su k3s) queda
  como path alternativo si Hetzner falla antes de la defensa.

## Alternativas consideradas

### Cluster del profesor
El profe ya tiene un k3s corriendo (donde viven los workers GPU). Se le pidió un namespace y
kubeconfig con permisos limitados. Al 2026-09-28 el endpoint del cluster estaba en timeout
desde nuestra red (probablemente IP dinámica del hogar que cambió) y no hubo respuesta a tiempo.
Sigue en pie como plan B por si Hetzner cae en los días finales.

### Docker-compose local con túnel (cloudflared / ngrok)
Cero costo, cero cloud. Se descartó porque expone la demo a la disponibilidad de una laptop
personal durante la defensa, y el evaluador no ve una infraestructura "de verdad" — ve un
port-forward.

### Un solo VPS con docker-compose (sin Kubernetes)
Más simple aún que k3s. Se descartó porque el TP evalúa el uso de Kubernetes explícitamente
(§2 del checklist: "Plataforma escalable en K8s"). k3s cumple con eso en un solo binario y
mantiene la validez de los manifests del repo.

### AWS Free Tier
EKS cobra USD 0.10/hora por el control plane, no está incluido en Free Tier. Los shapes que
sí son gratis (t2.micro, 1 vCPU / 1 GB) no alcanzan para el stack. Costo real estimado
> USD 150/mes. Descartado.

## Cómo reproducir el deploy Hetzner

1. Crear un API token en la consola Hetzner Cloud (`Security → API Tokens`, Read & Write).
2. Generar SSH keypair local: `ssh-keygen -t rsa -b 4096 -f ~/.ssh/oke_nodes -N ''`.
3. `cd infra && cp terraform.tfvars.example terraform.tfvars` — completar `hcloud_token` y
   `ssh_public_key`.
4. `tofu init && tofu apply` — crea firewall, key y server (~30-60 seg). `cloud-init`
   dentro del server instala k3s y labelea el nodo (~1-2 min extra).
5. Bajar kubeconfig: `tofu output -raw kubeconfig_hint | sh`.
6. Crear secrets a mano (`app-secrets`, `rabbitmq-tls`) — ver `k8s/README.md`.
7. Buildear y pushear las 4 imágenes de app a Docker Hub, o correr Pipeline 3 desde GitHub.
8. Aplicar manifests: `kubectl apply -f k8s/gke/{infra,apps,observability}/`.
9. Instalar cert-manager por Helm y aplicar `managed-cert.yaml` + `ingress.yaml`.
10. Apuntar el A record del dominio al output `server_ipv4`.

Los pipelines automatizan los pasos 4-8; el bootstrap manual (steps 1-3, 9-10) queda
documentado en `infra/README.md` y `k8s/README.md`.
