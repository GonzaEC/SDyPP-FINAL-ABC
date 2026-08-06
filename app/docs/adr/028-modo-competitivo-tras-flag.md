# ADR-028: Modo competitivo detrás de un flag, cooperativo por default

**Estado**: Accepted
**Fecha**: 2026-08-05
**Supersedes**: [ADR-027](027-pool-cooperativo-no-competitivo.md)

## Contexto

El [ADR-027](027-pool-cooperativo-no-competitivo.md) dejó por escrito que el pool es
cooperativo y que el modo competitivo **no estaba implementado**, con el argumento de que
duplicar el trabajo no aporta cuando los workers son propios y colaboran.

El argumento sigue siendo correcto, pero tenía una debilidad: estaba **razonado, no medido**.
El propio ADR-027 lo anotaba como pregunta abierta. Y el enunciado de la materia pide
explícitamente los dos modos.

Al implementarlo apareció además un dato que refuerza la decisión original: midiendo la
velocidad real de minado (**904.373 hashes/s por worker**), quedó claro que el sistema no
estaba limitado por cómputo en las dificultades que se venían usando. El desperdicio del
modo competitivo, entonces, no solo no ayuda: consume capacidad en el único recurso que sí
escaseaba.

## Decisión

Implementar el modo competitivo **detrás de un flag**, con el cooperativo como default:

```
TRP_MODE=cooperativo   (default)  → chunks disjuntos de CHUNK_SIZE
TRP_MODE=competitivo              → el rango completo, N veces
TRP_COMPETITIVE_COPIES=auto       → N = workers vivos según heartbeats
```

En modo competitivo el TrP publica el rango `[start, end]` completo una vez por worker vivo,
en lugar de partirlo. Todos arrancan en el mismo nonce y gana el primero que encuentra
solución.

**No hubo que tocar el NCT.** El árbitro ya existía: acepta la primera solución válida y
descarta las siguientes de la misma tarea con `stale_task`. Ese mecanismo, escrito para
tolerar soluciones tardías del modo cooperativo, resultó ser exactamente lo que el modo
competitivo necesita.

El objetivo del flag es **poder medir**, no ofrecer una alternativa recomendada para
producción. El default no cambia.

## Consecuencias

### Positivas
- El ítem del enunciado queda cubierto con una implementación real, no con una explicación.
- El argumento del ADR-027 pasa de razonado a **demostrable**: corriendo la misma matriz de
  carga en los dos modos, `worker_hashes_total` expone el desperdicio como un número.
- La métrica `trp_mode_competitive` (0/1) deja el protocolo activo visible en Prometheus, así
  que al comparar dos corridas se puede saber desde los datos en qué modo corrió cada una.
- El costo teórico es exacto y verificable: con N workers, el modo competitivo publica N
  veces el espacio de nonces contra 1 vez del cooperativo.

### Negativas
- Hay un camino de código que en producción nunca se va a usar. Es deuda deliberada: existe
  para la demostración experimental.
- El conteo de workers vivos arrastra una asimetría del sistema: solo `worker_cpu.py`
  publica heartbeat propio; los workers GPU se representan con la única clave
  `heartbeat:gpu-server`. Con varios workers GPU el conteo los cuenta como uno.
- Sin `basic_qos(prefetch_count=1)` en los workers, RabbitMQ reparte round-robin al publicar.
  Con N copias y N workers cada uno recibe una, que es lo buscado; si los números no
  coinciden, el reparto se desbalancea.

### Abiertas
- El modo competitivo no cancela nada cuando alguien gana: los workers perdedores siguen
  barriendo su copia hasta agotarla. Es el mismo problema que ya tiene el cooperativo con los
  chunks obsoletos (nadie purga la cola `tareas`), pero acá se amplifica porque cada copia es
  el espacio entero.

## Alternativas consideradas

### Dejarlo sin implementar (lo que decía el ADR-027)
Defendible, y sostuvimos esa posición mientras el costo de implementarlo parecía alto.
Al leer el código quedó claro que no lo era: el árbitro ya estaba escrito y el cambio se
concentraba en una sola función del TrP. Con ese costo real, la decisión se dio vuelta.

### Implementarlo como default
Descartado sin dudar. Multiplica el consumo por N sin mejorar el tiempo esperado en una
topología de workers propios que colaboran.

### Cancelar el trabajo de los perdedores
Sería lo correcto para un pool competitivo serio: al confirmar un bloque, purgar `tareas` o
hacer que los workers verifiquen si su `task_id` sigue vigente. Se dejó fuera del alcance
porque el problema **ya existe en el modo cooperativo** y arreglarlo bien es un cambio de
diseño propio, no un apéndice de este ADR.
