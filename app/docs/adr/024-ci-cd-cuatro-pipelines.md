# ADR-024: CI/CD con cuatro pipelines especializados

**Estado:** Accepted
**Fecha:** 2026-06-22

## Contexto

El proyecto tiene componentes con ciclos de vida distintos: infraestructura GCP, servicios
base (Redis/RabbitMQ), aplicaciones (frontend + blockchain), y workers GPU en un cluster
externo. Necesitamos CI/CD que despliegue cada parte independientemente.

## Decisión

Cuatro pipelines de GitHub Actions, cada uno disparado por cambios en su directorio:

| Pipeline | Trigger | Qué hace |
|---|---|---|
| **1 - Infra** | `infra/**` | OpenTofu plan + apply (VPC, GKE, AR, IAM) |
| **2 - Services** | Manual o post-P1 | `kubectl apply` de namespaces + Redis + RabbitMQ |
| **3 - Apps** | `app/**`, `Pilar2/P5/**`, `k8s/gke/apps/**` | Build 4 imágenes en paralelo → push a AR → deploy a GKE |
| **4 - GPU Workers** | `Pilar2/P5/gpu-server.py`, `k8s/profesor/**` | Build imagen GPU → push a AR → deploy al cluster del profesor |

Todos gatean por **Gitleaks** (secret scanning) antes de ejecutar.

Pipeline 3 usa un patrón `IMAGE_TAG` en los yamls: `sed` reemplaza el placeholder con
`${REGISTRY}/${IMAGE}:${SHA}` antes de `kubectl apply`.

## Consecuencias

### Positivas
- Cada componente se deploya independientemente sin afectar los demás.
- Secret scanning previene leaks de credenciales.
- Build paralelo de 4 imágenes acelera el deploy (~3 min total).

### Negativas
- El placeholder `IMAGE_TAG` puede causar confusión si se hace `kubectl apply` manual
  sin reemplazarlo.
- Pipeline 4 depende de un kubeconfig externo (secret `KUBE_CONFIG_PROFESOR`).

## Alternativas consideradas

### A. Un solo pipeline monolítico
Más simple pero despliega todo en cada push, incluso si solo cambió un archivo.

### B. ArgoCD / Flux (GitOps)
Más robusto pero requiere instalar un operador en el cluster, overkill para el TP.
