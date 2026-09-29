# Infraestructura — Terraform/OpenTofu en Oracle Cloud

Definición declarativa de toda la infraestructura en OCI (Oracle Cloud
Infrastructure), usando el tier **Always Free**. Se ejecuta automáticamente vía
Pipeline 1 (GitHub Actions) en cada push a `infra/`.

## Por qué Oracle Cloud Always Free

- **4 OCPU ARM Ampere A1 + 24 GB RAM** always free, sin límite temporal.
- **OKE (Oracle Kubernetes Engine)** control plane gratis en tier Basic.
- **OCIR** (Container Registry) gratis, unlimited pulls dentro de la tenancy.
- **2 flex load balancers** always free (uno para el ingress, otro para
  RabbitMQ/Redis externos).
- **200 GB block storage** always free.
- No hay $100 que se acabe; el cluster puede quedar prendido meses.

## Recursos provisionados

### Red
- **VCN** `sdypp-vcn`: `10.0.0.0/16`.
- **Subnet API** `sdypp-api-subnet` (`10.0.0.0/28`, pública): endpoint del K8s API.
- **Subnet nodes** `sdypp-nodes-subnet` (`10.0.10.0/24`, privada + NAT):
  worker nodes; salen por NAT gateway y acceden a servicios OCI por Service Gateway.
- **Subnet LB** `sdypp-lb-subnet` (`10.0.20.0/24`, pública): Service type=LoadBalancer.
- Internet Gateway, NAT Gateway, Service Gateway, 2 Route Tables, 2 Security Lists
  (una para nodes, otra para LB con reglas HTTP/HTTPS/AMQPS/Redis).

### OKE Cluster
- **Cluster** `sdypp-cluster`, tier Basic, endpoint público.
- **Kubernetes 1.31.1**, CNI `OCI_VCN_IP_NATIVE` (pods obtienen IPs de la VCN,
  no NAT interno).
- **Node pool `workers`**: 4 nodos `VM.Standard.A1.Flex` (ARM Ampere), 1 OCPU
  y 6 GB RAM cada uno. Total: **4 OCPU / 24 GB** — el máximo de Always Free.
- Boot volume 50 GB por nodo.
- OS: Oracle Linux 8 (última imagen ARM).

### La arquitectura de 3 pools se comprime a labels/taints manuales

OKE Always Free no admite múltiples node pools independientes con scale-to-zero
(hay un solo node pool de 4 nodos ARM). Reproducimos la separación aplicando
labels + taints a nodos individuales tras el bootstrap (ver `k8s/README.md`
sección "Bootstrap manual de labels/taints"):

- **2 nodos** con `pool=apps` + taint `apps=true:NoSchedule` → frontend, NCT, TrP, worker-cpu, Postgres.
- **1 nodo** con `pool=infra` (sin taint) → Redis, RabbitMQ; también acoge los
  addons de kube-system (CoreDNS, etc.).
- **1 nodo** con `pool=monitoring` + taint `monitoring=true:NoSchedule` → stack LGTM.

### IAM
- **Dynamic Group** `sdypp-oke-nodes`: identifica los worker nodes del cluster.
- **Policy** `sdypp-oke-ocir-pull`: permite a la dynamic group leer OCIR
  (equivalente al AcrPull de Azure / artifactregistry.reader de GCP).

### OCIR
No se declara como resource: OCIR es tenancy-wide. La primera vez que hacés
`docker push scl.ocir.io/<namespace>/<repo>` se autoprovisiona el repo.

## Archivos

| Archivo | Contenido |
|---------|-----------|
| `providers.tf` | Provider `oracle/oci ~> 6.0` |
| `backend.tf` | State local (commiteado con concurrency lock del pipeline) |
| `variables.tf` | Variables (tenancy, user, fingerprint, region, compartment, OCIR namespace, SSH key) |
| `terraform.tfvars.example` | Ejemplo de valores |
| `networking.tf` | VCN + 3 subnets + gateways + route tables + security lists |
| `oke.tf` | Cluster OKE + node pool ARM Always Free |
| `iam.tf` | Dynamic Group + Policy para OCIR pull |
| `outputs.tf` | Outputs (cluster ID, endpoint, OCIR path, region) |

## Bootstrap (una sola vez, previo al primer `tofu apply`)

### 1. Crear API Key en OCI Console
- Consola OCI → **Profile → User Settings → API Keys → Add API Key**
- Elegir "Generate API Key Pair" → descargar la private key `.pem`
- Guardarla en `~/.oci/oci_api_key.pem` (Windows: `%USERPROFILE%\.oci\oci_api_key.pem`)
- Copiar el **fingerprint** que muestra la consola.

### 2. Obtener OCIDs y namespace
- **Tenancy OCID**: Profile → Tenancy → OCID
- **User OCID**: Profile → User Settings → OCID
- **Compartment OCID**: en el root podés usar `tenancy_ocid` mismo, o crear un
  compartment nuevo (Governance → Compartments → Create).
- **OCIR namespace** (autogenerado por Oracle):
  ```bash
  oci os ns get
  ```

### 3. Generar SSH key para acceso a nodos (opcional pero requerido por OKE)
```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/oke_nodes -N ""
```
El contenido de `~/.ssh/oke_nodes.pub` va en `ssh_public_key` de tfvars.

## Cómo aplicar manualmente

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# editar terraform.tfvars con los OCIDs y paths
tofu init
tofu plan -out=plan.tfplan
tofu apply plan.tfplan
```

En producción, esto lo hace Pipeline 1 automáticamente vía OCI CLI + API key
guardada como secret.

## Secrets a cargar en el repo tras el primer apply

| Secret | De dónde sale |
|--------|---------------|
| `OCI_TENANCY_OCID` | Profile → Tenancy |
| `OCI_USER_OCID` | Profile → User Settings |
| `OCI_FINGERPRINT` | Del API Key generado |
| `OCI_PRIVATE_KEY` | Contenido del `.pem` (multiline, sin passphrase) |
| `OCI_REGION` | `sa-santiago-1` (o la home region que hayas elegido) |
| `OCI_COMPARTMENT_OCID` | El compartment donde vive el cluster |
| `OCIR_NAMESPACE` | Output de `oci os ns get` |
| `OCIR_REGISTRY` | `scl.ocir.io` para Santiago, `gru.ocir.io` para São Paulo |
| `OCIR_USERNAME` | El email de tu cuenta OCI |
| `OCIR_AUTH_TOKEN` | Profile → Auth Tokens → Generate Token (para docker login) |
| `OKE_CLUSTER_ID` | `tofu output cluster_id` |
| `SSH_PUBLIC_KEY` | Contenido de `~/.ssh/oke_nodes.pub` |

## Costos

**Cero**, mientras te quedes dentro de Always Free. Los recursos "AF" no se
pueden escalar fuera del tier gratuito ni por accidente — Oracle rechaza
el request en vez de cobrar.
