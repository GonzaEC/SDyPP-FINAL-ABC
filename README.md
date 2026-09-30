# SDyPP — TP Integrador: Sistema de Entradas con Blockchain

Sistema distribuido de gestión de entradas a eventos donde cada entrada es un activo
criptográfico único en una blockchain propia con Proof of Work.

**Materia:** Sistemas Distribuidos y Programación Paralela (SDyPP)
**Universidad:** UNLU — Junio 2026

## Arquitectura general

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CLUSTER k3s (propio, VPS Hetzner)               │
│                                                                     │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────────┐  │
│  │ Frontend  │   │   NCT    │   │   TrP    │   │  Worker CPU    │  │
│  │ (Next.js) │   │ (FastAPI)│   │ (Python) │   │  (fallback)    │  │
│  │  ×2       │   │  ×2      │   │  ×2      │   │  ×2            │  │
│  └─────┬─────┘   └────┬─────┘   └────┬─────┘   └───────┬────────┘  │
│        │              │              │                  │           │
│        │         ┌────┴─────┐   ┌────┴─────┐           │           │
│        │         │  Redis   │   │ RabbitMQ │───────────┘           │
│        │         │  (AOF)   │   │  (AMQPS) │                       │
│  ┌─────┴─────┐   └──────────┘   └────┬─────┘                       │
│  │ Postgres  │                       │                              │
│  └───────────┘                       │                              │
└──────────────────────────────────────┼──────────────────────────────┘
                                       │ IPs externas
                              ┌────────┴────────┐
                              │ CLUSTER PROFESOR │
                              │   (GPU nodes)    │
                              │                  │
                              │ ┌──────────────┐ │
                              │ │  GPU Server   │ │
                              │ │  (CUDA T4)   │ │
                              │ └──────┬───────┘ │
                              │ ┌──────┴───────┐ │
                              │ │  Workers ×4  │ │
                              │ └──────────────┘ │
                              └─────────────────┘
```

El cluster propio corre en **un único VPS de Hetzner Cloud** (CPX32, 4 vCPU / 8 GB,
Nuremberg) con **k3s single-node**, provisionado declarativamente en [`infra/`](infra/).
La separación en pools lógicos (`apps`, `infra`, `monitoring`) que documenta el TP se
colapsa a un solo nodo etiquetado `pool=apps` — ver
[ADR-029](app/docs/adr/029-deploy-iteracion-gcp-oci-hetzner.md) para el racional.

## Los tres pilares

El proyecto se divide en tres pilares que se integran en el sistema final:

| Pilar | Tema | Directorio |
|-------|------|------------|
| **Pilar 1** | Programación GPU con CUDA | [`Pilar1/`](Pilar1/) |
| **Pilar 2** | Blockchain distribuida con PoW | [`Pilar2/`](Pilar2/) |
| **Pilar 3** | CI/CD, IaC, deploy en Kubernetes | [`infra/`](infra/), [`k8s/`](k8s/), [`.github/workflows/`](.github/workflows/) |

La **app web** ([`app/`](app/)) es la capa que integra todo: gestiona eventos y entradas,
firma transacciones con ECDSA, y se comunica con la blockchain para emitir, transferir y
validar tickets on-chain.

## Flujo end-to-end

1. **Organizador crea un evento** en la app web y emite N entradas → se firma con su clave
   privada ECDSA P-256 en el browser → el NCT recibe el `mint_batch` → los workers minan
   el bloque con PoW → las entradas quedan registradas en la blockchain.

2. **Asistente compra una entrada** → paga con MercadoPago → el webhook confirma el pago →
   se genera un `transfer` on-chain del organizador al comprador.

3. **Validación en puerta** → el asistente presenta un QR firmado con su clave privada →
   el validador escanea → se verifica la firma y el ownership en la blockchain → se transfiere
   la entrada de vuelta al organizador (la entrada queda "usada").

## Stack técnico

| Componente | Tecnología |
|------------|-----------|
| Frontend + Backend | Next.js 16 (App Router), TypeScript, Tailwind 4 |
| Base de datos | PostgreSQL 17 + Prisma 7 |
| Blockchain | Python (FastAPI), Redis, RabbitMQ |
| Minería GPU | CUDA C (compilado), workers Python |
| Infraestructura declarativa | Terraform/OpenTofu (provider `hetznercloud/hcloud`) |
| Deploy en producción | VPS Hetzner Cloud + k3s single-node |
| Observabilidad | Prometheus, Grafana, Loki, Tempo, Alloy, Alertmanager |
| CI/CD | GitHub Actions (5 pipelines) |
| Pagos | MercadoPago Checkout Pro |
| Criptografía | ECDSA P-256, SHA-256, WebCrypto API |
| Registry de imágenes | Docker Hub público (`gonzaec/*`) |
| HTTPS | Traefik (built-in k3s) + cert-manager + Let's Encrypt, dominio `tesera.tech` |

## Cómo desplegar en la nube

El deploy actual corre en un VPS de Hetzner con k3s. Los pasos manuales están en
[ADR-029](app/docs/adr/029-deploy-iteracion-gcp-oci-hetzner.md) sección "Cómo
reproducir el deploy Hetzner". Resumen:

> 📖 **Cómo llegamos hasta acá:** el deploy pasó por GCP, Azure Students y
> Oracle Cloud antes de aterrizar en Hetzner + k3s. La historia completa (por
> qué se cerró cada opción, qué se aprendió, y qué cambios de arquitectura
> obligó cada paso) está en [`docs/RECORRIDO-DEPLOY.md`](docs/RECORRIDO-DEPLOY.md).

1. Alquilar un VPS Hetzner CPX32 (Ubuntu 24.04) en Nuremberg.
2. `curl -sfL https://get.k3s.io | sh -` para instalar k3s.
3. Copiar el kubeconfig desde `/etc/rancher/k3s/k3s.yaml`, reemplazar `127.0.0.1` por el IP público.
4. Labelar el nodo con `pool=apps`.
5. Crear los secrets (`app-secrets`, `rabbitmq-tls`) y desplegar `k8s/gke/{namespaces,infra,apps,observability}/`.
6. Instalar `cert-manager` por Helm; aplicar el ClusterIssuer y el Ingress (Traefik ya viene con k3s).
7. Apuntar el DNS de `tesera.tech` al IP del VPS.

El código `infra/*.tf` provisiona el VPS Hetzner con `cloud-init` que instala k3s al boot
— un `tofu apply` completo reprovisiona el cluster desde cero. Los 5 pipelines de GitHub
Actions cubren el flujo end-to-end (Terraform + build de imágenes + deploy + observabilidad).

## Cómo correr localmente

El `docker-compose.yml` de la raíz levanta **todo el sistema** sin necesidad de nube:
app web, blockchain (NCT, TrP, worker CPU), Postgres, Redis, RabbitMQ y el stack de
observabilidad.

```bash
docker compose up --build
```

| Servicio | URL |
|----------|-----|
| App | http://localhost:3000 |
| NCT (API de la blockchain) | http://localhost:8000/status |
| Grafana | http://localhost:3001 (admin/admin) |
| Prometheus | http://localhost:9090 |

El primer arranque tarda: construye cuatro imágenes. No incluye el worker GPU, que
necesita CUDA y una placa NVIDIA — localmente mina el worker CPU (ver
[Pilar2/P5/README.md](Pilar2/P5/README.md)).

Para desarrollar la app con hot reload, levantando solo sus dependencias:

```bash
docker compose up -d postgres nct trp worker-cpu redis rabbitmq
cd app && npm install && npm run dev
```

## Documentación por componente

Cada parte del sistema tiene su propio README. Índice:

| Componente | Doc | Contenido |
|------------|-----|-----------|
| **App web** | [app/README.md](app/README.md) | Stack, modelo cripto, páginas, API, ciclo de vida de una entrada |
| **Pilar 1 — GPU/CUDA** | [Pilar1/README.md](Pilar1/README.md) | Progresión de hitos, benchmark GPU vs CPU |
| **Pilar 2 — Blockchain** | [Pilar2/README.md](Pilar2/README.md) | Evolución P1→P5, arquitectura final |
| ↳ versión de producción | [Pilar2/P5/README.md](Pilar2/P5/README.md) | NCT/TrP/workers, colas, claves Redis, fallback, observabilidad |
| **Infraestructura (IaC)** | [infra/README.md](infra/README.md) | Terraform/OpenTofu para Hetzner Cloud (server + firewall + k3s via cloud-init) |
| **Kubernetes** | [k8s/README.md](k8s/README.md) | Manifiestos + cluster del profesor |
| **Observabilidad** | [k8s/gke/observability/README.md](k8s/gke/observability/README.md) · [MANUAL.md](k8s/gke/observability/MANUAL.md) | Stack LGTM: métricas, logs, trazas, alertas |
| **CI/CD** | [.github/workflows/README.md](.github/workflows/README.md) | Los 5 pipelines |
| **ADRs** | [app/docs/adr/](app/docs/adr/) | Decisiones de arquitectura de la app y del deploy |

`CLAUDE.md` (raíz y `app/`) tiene el contexto técnico para desarrollo asistido por IA.

## Estructura del repositorio

```
SDyPP-FINAL-ABC/
├── docker-compose.yml      # Stack completo local (app + blockchain + observabilidad)
├── docker/                 # Configs de apoyo del compose (RabbitMQ TLS)
├── app/                    # App web (Next.js) — frontend + backend
├── Pilar1/                 # Prácticas de CUDA/GPU (Hit1-Hit7)
├── Pilar2/                 # Blockchain distribuida (P1-P5)
├── infra/                  # Terraform — código IaC para Hetzner Cloud (ejecutable)
├── k8s/                    # Manifiestos Kubernetes
│   ├── gke/               # Cluster propio (nombre histórico; hoy corre en k3s)
│   │   ├── infra/         # Redis, RabbitMQ
│   │   ├── apps/          # Frontend, NCT, TrP, workers, Postgres
│   │   └── observability/ # Prometheus, Grafana, Loki, Tempo, Alloy, alertas
│   └── profesor/          # Cluster del profesor (GPU workers)
├── observability/local/    # Configs del stack para docker-compose local
└── .github/workflows/     # Pipelines CI/CD (5)
```
