# ADR-023: Infraestructura como código con Terraform/OpenTofu en GCP

**Estado:** Accepted
**Fecha:** 2026-06-22

## Contexto

El TP pide demostrar Infrastructure as Code (IaC) para el despliegue en la nube.
Necesitamos provisionar de forma reproducible: VPC, cluster GKE, node pools, Artifact
Registry, IAM, y que sea auditable en git.

## Decisión

Usamos **OpenTofu** (fork open-source de Terraform) con el provider de Google Cloud:

- **VPC custom** con subnet dedicada y rangos secundarios para pods/services.
- **GKE cluster** con dos node pools:
  - `infra` (1x e2-medium, on-demand): Redis y RabbitMQ.
  - `apps` (2x e2-medium, Spot): frontend, Postgres, NCT, TrP, workers.
- **Artifact Registry** para imágenes Docker.
- **IAM**: service account con Workload Identity para que los pods pullean imágenes.
- **State remoto** en GCS bucket.

Pipeline 1 (GitHub Actions) ejecuta `tofu plan → apply` automáticamente en push a `infra/`.

## Consecuencias

### Positivas
- Infraestructura reproducible y versionada en git.
- Un `tofu apply` recrea todo el cluster desde cero si se necesita.
- Spot instances reducen costo ~60% vs on-demand.

### Negativas
- Spot instances pueden ser preempted, causando downtime breve de pods.
- El free tier de GCP limita a 4 IPs externas, lo que condicionó decisiones de red.

## Alternativas consideradas

### A. Provisionar a mano desde la consola de GCP
No reproducible, no auditable, no cumple el requisito de IaC.

### B. Pulumi
Más expresivo (código real vs HCL), pero el equipo ya conoce Terraform.
