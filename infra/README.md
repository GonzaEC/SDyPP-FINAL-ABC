# Infraestructura — Terraform/OpenTofu en GCP

Definición declarativa de toda la infraestructura en Google Cloud Platform.
Se ejecuta automáticamente via Pipeline 1 (GitHub Actions) en cada push a `infra/`.

## Recursos provisionados

### Red
- **VPC** `sdypp-vpc`: red custom sin subnets auto-creadas.
- **Subnet** `sdypp-gke-subnet` en `us-central1`:
  - Rango primario: `10.0.0.0/20` (nodos)
  - Rango secundario pods: `10.4.0.0/14`
  - Rango secundario services: `10.8.0.0/20`

### GKE Cluster
- **Cluster** `sdypp-cluster` en `us-central1-a`, VPC-native, Workload Identity habilitado.
- **Node pool `infra`**: 1× `e2-medium` (on-demand) — para Redis y RabbitMQ.
  - Label: `pool=infra`
- **Node pool `apps`**: 2× `e2-medium` (Spot) — para aplicaciones.
  - Label: `pool=apps`
  - Spot instances: ~60% más baratas, pueden ser preempted.

### Artifact Registry
- Repositorio Docker `sdypp` en `us-central1` para las imágenes de CI/CD.

### IAM
- **Service account** `gke-workloads` con rol `artifactregistry.reader`.
- **Workload Identity binding**: el SA de Kubernetes `default/default` mapea al SA de GCP,
  permitiendo que los pods pulleen imágenes del AR sin credenciales explícitas.

## Archivos

| Archivo | Contenido |
|---------|-----------|
| `providers.tf` | Provider de Google, versión y proyecto |
| `backend.tf` | State remoto en bucket GCS |
| `variables.tf` | Variables (proyecto, región, zona) |
| `terraform.tfvars.example` | Ejemplo de valores |
| `networking.tf` | VPC y subnet |
| `gke.tf` | Cluster GKE y node pools |
| `artifact-registry.tf` | Repositorio de imágenes Docker |
| `iam.tf` | Service account y Workload Identity |
| `outputs.tf` | Outputs (nombre del cluster, endpoint, etc.) |

## Cómo aplicar manualmente

```bash
cd infra
tofu init
tofu plan
tofu apply
```

En producción, esto lo hace Pipeline 1 automáticamente con autenticación via
Workload Identity Federation de GitHub Actions.

## Costos

- Node pool `apps` usa **Spot instances** para minimizar costos.
- El cluster usa nodos `e2-medium` (2 vCPU, 4 GB RAM) — el más barato con CPU suficiente.
- **Limitación del free tier**: máximo 4 IPs externas globales (`IN_USE_ADDRESSES`).
  Esto condicionó que el NCT service sea ClusterIP en vez de LoadBalancer.
