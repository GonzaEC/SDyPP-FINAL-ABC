# Recorrido del deploy — de GKE a un VPS con k3s

Cronología honesta de las cuatro plataformas por las que pasó el deploy productivo
del TP entre julio y septiembre de 2026. Este documento existe porque el resto
del repo (READMEs, ADRs 019 a 024, IaC en `infra/`) refleja distintos estados
intermedios de esa evolución, y a veces las decisiones descritas en el código
solo tienen sentido con la historia completa a la vista.

El resumen técnico de la iteración vive en el
[ADR-029](../app/docs/adr/029-deploy-iteracion-gcp-oci-hetzner.md). Este documento
es más largo y más narrativo — sirve para que un lector externo entienda por qué
la infraestructura terminó donde terminó.

---

## 1. Punto de partida: GKE funcionando (julio 2026)

Durante julio el deploy productivo era el que describen los ADRs originales:

- **Google Kubernetes Engine** en `us-central1-a`, dos node pools (`apps` y
  `infra`) con taints imponiendo la separación de cargas.
- **Terraform** contra GCP levantando VPC, cluster, node pools y Artifact
  Registry.
- **HTTPS** en `tesera.tech` con un `ManagedCertificate` de GKE y una IP global
  reservada.
- **CI/CD** con cuatro pipelines autenticados por **Workload Identity
  Federation** — sin ninguna clave estática de GCP guardada en secrets.

Ese stack funcionó y estuvo sirviendo tráfico real. La foto de arquitectura que
aparece en el README se pensó sobre esa base.

El problema apareció con la facturación: la cuenta usaba el crédito del **free
trial de 90 días**. Cuando se agotó, seguir cobraría automáticamente contra la
tarjeta asociada. El 2026-07-27 se decidió **eliminar la cuenta** para evitar
cargos en un contexto donde el TP todavía tenía trabajo por delante y no había
presupuesto explícito para infraestructura.

Con la cuenta borrada, el commit `6892c8e` quedó como último estado productivo
en GCP. Todo lo que necesitaba un cluster vivo para verificarse (§3 del
checklist) pasó a estar bloqueado hasta reprovisionar en algún otro lado.

---

## 2. Intento 1: reactivar GCP (fallo por tarjeta)

Antes de migrar de proveedor, se intentó reactivar GCP con una cuenta nueva.
Google en Argentina ya no ofrece los USD 300 de free trial tal cual estaban en
2023: para habilitar la facturación pide un **prepago mínimo de USD 30** que
queda como saldo en la cuenta.

La tarjeta débito con la que se intentó ese primer cargo **fue rechazada por el
banco emisor** — probablemente por controles de fraude sobre pagos
internacionales nuevos. Sin manera de completar la activación, GCP quedó cerrado
como opción.

**Aprendizaje:** los créditos de free trial son un evento único por identidad.
Volver a GCP requería una cuenta y una tarjeta que no hubieran sido usadas para
el trial anterior, y en el contexto de un TP eso era acumular trabas.

---

## 3. Intento 2: Azure for Students (fallo por cuotas)

El siguiente candidato natural era **Azure for Students**, que ofrece USD 100 de
crédito **sin pedir tarjeta** — a través del GitHub Student Pack. Se armó un
signup, se verificó la identidad estudiantil y se pasó a migrar la infraestructura.

Todo se reescribió al provider `azurerm`: la VPC pasó a ser una VNet, el cluster
GKE pasó a **Azure Kubernetes Service (AKS)**, los tres node pools se
redefinieron con Spot en `apps` y on-demand en `monitoring`, el Artifact Registry
pasó a **Azure Container Registry**, y los pipelines cambiaron
`google-github-actions/*` por `azure/login` con OIDC y una User-Assigned Managed
Identity con Federated Credential contra el repo.

Al llegar al `tofu apply`, dos capas de restricciones cerraron el camino:

**Region policy.** La suscripción Azure for Students tiene una policy oculta que
limita en qué regiones se pueden crear recursos. La lista efectiva era muy corta
—en la práctica sólo `eastus` funcionaba para AKS— y el resto respondía con
`RequestDisallowedByAzure` incluso para recursos triviales como un Storage
Account.

**Cuota de vCPUs.** En `eastus`, AKS Students sólo acepta VM SKUs de la familia
`Dsv7` (versión 7 de Intel/AMD). Y la cuota de vCPUs para todas las familias v7
está fijada en **0**. La solicitud de aumento se puede pedir por consola, pero
fue rechazada automáticamente en minutos.

Esa intersección quedó vacía: las SKUs que AKS acepta en Students no tienen
cuota, y las SKUs con cuota (B-series, D v3/v4) no están permitidas en AKS
Students. El deploy en Azure no era posible dentro del tier gratuito, punto.

**Aprendizaje:** los tiers gratuitos "sin tarjeta" suelen tener este tipo de
letra chica. La restricción no aparece en la documentación de los tutoriales de
signup — se descubre cuando el `tofu apply` empieza a devolver 400s con mensajes
oscuros.

---

## 4. Intento 3: Oracle Cloud Infrastructure OKE (fallo por capacidad)

**Oracle Cloud Infrastructure** tiene un tier "Always Free" bastante generoso:
4 OCPU ARM Ampere A1 + 24 GB RAM sin límite de tiempo, sin auto-renovación a
pago accidental. Se abrió cuenta, se eligió `sa-santiago-1` como home region
(única latinoamericana disponible en la práctica), y se reescribió otra vez la
infra.

Esta vez el trabajo fue considerable: el provider pasó a `oracle/oci`, se
declararon VCN, tres subnets (API pública, nodos privada, LB pública), NAT
gateway, Internet gateway, Service gateway, dos security lists y el cluster OKE
Basic con node pool ARM Ampere. Los pipelines cambiaron a
`oracle-actions/configure-oci-cli`, con auth por API key en vez de OIDC. Y como
los nodos ARM no corren imágenes x86 nativas, todos los `docker build` de
Pipeline 3 se pasaron a **buildx multi-arch** con QEMU para compilar `arm64`
desde runners x86 (con el costo asociado en tiempo de build, ~2-4 min extra por
imagen).

El cluster OKE Basic se creó sin problemas. **El node pool falló**.

Cada intento de crear el node pool devolvió `Out of host capacity` en el
subsistema Compute. Es un problema conocido y crónico de Oracle en LATAM: el
free tier ARM Ampere está sobrevendido hace tiempo, y la capacidad se libera en
ciclos irregulares (habitualmente cuando alguien apaga su cluster). Se
probaron:

- `size = 4` con 1 OCPU cada uno → fallo.
- `size = 2` con 2 OCPU → fallo.
- `size = 1` con 1 OCPU (mínimo absoluto, más chance de encontrar cualquier slot
  fragmentado) → fallo.
- Un retry loop automático con 15+ intentos espaciados 90 segundos → fallo.

También se probó cambiar de región dentro de la tenancy: la única otra
autorizada era `canadacentral`, pero allí OKE en Students sólo acepta shapes
ARM que también estaban sin capacidad. `sa-vinhedo-1` requería suscripción a
la región y quedaba fuera del tier gratuito.

Después de aproximadamente 45 minutos de reintentos sin éxito, quedó claro que
la restricción no era una ventana chica de espera sino un techo estructural
para esa suscripción en esa región.

**Aprendizaje:** el "Always Free" de Oracle es real como oferta pero muy
condicional en la práctica. La capacidad ARM es un recurso escaso que se
racionaliza por FIFO, y en regiones chicas como Santiago la cola es larga.

---

## 5. Cambio de estrategia: pagar poco

En este punto la ecuación era distinta a las anteriores. Ya se habían gastado
varias horas migrando entre proveedores gratuitos, cada uno cerrando por una
razón distinta —trámite bancario, policy oculta, capacidad—, y quedaba menos
tiempo hasta la defensa. Seguir buscando otro proveedor gratuito
(DigitalOcean vía Student Pack estaba discontinuado, AWS Free Tier no cubre
Kubernetes) era volver a tirar horas al problema mal formulado.

La reformulación fue: **el TP evalúa el uso de Kubernetes, no la habilidad de
conseguir un cluster managed gratis**. Un cluster propio en un solo VPS —con
`k3s`, la distribución liviana de Rancher que instala Kubernetes en un binario
único— cumple con el requerimiento del checklist §2 ("Plataforma escalable en
K8s") de forma idéntica a como lo cumpliría un GKE o un EKS. Y **un VPS Hetzner
CPX32 cuesta EUR 7 al mes**, cobrados prorrateados por hora, lo que para una
ventana de una semana de defensa son aproximadamente USD 5 reales.

Con esa lectura, se optó por **Hetzner Cloud + k3s**. El costo dejó de ser el
eje de la decisión: ahorrar USD 5 no valía otra ronda de sorpresas técnicas.
Lo que sí importaba era llegar a la defensa con el sistema vivo, con evidencia
técnica sólida, y con el tiempo mental que quedaba dedicado al TP y no a la
infraestructura.

---

## 6. Cambios de arquitectura para adaptarse al nuevo runtime

Pasar de un cluster multi-nodo managed a un único VPS con k3s no fue solo un
cambio de proveedor. Obligó a repensar varios patrones que en Kubernetes
"grande" se dan por sentados.

### La separación de pools se colapsa a un solo nodo

Los ADRs 019 y 024 documentan una arquitectura de **tres node pools lógicos**:
`apps` (con taint `apps=true:NoSchedule` para el frontend, NCT, TrP y
worker-cpu), `infra` (sin taint, para Redis y RabbitMQ + addons de kube-system
como CoreDNS), y `monitoring` (con taint `monitoring=true:NoSchedule` para el
stack LGTM). Esa separación impone que las cargas de aplicaciones no compitan
con las de infraestructura o de observabilidad por recursos, y que la caída de
un nodo no arrastre servicios de familias distintas.

Con un solo nodo esa separación no puede imponerse físicamente. La solución fue:

- **Mantener los taints y `nodeSelector` declarados en los manifests** como
  intención arquitectónica documentada. Un futuro deploy multi-nodo los
  encuentra listos.
- **Etiquetar el único nodo con `pool=apps`** en el `cloud-init` del server, y
  **colapsar todos los `nodeSelector: pool=infra|monitoring` a `pool=apps`** en
  los YAMLs para que los pods encuentren dónde programarse.
- **Documentar la divergencia** en el ADR-029 en vez de reescribir los ADRs
  originales: la historia de la decisión sigue siendo válida como razonamiento,
  aunque el runtime actual no la aplique.

### El HPA queda con techo bajo

En GKE, el `HorizontalPodAutoscaler` escalaba `frontend` (2 a 6 réplicas) y
`blockchain-nct` (2 a 4) hasta el máximo permitido por el Cluster Autoscaler
del pool `apps` (2 a 5 nodos). En un VPS fijo el mecanismo sigue funcionando —
`metrics-server` viene con k3s— pero el techo es el propio nodo (4 vCPU / 8
GB). Sirve para demostrar el HPA en acción; no para carga real.

### Traefik built-in en vez de ingress-nginx

k3s ya viene con **Traefik** como IngressClass por default. Instalar
`ingress-nginx` sobre eso hubiera sido pura ceremonia. La adaptación fue
mínima:

- `ingress.yaml` pasó de `ingressClassName: nginx` a `traefik`.
- El redirect HTTP → HTTPS, que en ingress-nginx era una annotation, requiere
  en Traefik un objeto `Middleware` de tipo `redirectScheme` referenciado por
  otra annotation. Se agregó `middleware.yaml` para eso.
- El ClusterIssuer de cert-manager cambió su solver HTTP-01 para usar
  `ingressClassName: traefik`.

### Storage local en vez de discos zonales

En GKE los PVCs de Postgres, Redis y RabbitMQ usaban `standard-rwo` (Persistent
Disk zonal). En k3s la StorageClass default es `local-path`, que asigna
directorios en el disco del propio nodo. Los `volumeClaimTemplates` no
cambiaron: se apoyan en el default. **Costo**: si el server muere, los PVCs
mueren con él. No hay replicación. Para la ventana de defensa es aceptable;
para producción real habría que mover a discos gestionados por Hetzner
(`hcloud-volumes`).

### Registry: Docker Hub público

Reemplazar Artifact Registry / OCIR / ACR por **Docker Hub público** eliminó
buena parte de la complejidad de auth en los pipelines. Los repos `gonzaec/*`
son públicos, así que los pull desde el cluster no requieren `imagePullSecrets`.
Los `docker push` en CI usan un Personal Access Token cargado como secret.

Los pipelines quedaron **más simples que en GKE**: en vez de configurar OIDC
contra GCP, se hace un `docker/login-action@v3` con usuario y token y listo.

### Las imágenes vuelven a x86

En Oracle habíamos pasado a `linux/arm64` porque los nodos Ampere lo exigían.
Con Hetzner AMD volvimos a `linux/amd64`, que es el build nativo del runner de
GitHub Actions. Se sacó `docker/setup-buildx-action` y `docker/setup-qemu-action`
de Pipeline 3 y se volvió a `docker build` + `docker push`, con la mejora de
que cada build tarda ~2-4 min menos (sin emulación).

---

## 7. IaC y CI/CD sobre el nuevo stack

Un objetivo importante de esta última migración era que la infraestructura
declarada en `infra/` y los pipelines volvieran a ser **ejecutables**, no
documentación de una arquitectura ideal que no se estaba corriendo. La segunda
mitad del rewrite se dedicó a eso.

**Terraform en `infra/`** ahora usa `hetznercloud/hcloud` y describe tres
recursos:

- `hcloud_ssh_key` que sube la clave pública del proyecto.
- `hcloud_firewall` que abre exactamente 22 (SSH), 6443 (Kubernetes API), 80,
  443, 5671 (AMQPS para los workers GPU del profesor) y 6379 (Redis para lo
  mismo).
- `hcloud_server` CPX32 en Nuremberg con Ubuntu 24.04 y un `user_data` de
  `cloud-init` que instala k3s, etiqueta el nodo con `pool=apps` y crea el
  namespace `sdypp`.

Un `tofu apply` provisiona el cluster desde cero. El `cloud-init` tarda ~1-2
minutos extra después de que el server queda disponible.

**Los cinco pipelines** de GitHub Actions se rehicieron con la misma lógica de
antes pero apuntando al nuevo stack:

- **Pipeline 1** corre `tofu plan` en cada push a `infra/**`. El `apply` real
  queda detrás de un `workflow_dispatch` manual con parámetro `action=apply`,
  para no recrear el server por accidente en cada commit y perder los PVCs.
- **Pipeline 2** aplica Redis y RabbitMQ, más el secret `rabbitmq-tls` desde
  GitHub Secrets. Autentica con un kubeconfig base64 del cluster k3s.
- **Pipeline 3** buildea las cuatro imágenes de la app (`frontend`,
  `blockchain-nct`, `blockchain-trp`, `blockchain-worker-cpu`) en paralelo,
  pushea a Docker Hub y aplica los manifests reemplazando `IMAGE_TAG` con la
  ruta real por `sed`.
- **Pipeline 4** buildea la imagen del worker GPU y la despliega al cluster del
  profesor (con `KUBE_CONFIG_PROFESOR` como secret).
- **Pipeline 5** despliega el stack LGTM (Prometheus, Grafana, Loki, Tempo,
  Alloy, Alertmanager, exporters).

Los tres GCP secrets viejos (`GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`,
`GCP_WIF_SERVICE_ACCOUNT`) se borraron. Los nuevos son `HCLOUD_TOKEN`,
`SSH_PUBLIC_KEY`, `KUBE_CONFIG_HETZNER`, `DOCKERHUB_USERNAME` y
`DOCKERHUB_TOKEN`.

---

## 8. Estado final

- **URL de producción:** https://tesera.tech con TLS válido de Let's Encrypt.
- **Runtime:** un VPS Hetzner Cloud CPX32 (Nuremberg, 4 vCPU AMD / 8 GB / 160
  GB SSD) corriendo k3s v1.36.4.
- **IaC:** `infra/*.tf` con provider `hetznercloud/hcloud`, ejecutable con
  `tofu apply`.
- **CI/CD:** los cinco pipelines listos para redespliegues automáticos en cada
  push.
- **Costo real:** aproximadamente USD 5 por la ventana de una semana; el
  server se destruye después de la defensa con `tofu destroy` para no seguir
  pagando.

La arquitectura de tres pools con separación por taints, el HPA, el
Cluster Autoscaler y todo el resto de lo que describen los ADRs 019 a 024
**sigue siendo válida como diseño** y sigue viviendo en los manifests y en
los pipelines. El runtime actual la ejecuta en un solo nodo por restricciones
externas al TP —agotamiento de créditos, cuotas ocultas, capacidad
sobrevendida en free tiers— no por decisiones de arquitectura.

Para reproducir el deploy en cualquier momento, con o sin el server actual
vivo, alcanza con seguir los pasos que documenta [`infra/README.md`](../infra/README.md):
un token de Hetzner, una SSH key, `tofu apply`, y el kubeconfig del server
recién creado.

---

## 9. Qué queda para arreglar

Nada del recorrido se hizo sin costo. Estas son las deudas técnicas conocidas
que quedaron después de la migración final:

- **Terraform state es local del runner o de la laptop**. Para colaboración
  real habría que moverlo a Hetzner Object Storage (compatible con S3) o algún
  otro backend remoto. Hoy `tofu apply` desde otra máquina tendría que
  importar los recursos existentes primero.
- **No hay HA ni backup**. Si el server muere, hay que reprovisionar desde
  cero. Los PVCs de `local-path` no se replican.
- **El cert TLS del RabbitMQ es self-signed**. Se generó con `docker run
  alpine/openssl` para el AMQPS del puerto 5671. Los workers del cluster del
  profesor tienen que aceptarlo explícitamente o hacer `ssl.verify_none`.
- **El HPA está limitado por el techo del nodo**. Escala hasta el tope del
  VPS (4 vCPU); demostrar carga real requeriría multi-node.
- **La divergencia entre los ADRs y el runtime necesita releerse** con
  contexto. Los ADRs 019 a 024 siguen siendo válidos como razonamiento de
  diseño, pero el runtime actual no los aplica al pie de la letra. El ADR-029
  cierra ese gap.

Ninguna de esas es bloqueante para lo que el TP evalúa, y todas quedan
documentadas para un lector que quiera profundizar.

---

## 10. Lo que dejó este recorrido

Si tuviéramos que dar una lectura de ingeniería sobre todo este proceso,
sería algo así: **la parte más difícil de desplegar software en la nube en
2026 no es técnica**. La configuración de un cluster Kubernetes con
Terraform es una tarea acotada y reproducible. Lo que no es reproducible es
el estado del mercado de free tiers: cuáles están agotados, cuáles cambiaron
las políticas la semana pasada, cuáles tienen sobrevendida la capacidad en la
región donde te toca.

Ese contexto —que no es problema del TP y que un evaluador no ve— se lleva
horas y decisiones que después quedan invisibles en el resultado final. Este
documento existe para hacerlas visibles.

Y la reformulación final —"un VPS pago cumple con el requerimiento de
Kubernetes tan bien como un cluster managed, y USD 5 no valen otra ronda de
sorpresas"— es probablemente la lección más útil del proceso. Optimizar por
gratuidad tiene un techo antes de convertirse en tiempo perdido; reconocerlo
temprano habría ahorrado varias iteraciones.
