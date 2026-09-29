# CI/CD — GitHub Actions Pipelines

Cuatro pipelines que despliegan cada capa del sistema independientemente.
Todos gatean por **Gitleaks** (secret scanning) antes de ejecutar.

## Pipelines

### Pipeline 1 — Infraestructura (`pipeline-1-infra.yml`)

**Trigger:** Push a `infra/**`

Provisiona la infraestructura OCI con OpenTofu:
1. Autentica con OCI via API Key (`oracle-actions/configure-oci-cli`).
2. `tofu init` → `tofu plan` → `tofu apply`.
3. Crea/actualiza: VCN, subnets, gateways, OKE cluster, node pool ARM Always Free, IAM policies.

### Pipeline 2 — Servicios base (`pipeline-2-services.yml`)

**Trigger:** Manual (`workflow_dispatch`) o después de Pipeline 1.

Despliega los servicios de infraestructura en OKE:
1. `kubectl apply` de `namespaces.yaml`.
2. `kubectl apply` de todo en `k8s/gke/infra/` (Redis, RabbitMQ).

### Pipeline 3 — Aplicaciones (`pipeline-3-apps.yml`)

**Trigger:** Push a `app/**`, `Pilar2/P5/**`, o `k8s/gke/apps/**`

El pipeline principal de la app:
1. **Build en paralelo** de 4 imágenes Docker:
   - `frontend` (Next.js)
   - `blockchain-nct` (FastAPI)
   - `blockchain-trp` (Python)
   - `blockchain-worker-cpu` (Python)
2. **Push** a OCIR (Oracle Container Registry) con tag `github.sha`, arch **arm64**.
3. **Deploy**: reemplaza `IMAGE_TAG` en los yamls con la imagen real y aplica con `kubectl`.

### Pipeline 4 — GPU Workers (`pipeline-4-gpu-workers.yml`)

**Trigger:** Push a `Pilar2/P5/gpu-server.py`, `Pilar2/P5/worker.py`, o `k8s/profesor/**`

Despliega al cluster del profesor:
1. Build de la imagen `blockchain-worker-gpu`.
2. Push al OCIR (`scl.ocir.io/<namespace>`), arch x86 (el cluster del profesor es x86).
3. Deploy al cluster externo usando kubeconfig de `KUBE_CONFIG_PROFESOR` (secret).

### Gitleaks (`gitleaks.yml`)

**Workflow reutilizable** que escanea el historial de git completo buscando secrets
(API keys, tokens, passwords). Llamado como gate por todos los otros pipelines.

## Flujo de despliegue

```
Push a infra/     → P1 (Terraform) → P2 (Redis/RabbitMQ)
Push a app/       → P3 (Build 4 imágenes → Deploy a OKE)
Push a Pilar2/P5/ → P3 + P4 (Deploy a OKE + Profesor)
```

## Secrets necesarios en GitHub

| Secret | Uso |
|--------|-----|
| `OCI_TENANCY_OCID` | OCID de la tenancy |
| `OCI_USER_OCID` | OCID del user CI/CD |
| `OCI_FINGERPRINT` | Fingerprint del API key |
| `OCI_PRIVATE_KEY` | Contenido del .pem (multiline) |
| `OCI_REGION` | `sa-santiago-1` |
| `OCI_COMPARTMENT_OCID` | Compartment del cluster |
| `OCIR_NAMESPACE` | Namespace de OCIR (`oci os ns get`) |
| `OCIR_REGISTRY` | `scl.ocir.io` (Santiago) |
| `OCIR_USERNAME` | Email de la cuenta OCI |
| `OCIR_AUTH_TOKEN` | Auth Token para docker login |
| `OKE_CLUSTER_ID` | OCID del cluster |
| `SSH_PUBLIC_KEY` | Pública SSH para los worker nodes |
| `KUBE_CONFIG_PROFESOR` | Kubeconfig (base64) del cluster del profesor |
| `MP_ACCESS_TOKEN`, `SESSION_PASSWORD` | Secrets de la app sincronizados por P3 |
| `RABBITMQ_TLS_CERT_B64`, `RABBITMQ_TLS_KEY_B64` | Certificado TLS de RabbitMQ (P2) |
| `NEXT_PUBLIC_CLOUDINARY_*` | Build args del frontend en P3 |
