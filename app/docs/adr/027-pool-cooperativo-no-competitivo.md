# ADR-027: Pool de minado cooperativo, no competitivo

**Estado**: Superseded by [ADR-028](028-modo-competitivo-tras-flag.md)
**Fecha**: 2026-08-04

## Contexto

El enunciado pide un pool de minado con "modo cooperativo y competitivo". Son dos protocolos
distintos para repartir el trabajo de Proof of Work entre varios mineros:

- **Cooperativo**: se parte el espacio de nonces en rangos disjuntos y cada worker barre el
  suyo. Nadie repite trabajo ajeno.
- **Competitivo**: todos los mineros barren el mismo espacio completo y gana el primero que
  encuentra una solución. El trabajo duplicado es enorme y deliberado.

Había que decidir cuál implementar, y si tenía sentido implementar los dos.

## Decisión

El pool es **cooperativo**. El TrP subdivide la tarea en chunks disjuntos y los publica en
`tareas`; RabbitMQ los reparte entre los workers disponibles. El primero que encuentra un
nonce válido lo publica en `soluciones`, y las soluciones que lleguen después para la misma
tarea se descartan con `stale_task`.

El modo competitivo **no está implementado**.

## Consecuencias

### Positivas
- Con N workers el espacio se cubre N veces más rápido, sin desperdiciar cómputo.
- Es el modelo correcto para esta topología: los workers son nuestros, corren en
  infraestructura que controlamos y no tienen incentivo para hacer trampa. El desperdicio del
  modo competitivo compra resistencia a participantes maliciosos, un problema que acá no
  existe.
- El mecanismo de resolución de empates ya existe y está probado: el descarte por
  `stale_task` es exactamente lo que haría falta para arbitrar un modo competitivo.

### Negativas
- **Queda un ítem del checklist sin cubrir.** Es una decisión consciente, no un olvido, pero
  no deja de ser un faltante frente al enunciado.
- El sistema no modela la dinámica de una red abierta, que es el contexto donde el PoW
  realmente tiene sentido. Se pierde la oportunidad de mostrar empíricamente por qué el
  desperdicio competitivo es el precio del consenso sin confianza.
- Si un worker muere con su rango asignado, ese tramo del espacio queda sin explorar hasta
  que RabbitMQ reentregue el mensaje. En modo competitivo la caída de un minero no dejaría
  ningún hueco, porque todos cubren todo.

### Abiertas
- Implementarlo detrás de un flag (`TRP_MODE=cooperativo|competitivo`) permitiría medir los
  dos con la misma matriz de pruebas de carga. Sería un aporte fuerte para el informe: hoy
  el argumento de por qué el cooperativo es mejor acá está razonado, no medido.

## Alternativas consideradas

### Implementar solo el competitivo
Habría sido más fiel a cómo funciona una blockchain pública, pero multiplica el consumo por N
sin mejorar el tiempo esperado en nuestra topología. Con los recursos limitados del TP —y
midiendo que el sistema ni siquiera era compute-bound en las dificultades alcanzables— era
gastar capacidad para no ganar nada.

### Implementar los dos desde el principio
Es lo que pide el enunciado y sería lo ideal. Se descartó por presupuesto de tiempo frente a
otros ítems del checklist con más impacto (pruebas, observabilidad, autoescalado). La
decisión fue documentar honestamente la ausencia en lugar de entregar una implementación
apurada y sin medir.

### Un híbrido: rangos disjuntos con solapamiento parcial
Daría tolerancia a la caída de un worker sin duplicar todo el trabajo. Es una idea razonable
que no exploramos por falta de tiempo, y probablemente sea el punto medio correcto para un
pool de workers propios pero poco confiables.
