# ADR-026: Autoescalado por HPA, con el worker-cpu fuera

**Estado**: Accepted
**Fecha**: 2026-08-04

## Contexto

El cluster no tenía ningún tipo de elasticidad: los tres node pools con `node_count` fijo y
ningún `HorizontalPodAutoscaler`. Al agregarlos apareció una pregunta que no tiene respuesta
obvia: **¿el `blockchain-worker-cpu` debería tener HPA?**

Es el candidato más intuitivo —es la carga que más varía— pero también es el único
deployment cuyas réplicas ya están gobernadas por otro componente. El TrP arranca el worker
en `replicas: 0` y lo escala vía la API de Kubernetes (`scale_cpu_workers()`) cuando deja de
recibir el heartbeat del gpu-server.

## Decisión

HPA para **frontend** (2-6) y **blockchain-nct** (2-4), por CPU al 70%. Cluster Autoscaler
en los pools `apps` (2-5) e `infra` (1-2).

**El `worker-cpu` queda deliberadamente fuera del HPA.** Su ciclo de vida lo sigue manejando
el TrP.

## Consecuencias

### Positivas
- Las dos capas de escalado se complementan: el HPA suma pods, el Cluster Autoscaler suma
  nodos cuando el pool se queda sin lugar. Con una sola de las dos, el escalado se corta en
  el primer cuello.
- Se evita el flapping: dos controladores escribiendo `spec.replicas` con criterios opuestos
  habrían peleado. El TrP escala **up** por ausencia de GPU, que es una señal de
  disponibilidad; el HPA habría escalado **down** por CPU baja, que es exactamente lo que ve
  mientras los pods recién creados todavía no tomaron tareas de la cola. El fallback nunca
  habría terminado de activarse.
- El máximo del NCT es bajo (4) a propósito: sumar réplicas escala la atención de requests
  HTTP pero **no el minado**, porque el lock distribuido en Redis serializa la creación de
  bloques. Más réplicas solo agregan contención sobre Redis.

### Negativas
- El worker-cpu no reacciona a la carga real: se prende por el fallback de GPU, no porque la
  cola `tareas` esté llena. Con GPU viva y una ráfaga grande de transacciones, no hay nada
  que sume capacidad de minado.
- La lógica de escalado del worker queda dentro del código de la blockchain, acoplada a la
  API de Kubernetes. Fuera de un cluster —el compose local— falla y solo deja un error en el
  log.

### Abiertas
- Los umbrales (70% de CPU, máximos de 6 y 4) son estimaciones. No se pudieron calibrar
  contra carga real porque no hay cluster.

## Alternativas consideradas

### HPA sobre el worker-cpu igual, con `minReplicas: 0`
La API de HPA no admite `minReplicas: 0` sin habilitar un feature gate, y aunque se pudiera,
no resuelve el conflicto de fondo: seguirían siendo dos controladores decidiendo lo mismo
con información distinta.

### Sacarle al TrP la responsabilidad y dársela al HPA
Es la solución correcta a largo plazo, pero la métrica que habría que usar no es la CPU sino
**la profundidad de la cola `tareas`** (`rabbitmq_queue_messages_ready`, que el plugin de
Prometheus ya expone), vía un HPA con métricas externas. Eso requiere el adapter de métricas
custom instalado en el cluster y, sobre todo, poder probarlo. Queda como la evolución natural
cuando haya cluster de nuevo: reemplazaría al mecanismo del TrP en vez de competir con él.

### Autoescalar también el pool `monitoring`
Se descartó. Aloja singletons del stack LGTM y es el único pool on-demand del cluster; dejarlo
crecer solo agregaría costo sin resolver ningún cuello real.
