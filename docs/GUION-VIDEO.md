# Guion del video explicativo

Requerido por el checklist (§6): *"Grabación de video subida al repositorio explicando
servicios, componentes y configuraciones (debe demostrar comprensión de cada punto)."*

**Duración objetivo: 12-15 minutos.** El énfasis está en *demostrar comprensión*, no en
recorrer archivos. La regla para cada bloque: mostrar algo funcionando y explicar **por qué
está hecho así**, no qué hace.

---

## Antes de grabar

```bash
docker compose up -d --build
```

Esperá a que los 12 servicios estén healthy (`docker compose ps`). Tené abiertas:

| Pestaña | URL |
|---|---|
| App | http://localhost:3000 |
| NCT | http://localhost:8000/status |
| Grafana | http://localhost:3001 (admin/admin) |
| Prometheus | http://localhost:9090 |

Y una terminal con el repo. **Grabá una corrida real**, no una simulada: el sistema anda y
se nota la diferencia.

---

## 1. Qué es el sistema · 1,5 min

**Pantalla:** el diagrama del README raíz.

Sistema de venta de entradas donde cada entrada es un activo criptográfico en una blockchain
propia con Proof of Work. Tres pilares: CUDA/GPU, blockchain distribuida, e infraestructura.

**El punto a transmitir:** la entrada no es una fila en una base de datos, es propiedad
verificable. Cada usuario tiene un par de claves ECDSA P-256 generado en el browser; la
pública es su identidad on-chain. Una transferencia va firmada, y la validación en puerta
es una transferencia de vuelta al organizador — por eso una entrada no se puede usar dos
veces sin que la cadena lo delate.

---

## 2. Arquitectura y componentes · 3 min

**Pantalla:** `docker compose ps`, después el diagrama de `Pilar2/README.md`.

Recorré el flujo de una emisión, que es donde se ve cómo encajan las piezas:

```
app → NCT /tx/mint → pending_transactions (Redis)
auto-miner → [tareas_pool] → TrP subdivide → [tareas]
   → workers minan → [soluciones] → NCT valida → bloque
```

| Componente | Qué hace | Por qué está separado |
|---|---|---|
| **NCT** | API, validación de firma y de PoW, dueño de la cadena | Es la autoridad: nadie más escribe bloques |
| **TrP** | Reparte el espacio de nonces, monitorea la GPU | Separa *coordinar* de *decidir* |
| **Workers** | Minan (GPU vía CUDA, o CPU) | Escalan horizontalmente sin tocar el resto |
| **Redis** | Cadena, ownership, heartbeats | Estado compartido con AOF |
| **RabbitMQ** | Las cuatro colas | Desacopla productores de consumidores |

**Mencioná las dos réplicas del NCT y el lock distribuido**: dos pods atienden HTTP pero
solo uno minera a la vez, con un `SET NX EX` con token único en Redis. Si el que mina muere,
el TTL libera el lock y el otro toma el relevo.

---

## 3. Demo en vivo: emitir y ver el minado · 3 min

**Pantalla:** la app, después Grafana.

1. Entrá como organizador, creá un evento y emitilo. La firma ECDSA se hace **en el browser**
   con WebCrypto — la clave privada nunca sale de ahí.
2. Mostrá el panel `/panel` con la cadena creciendo.
3. Pasá a Grafana, dashboard **Tesera — Blockchain & Minería**:
   - "Bloques minados por minuto"
   - "Hashes por segundo (CPU vs GPU)"
   - "Tiempo de minado por prefijo"

**El punto:** no es una demo de UI, es mostrar que cada acción de negocio deja rastro medible
en la infraestructura. Y que la observabilidad no se agregó al final: los servicios están
instrumentados con métricas, logs JSON y trazas OTLP propagadas por RabbitMQ, así que una
operación se sigue de punta a punta.

---

## 4. El fallback GPU → CPU · 2 min

**Pantalla:** logs del TrP + el panel "GPU viva / Fallback CPU".

```bash
docker compose logs -f trp
```

Explicá el mecanismo: el gpu-server publica un latido cada 10s, el TrP lo guarda en Redis con
TTL 30s y revisa cada 15s. Si el latido falta, baja la dificultad y escala los worker-cpu.

**Acá está el dato que demuestra comprensión** — lo medimos:

| Transición | Medido | Por qué ese número |
|---|---|---|
| Ingreso (GPU vuelve) | 25-29s | Solo el ciclo del monitor (15s) |
| Egreso (GPU cae) | ~45s | TTL de Redis (30s) + un ciclo del monitor (15s) |

El egreso no es instantáneo **por diseño**: el sistema espera a que expire el TTL antes de
declarar muerta la GPU, para no reaccionar a un latido perdido.

---

## 5. Los dos protocolos del pool · 2 min

**Pantalla:** `Pilar2/P5/trp.py`, la función `subdivide_and_publish`.

- **Cooperativo** (default): el espacio se parte en chunks disjuntos, nadie repite trabajo.
- **Competitivo**: el rango completo se publica una vez por worker; gana el primero.

```bash
TRP_MODE=competitivo docker compose up -d trp
```

**El punto conceptual:** el modo competitivo desperdicia cómputo a propósito, y en una
blockchain pública **ese desperdicio es el mecanismo de seguridad** — con mineros
desconocidos no podés asignar rangos, porque nadie garantiza que busquen donde dijeron.
Acá los workers son nuestros, así que el cooperativo es lo correcto.

Mostrá el número: con N workers, el competitivo publica **N veces** el espacio contra 1 vez
del cooperativo. Está medido en los CSV de `resultados/`.

---

## 6. Infraestructura y producción · 2,5 min

**Pantalla:** `infra/gke.tf`, `k8s/gke/`, `.github/workflows/`.

- **IaC**: OpenTofu levanta VPC, cluster GKE y tres node pools. Cluster Autoscaler en `apps`
  (2-5 nodos).
- **Separación de cargas impuesta**: taints en `apps` y `monitoring`, con tolerations en cada
  workload. **Mencioná por qué `infra` quedó sin taint**: los addons de GKE (CoreDNS,
  metrics-server) solo toleran `CriticalAddonsOnly`; si tainteábamos los tres pools, el DNS
  del cluster se rompía.
- **Endurecimiento**: los 7 workloads corren `runAsNonRoot`, con uid explícito y todas las
  capabilities dropeadas.
- **StatefulSets** para Postgres, Redis y RabbitMQ, con `volumeClaimTemplates`: cada réplica
  con su propio disco.
- **HPA** para frontend y NCT. **Explicá por qué el worker-cpu queda afuera**: sus réplicas
  ya las maneja el TrP durante el fallback, y dos controladores sobre el mismo campo
  producirían flapping.
- **5 pipelines** con Gitleaks como gate, autenticación por Workload Identity — cero llaves
  estáticas en el repo.

---

## 7. Resultados y análisis · 2 min

**Pantalla:** los gráficos de `Pilar2/P5/resultados/graficos/`.

**Hallazgo 1 — fragmentar el pool domina sobre agregar workers.** Bajar el chunk de 25% a
10% aceleró 5,05×; duplicar los workers, 2,13×. Y con chunk chico, el segundo worker
**empeoró** el tiempo.

**Hallazgo 2 — no es solo velocidad, es predictibilidad.** El boxplot muestra que la peor
configuración dispersa entre 5 y 30 segundos, mientras la mejor se concentra en 3,5.

**Hallazgo 3 — la síntesis de los dos pilares.** Pilar 1 midió que la GPU hashea 127× más
rápido. Pero a nivel sistema, la palanca dominante fue **cómo se reparte el trabajo**, no la
potencia de cómputo. No se contradicen: el speedup de la GPU aplica a la fracción del tiempo
que se gasta hasheando, y en dificultad 4 esa fracción no era la que mandaba.

**Cerrá con la limitación metodológica**, que suma credibilidad: el time-to-confirm es **por
bloque**, no por transacción. Una corrida de 30 transacciones son ~2 observaciones
independientes, no 30.

---

## 8. Reflexión final · 1 min

**Pantalla:** `docs/INFORME.md` §5.

La conclusión incómoda y honesta: **una blockchain propia con PoW no es la solución correcta
para vender entradas.** El PoW existe para lograr consenso entre partes que no confían entre
sí, y acá hay un operador único que ya es la autoridad — se paga el costo del consenso
descentralizado sin obtener su beneficio.

Lo que sí resuelve un problema real es el **modelo de propiedad criptográfica**: entradas que
no se pueden duplicar ni usar dos veces, y un asistente que puede probar que la entrada es
suya sin depender de la palabra del emisor.

El valor de haberlo construido desde cero es entender qué aporta cada pieza — y cuál no hacía
falta.

---

## Checklist antes de subir

- [ ] Se ve el sistema **funcionando**, no diapositivas
- [ ] Cada bloque explica un **por qué**, no solo un qué
- [ ] Aparecen los números medidos (5,05× · 45s · 904k hashes/s · 127×)
- [ ] Se nombran las decisiones con su razón: taint en infra, HPA sin worker-cpu, TLS por ADR-012
- [ ] Audio audible y terminal con fuente grande
- [ ] Subido al repo o enlazado desde el README
