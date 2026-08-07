# Informe — análisis de resultados

Sistema de entradas con blockchain propia y Proof of Work.
**SDyPP — UNLU, 2026.**

Este documento une las dos capas de medición del trabajo: el benchmark de minería
GPU vs CPU de [Pilar 1](../Pilar1/) y las pruebas de carga del sistema distribuido
completo de [Pilar 2](../Pilar2/P5/). Los datos crudos están en
[`Pilar2/P5/resultados/`](../Pilar2/P5/resultados/) y los gráficos se regeneran con
`python Pilar2/P5/graficos.py`.

---

## 1. Arquitectura del sistema

El sistema completo es un emisor de entradas donde la blockchain es un servicio
más, no el centro: la app web firma operaciones con ECDSA en el browser y las
manda a un nodo coordinador que distribuye el minado entre workers.

### Componentes

| Componente | Tecnología | Rol |
|---|---|---|
| Frontend / Backend | Next.js 16 | Eventos y entradas, firma ECDSA P-256 en el browser, compra con MercadoPago, validación en puerta |
| **NCT** (Nodo Coordinador) | FastAPI | API REST de la blockchain, auto-miner, verificación de firma y de PoW, ownership de tickets |
| **TrP** (Task Router) | Python | Subdivide el espacio de nonces en chunks, monitorea la GPU, dispara el fallback a CPU |
| Workers GPU / CPU | CUDA C / Python | Minan: barren un rango de nonces buscando el que satisface la dificultad |
| Redis | — | Estado autoritativo: blockchain, ownership, locks distribuidos, heartbeats, logs |
| RabbitMQ | — | Colas de mensajes entre NCT, TrP y workers |

### Diagrama

```
                         ┌─────────────┐
                         │  Frontend   │  ←→  Postgres (datos de la app)
                         │  (Next.js)  │
                         └──────┬──────┘
                                │ HTTP /tx/mint | /tx/transfer (firma ECDSA)
                         ┌──────┴──────┐
                         │     NCT     │  ←→  Redis (blockchain, ownership, locks, logs)
                         └──────┬──────┘
                                │ RabbitMQ [tareas_pool]
                         ┌──────┴──────┐
                         │     TrP     │  ←→  Redis (heartbeats GPU)
                         └──────┬──────┘
                                │ RabbitMQ [tareas] — chunks disjuntos
                  ┌──────────────┼──────────────┐
                  │              │              │
            ┌─────┴─────┐  ┌────┴─────┐  ┌──────┴─────┐
            │ Worker GPU │  │   ...    │  │ Worker CPU │
            │ → CUDA bin │  │          │  │ (hashlib)  │
            └─────┬─────┘  └────┬─────┘  └──────┬─────┘
                  └─────────────┼───────────────┘
                                │ RabbitMQ [soluciones]
                         ┌──────┴──────┐
                         │     NCT     │ → verifica MD5 + dificultad → guarda bloque
                         └─────────────┘
```

Cómo se conectan las piezas: la app **nunca mina**. Firma operaciones, el NCT las
valida y encola, el TrP reparte el trabajo de minado, los workers lo ejecutan y
el NCT verifica el resultado antes de escribir el bloque. El detalle del flujo
está en §4.1.

---

## 2. Qué se midió, y con qué límites

Dos niveles distintos, que responden preguntas distintas:

| Nivel | Qué mide | Herramienta |
|---|---|---|
| **Micro** (Pilar 1) | Tiempo de encontrar un nonce válido, aislado | Notebooks en Colab, Tesla T4 |
| **Sistema** (Pilar 2) | *Time-to-confirm*: de enviar la transacción a verla en un bloque | `loadtest.py` contra el stack de docker compose |

### Tres limitaciones que condicionan la lectura

Conviene declararlas antes de los números, porque cambian cómo hay que
interpretarlos.

**1. El time-to-confirm es por bloque, no por transacción.** El gráfico de
evolución lo muestra sin ambigüedad: es una función escalón. En la transacción 16
el tiempo salta de golpe, porque todas las transacciones que entran en el mismo
bloque se confirman juntas. Por lo tanto, una corrida de 30 transacciones **no son
30 muestras independientes**: son ~2 observaciones (una por bloque) repetidas. Los
promedios que siguen son sólidos para comparar configuraciones entre sí, pero su
precisión estadística es mucho menor de lo que sugiere el `n=30`.

**2. No hubo repeticiones de la misma configuración.** Cada celda de la matriz se
corrió una vez. No hay intervalos de confianza.

**3. El minado local es en CPU.** Las corridas de Pilar 2 se hicieron con el
worker CPU sobre docker compose, sin GPU. La comparación GPU vs CPU vive
enteramente en el nivel micro.

---

## 3. Nivel micro: GPU vs CPU en el minado puro

Batería de Pilar 1, MD5 con prefijo creciente:

| Prefijo | Nonce encontrado | GPU (CUDA) | CPU (Python) | Speedup |
|---|---|---|---|---|
| `0` | 0 | 0,85 ms | 0,02 ms | **0,02×** |
| `00` | 42 | 0,92 ms | 0,06 ms | **0,07×** |
| `000` | 5.519 | 0,92 ms | 6,01 ms | 6,5× |
| `0000` | 16.374 | 0,91 ms | 17,20 ms | 18,9× |
| `00000` | 105.281 | 1,78 ms | 115,41 ms | 64,8× |
| `000000` | 1.736.235 | 15,05 ms | 1.919,94 ms | **127,6×** |

El cruce está entre 2 y 3 caracteres de prefijo. Con prefijos cortos **la CPU
gana**, porque el costo fijo de lanzar el kernel —reservar memoria en el
dispositivo, transferir, sincronizar— es mayor que el cómputo mismo. A partir de
ahí la ventaja de la GPU crece de forma acelerada, porque el trabajo se vuelve
suficientemente grande como para amortizar ese costo fijo y aprovechar el
paralelismo masivo.

Notar que el tiempo de GPU es casi plano hasta prefijo 5 (0,85 → 1,78 ms): la
placa resuelve esos espacios de búsqueda casi sin despeinarse, y lo que se mide es
básicamente el overhead. Recién en prefijo 6 el cómputo empieza a dominar.

---

## 4. Nivel sistema: qué gobierna el time-to-confirm

### 4.1 El pool de transacciones: cómo funciona y cómo escala

El minado no lo hace el NCT: lo reparte. El flujo completo es:

1. La app manda `POST /tx/mint` o `POST /tx/transfer` al NCT, firmado con la
   clave privada ECDSA del usuario (IEEE P1363 sobre el payload canónico).
2. El NCT verifica la firma, aplica las validaciones de dominio (p. ej. ownership
   en un transfer) y encola la transacción en `pending_transactions` (Redis).
3. El **auto-miner** —un thread de fondo del NCT que corre cada 3 s— detecta
   transacciones pendientes y publica un task de minado en la cola `tareas_pool`.
4. El **TrP** consume ese task, divide el espacio de nonces `[0, TOTAL)` en chunks
   disjuntos de `CHUNK_SIZE = 2.500.000` nonces y publica cada chunk en `tareas`.
5. Cada **worker** toma un chunk y barre su rango único `[start, end]` —con el
   binario CUDA si tiene GPU, con `hashlib` si es CPU—. Si encuentra el nonce que
   satisface la dificultad, publica la solución en `soluciones`.
6. El **NCT** recalcula el MD5 y verifica la dificultad antes de aceptar la
   solución. Es la autoridad final: no importa quién reporte, el resultado se
   valida contra los datos del bloque. Luego guarda el bloque y aplica los
   efectos de ownership.

### El pool es cooperativo por reparto de rangos disjuntos

El TrP reparte rangos que **no se solapan**: entre todos los workers vivos se
barre el espacio completo exactamente una vez, y cualquiera de ellos puede
encontrar el nonce ganador. Eso trae tres propiedades:

- **Sin trabajo duplicado**: el mismo nonce no se prueba dos veces.
- **Sin coordinación entre workers**: no necesitan acordar quién mina qué; el
  único coordinador es el TrP.
- **Idempotencia**: como todos prueban los mismos datos (mismo bloque, misma
  dificultad), da igual qué rango encuentre el nonce; la verificación del NCT
  decide.

### Las dos palancas de escalado

El pool escala con dos parámetros, y las mediciones de §4.2 muestran que no son
equivalentes:

- **Cantidad de workers (M)**: duplicar de M=1 a M=2, con chunks grandes, casi
  duplicó el throughput (2,13×). Solo rinde si hay chunks pendientes para ocupar
  a los workers nuevos.
- **Tamaño del chunk (fragmentación)**: bajar el chunk de 25% a 10% del rango
  rindió 5,05× —la palanca dominante— porque reduce la latencia de coordinación
  (cada subtarea termina antes) en vez de sumar cómputo.

### 4.2 Fragmentación del pool vs cantidad de workers

![Fragmentación](../Pilar2/P5/resultados/graficos/fragmentacion.png)

30 transacciones, dificultad 4:

| Configuración | Promedio | p50 | p95 |
|---|---|---|---|
| chunk 25%, M=1 | 17,74 s | 17,71 s | 30,63 s |
| chunk 25%, M=2 | 8,32 s | 8,33 s | 9,68 s |
| chunk 10%, M=1 | **3,51 s** | 3,38 s | 3,78 s |
| chunk 10%, M=2 | 4,37 s | 4,52 s | 4,99 s |

**El resultado central del trabajo:** fragmentar más el pool rindió **5,05×**,
mientras que duplicar los workers rindió **2,13×**. Y lo más contraintuitivo: con
chunk al 10%, **agregar un segundo worker empeoró** el tiempo (3,51 → 4,37 s).

La explicación es que son dos palancas que atacan cosas distintas. Bajar el
tamaño del chunk hace que cada subtarea termine antes, así que el NCT recibe una
solución candidata más rápido y no queda esperando a que un worker barra un rango
largo de punta a punta. Sumar workers, en cambio, solo ayuda si hay suficientes
chunks pendientes como para mantenerlos ocupados. Cuando el chunk ya es chico, un
worker solo alcanza para drenar la cola, y el segundo agrega coordinación —
distribución de mensajes, contención en el NCT al validar— sin trabajo útil que
absorber.

### 4.3 Predictibilidad, no solo velocidad

![Distribución](../Pilar2/P5/resultados/graficos/distribucion.png)

Este gráfico muestra algo que las tablas de promedios esconden. La configuración
chunk 25% / M=1 no es solamente la más lenta: es **la más impredecible**, con
tiempos dispersos entre 5 y 30 segundos. La configuración chunk 10% / M=1 se
concentra en una banda estrechísima alrededor de 3,5 s.

Para un sistema de venta de entradas, esa diferencia importa más que el promedio.
Un comprador que espera 5 segundos y otro que espera 30 en la misma tanda es un
problema de experiencia de usuario aunque el promedio "cierre".

### 4.4 El costo de la dificultad

![Dificultad](../Pilar2/P5/resultados/graficos/dificultad.png)

Escala logarítmica; línea llena es la mediana, punteada el promedio.

| Dificultad | M=1 mediana | M=2 mediana | Observaciones |
|---|---|---|---|
| 2 (`00`) | 3,51 s | 2,90 s | Sin diferencia significativa |
| 4 (`0000`) | — (sin medir) | 3,36 s | |
| 5 (`00000`) | 83,59 s | 24,38 s | **3 de 40 transacciones dieron TIMEOUT con M=1** |
| 6 (`000000`) | — | — | Con 4 workers: **10/10 en 37,4 s** ttc (tras corregir §4.6) |

Dos cosas para leer acá. La primera es la separación entre mediana y promedio en
dificultad 5 con un worker: 83,59 s contra 251,32 s. Esa brecha de 3× significa
que unas pocas transacciones tardaron muchísimo más que el resto, arrastrando el
promedio. Reportar solo el promedio habría hecho parecer típico un valor que no lo
es.

La segunda es que en esa misma celda **el 8% del lote nunca confirmó**. Con
dificultad 5 y un solo worker CPU, el sistema no solo se pone lento: empieza a
fallar. Era el techo práctico del diseño original; tras corregir los dos defectos
de §4.6, la dificultad 6 pasó a resolverse (10/10 en 37,4 s con 4 workers) y el
techo real del minado en CPU quedó recién en las dificultades 7-8, que se dejaron
**calculadas** con la velocidad medida de 904.373 hashes/s por worker (~1,2 min y
~20 min por bloque con 4 workers).

### 4.5 Comportamiento a lo largo del lote y volumen

![Evolución](../Pilar2/P5/resultados/graficos/evolucion.png)

La función escalón mencionada en §2. Sirve como evidencia visual de que el
sistema agrupa transacciones en bloques y de que el time-to-confirm de una
transacción depende de en qué bloque le tocó caer, no de su posición en la cola.

**Volumen: 1.000 y 10.000 transacciones.** Para separar el costo del minado del
costo de la coordinación se midió el volumen con dificultad baja (2 ceros) y
4 workers:

| Transacciones | Lote | Confirmadas | Tiempo total | ttc promedio | p95 |
|---|---|---|---|---|---|
| 1.000 | 100 | **1.000 / 1.000** | 46,4 s | 3,41 s | 3,75 s |
| 10.000 | 500 | **10.000 / 10.000** | 266,6 s | 6,61 s | 7,39 s |

Multiplicar el volumen por 10 solo duplicó el ttc promedio (3,41 → 6,61 s): lo
que crece linealmente con el volumen es el **tiempo total**, no la latencia
individual, porque el sistema agrupa en bloques (las 10.000 transacciones se
resolvieron en ~27 bloques). El throughput sostenido es de **37,5 tx/s** con cero
transacciones perdidas.

---

## 4.6 Dos defectos que las mediciones destaparon

Al intentar subir la dificultad más allá de 5 aparecieron dos problemas que se tapaban
entre sí. Vale contarlos porque son el ejemplo más claro del trabajo de este pilar: **medir
no solo produjo números, produjo diagnósticos.**

### El espacio de búsqueda estaba hardcodeado

`nct.py` fijaba `TOTAL = 10000000` y el NCT manda ese rango como `start`/`end` en cada
tarea, pisando siempre la variable de entorno equivalente del TrP. Esa variable, agregada
justamente para poder barrer configuraciones, **nunca tomaba efecto**.

El efecto es aritmético: con 6 ceros el nonce esperado es 16⁶ = 16.777.216, y el espacio
barrido eran 10.000.000. La solución **no estaba adentro** la mayor parte de las veces. La
dificultad 6 no era lenta, se estaba buscando en el lugar equivocado.

### Nadie descartaba el trabajo obsoleto

Cuando un worker encuentra el nonce, los chunks restantes de ese bloque siguen encolados y
los workers los barren igual — millones de nonces de un bloque ya cerrado. Y como la cola
es FIFO, los chunks del intento siguiente **esperan detrás de esa basura**.

Con rangos chicos casi no se nota. Al ampliar el rango se vuelve una espiral. Medido, para
un solo bloque: **8 intentos de minado, 160 chunks publicados y 55 todavía encolados** al
terminar la corrida.

El arreglo fue chico —el NCT ya purgaba la cola de soluciones, faltaba hacer lo mismo con
la de tareas antes de publicar un intento nuevo— y el efecto, grande:

| 10 tx, dificultad 6, 4 workers | Antes | Después |
|---|---|---|
| Confirmadas | 8/10 | **10/10** |
| Tiempo total | 250,9s | **37,6s** |
| ttc promedio | 236,9s | **37,4s** |

**6,3× más rápido y sin transacciones perdidas.** Detalle en
[`Pilar2/P5/resultados/RESUMEN-2026-08-05.md`](../Pilar2/P5/resultados/RESUMEN-2026-08-05.md).

## 4.7 Los dos protocolos, medidos

Con el modo competitivo implementado tras un flag, se corrió la misma matriz en ambos
(10 tx, dificultad 5, 4 workers, 3 repeticiones):

| Modo | ttc promedio | hashes promedio |
|---|---|---|
| Cooperativo | **4,57s** | 2,28M |
| Competitivo | 10,04s | 4,32M |

El competitivo resultó ~2,2× más lento y ~1,9× más caro. Pero la varianza entre
repeticiones es enorme (de 2,8s a 19,2s) porque la posición del nonce ganador sigue una
distribución geométrica, de cola larga por naturaleza: con 3 repeticiones los promedios dan
la dirección correcta, no un multiplicador preciso.

El dato exacto es el estructural, verificable sin correr nada: con N workers el modo
competitivo publica **N copias del espacio** contra **1 sola** del cooperativo. Y más
importante que el multiplicador: en modo competitivo **agregar workers no acelera nada**,
porque todos arrancan en el mismo nonce y recorren el mismo espacio. El cooperativo divide
y escala; el competitivo replica y no.

Eso confirma con datos propios lo que hasta ahora era solo un argumento: el desperdicio del
modo competitivo compra resistencia a mineros que no confían entre sí, y en un pool de
workers propios se paga sin obtener nada a cambio.

## 4.8 Resiliencia: fallback GPU→CPU y caída de workers

El sistema no asume que la GPU va a estar siempre. El gpu-server publica un
heartbeat (`heartbeat:gpu-server`) en Redis cada 10 s con TTL de 30 s, y el TrP
corre un `monitor_loop` cada 15 s que revisa si la clave sigue viva:

| Fase | Qué se hizo | Tiempo medido |
|---|---|---|
| **Ingreso** (GPU vuelve) | Arrancar el emisor de heartbeat | 28,7 s / 25,4 s |
| **Egreso** (GPU cae) | Parar el emisor → activar fallback CPU | 45,1 s / 45,0 s |

Cuando la GPU cae, el TrP guarda la dificultad vigente, la baja a `"0"` (mucho
más fácil, para que el worker CPU confirme rápido) y escala el deployment
`worker-cpu` vía la API de Kubernetes. Cuando vuelve, restaura la dificultad
original (`"00"`) y baja los workers a 0. La transición es **atómica**: se hace
con `SET NX` sobre `trp:fallback_active` en Redis, así con varias réplicas de TrP
solo una ejecuta el cambio.

El egreso es el caso interesante: no lo detecta el TrP al instante, sino cuando
la clave expira por TTL (30 s) y el siguiente ciclo del monitor lo confirma
(≤15 s después) — por eso el tiempo medido ronda los 45 s. El ingreso es más
rápido porque no hay TTL de por medio: alcanza con que el monitor vea la key una
vez.

También se probó la caída brusca de un worker a mitad del minado (kill del
contenedor durante una emisión de 10 mints con dificultad 5). Los workers
consumen con `auto_ack=False` y ack manual: la tarea queda unacked mientras se
mina, y RabbitMQ **reentrega el mensaje** si la conexión muere. Medido: los
4 chunks quedaron unacked, al matar el worker pasaron a `ready` en ~2 s, y el
worker reiniciado los re-minó (redeliver 0→4, los mismos rangos disjuntos, sin
duplicados). Resultado: **10/10 ops CONFIRMED**, la cadena pasó de 27 a 28
bloques. Ninguna transacción se perdió.

---

## 5. Síntesis: los dos niveles juntos

Acá está, para nosotros, la conclusión más interesante del trabajo.

Pilar 1 demuestra que la GPU puede ser **127× más rápida** hasheando. Pilar 2
demuestra que, en el sistema completo y a las dificultades que pudimos medir, la
palanca dominante no fue la potencia de cómputo sino **cómo se reparte el
trabajo**: cambiar el tamaño del chunk rindió 5×, sin tocar una sola línea del
minero.

Eso no contradice el resultado de Pilar 1, lo pone en contexto. El speedup de la
GPU aplica a la porción del tiempo que se gasta hasheando. En dificultad 4, esa
porción no era la que dominaba el time-to-confirm: dominaban la granularidad de
las subtareas y la latencia de coordinación entre NCT, TrP y workers. Acelerar el
hashing 127× no habría movido mucho la aguja mientras el cuello de botella estaba
en otro lado.

La transición se ve empezar en dificultad 5, donde aparecen los timeouts: ahí sí
el cómputo pasa a ser el límite, y ahí sí una GPU cambiaría el resultado
cualitativamente. Es exactamente la razón por la que las blockchains reales, que
operan con dificultades muchísimo mayores, son inequívocamente compute-bound.

**En una frase:** optimizar el componente más llamativo no sirve si el cuello de
botella está en otra parte, y solo la medición del sistema completo dice dónde
está.

---

## 6. Reflexión crítica

### 6.1 Limitaciones de la arquitectura

**El NCT es un punto único de falla.** Concentra la API, el auto-miner, la
validación y la escritura de la cadena. Tiene 2 réplicas con un lock distribuido
en Redis, pero el lock serializa el minado: dos réplicas no minan dos bloques en
paralelo, se turnan. Escala la disponibilidad, no el throughput.

**La dificultad es fija.** Las blockchains reales la reajustan solo para mantener
constante el tiempo entre bloques. Acá se fija a mano y solo se mueve por el
fallback GPU→CPU. Sin ajuste automático, un cambio en la capacidad de minado
desplaza el tiempo de bloque sin que el sistema reaccione.

**El tamaño de chunk es una constante global.** Después de haber medido que es la
variable más influyente, es notable que sea un parámetro fijo y no algo que el TrP
ajuste según la cantidad de workers vivos y la dificultad vigente. Es la mejora
con mejor relación esfuerzo/beneficio que identificamos.

**El fallback depende de la API de Kubernetes.** `scale_cpu_workers()` escala el
deployment vía la API in-cluster. Fuera de un cluster —por ejemplo, en el compose
local— falla y solo deja un error en el log. Funciona, pero acopla la lógica de la
blockchain a su plataforma de despliegue.

**El pool es cooperativo por defecto.** El reparto de rangos disjuntos es la
decisión correcta para workers propios que colaboran; el modo competitivo existe
tras un flag y se midió en §4.7, pero solo agrega costo. El sistema no modela la
dinámica de una red abierta donde los mineros compiten y no confían entre sí.

### 6.2 Limitaciones de la medición

- Una sola corrida por configuración, sin intervalos de confianza.
- ~2 observaciones independientes reales por corrida, por la confirmación en bloque.
- Sin datos de GPU a nivel sistema: la comparación GPU vs CPU es solo micro.
- Dificultad medida en el rango efectivo 2 a 6 (la 6 se alcanzó tras corregir los
  defectos de §4.6). Las 7 y 8 se dejaron **calculadas** con la velocidad medida
  de 904.373 hashes/s por worker (~1,2 min y ~20 min por bloque con 4 workers).
  El checklist pedía hasta 8; con minado en CPU preferimos documentar el techo
  medido y extrapolar lo que sigue, en lugar de una corrida abandonada por timeout.
- Bulks medidos hasta **10.000 transacciones** (10.000/10.000 en 266,6 s, a
  37,5 tx/s sostenidos). Las 100.000 del enunciado no se corrieron: al ritmo
  medido son ~44 minutos de corrida única, y el throughput ya está caracterizado
  y estable entre 1.000 y 10.000, así que correrlas agregaría confirmación, no
  información nueva.

### 6.3 Mejoras propuestas, en orden de impacto esperado

1. **Chunk adaptativo.** Que el TrP calcule el tamaño en función de los workers
   vivos y la dificultad, en lugar de usar una constante. Es la palanca que
   medimos como dominante.
2. **Ajuste automático de dificultad**, apuntando a un tiempo de bloque objetivo.
3. **Desacoplar el auto-miner del NCT**, para que la coordinación y la API puedan
   escalar por separado.
4. **Persistir la cadena fuera de Redis** (o replicar Redis), hoy es el único
   lugar donde vive el estado autoritativo.
5. **Modo competitivo detrás de un flag**, que además permitiría comparar los dos
   protocolos con la misma matriz de pruebas.

### 6.4 ¿Dónde aplicaría esta solución en un contexto real?

Con honestidad: **una blockchain propia con PoW no es la respuesta correcta para
vender entradas.** El PoW existe para lograr consenso entre partes que no confían
entre sí, y acá hay un operador único —nosotros— que ya es la autoridad. Estamos
pagando el costo del consenso descentralizado sin obtener su beneficio.

Lo que sí resuelve bien el sistema, y es la parte que valdría la pena conservar,
es el **modelo de propiedad criptográfica**: cada entrada pertenece a una clave
pública, cada transferencia va firmada, y la validación en puerta es una
transferencia de vuelta al organizador. Eso hace que una entrada no se pueda
duplicar ni usar dos veces, y que el asistente pueda probar que es suyo sin
depender de la palabra del emisor. Ese diseño resuelve la reventa fraudulenta y el
doble uso, que son los problemas reales del negocio.

En una implementación productiva, ese modelo iría sobre una blockchain existente
—donde el consenso ya es un servicio— o directamente sobre un registro firmado y
auditable, sin PoW. El valor de haberlo construido desde cero es entender
exactamente qué aporta cada pieza y, sobre todo, cuál no hacía falta.
