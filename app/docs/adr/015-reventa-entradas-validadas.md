# ADR-015: Reventa de entradas validadas (decisión pendiente)

**Estado**: Proposed — decisión pendiente
**Fecha**: 2026-06-20

## Contexto

[ADR-005](005-validacion-como-transferencia.md) definió que "validar = transferir la entrada
de vuelta al organizador". Eso resuelve elegantemente que el comprador no pueda re-entrar
(su QR ya no verifica porque dejó de ser el dueño on-chain).

**Pero** abre un agujero: el endpoint `POST /api/events/[id]/buy` busca "entradas disponibles"
como **"cualquier `Ticket` del evento cuyo `ownerPublicKey` sea el del organizador"**. Eso
incluye:

1. Entradas nunca vendidas (correcto).
2. Entradas que volvieron al organizador **por una validación** en puerta (no debería estar
   disponible — ya se "consumió").

Hoy las dos cosas son indistinguibles. Consecuencia: un organizador (deshonesto o por bug)
puede revender la misma entrada N veces — emitir 100 → vender 100 → validar 100 → vender 100
de nuevo. La BC no lo detecta porque cada transferencia es válida en sí misma.

En un evento con cupo limitado eso es overbooking real, y para el TP es un agujero conceptual
visible en la demo (cualquier evaluador prueba el flujo y lo encuentra).

## Estado actual

Está marcado como **bug conocido**. Por ahora dejamos el comportamiento como está y postergamos
la decisión hasta más adelante (probablemente cuando integremos el NCT real y podamos
coordinar con el equipo de blockchain qué primitiva ofrecen).

## Opciones consideradas

### Opción 1 — Flag `usedAt` en la tabla `Ticket` (app-only)

Agregar a `Ticket`:

```
usedAt  DateTime?  // set cuando se valida en puerta
```

Modificar `submitTransfer({reason: "validation"})` para que escriba `usedAt = now()`.
Modificar `/api/events/[id]/buy` para filtrar `usedAt == null` además de
`ownerPublicKey == organizer`.

**Pros**
- Cambio mínimo, todo en código nuestro.
- No requiere coordinar con el equipo del NCT.
- Fácil de explicar y de testear.

**Contras**
- Vuelve a tener "doble fuente de verdad": el dueño está on-chain, pero el "está consumida"
  está solo en nuestra DB. Cuando llegue el NCT real, hay riesgo de desincronización.
- Si la app pierde la DB, no podemos reconstruir el estado "usada" desde la BC.
- Filosóficamente contradice [ADR-009](009-tabla-ticket-espejo-onchain.md) — la tabla `Ticket`
  debía ser cache/index, no fuente de verdad.

### Opción 2 — Burn address (transferencia a una pubkey "de nadie")

Cuando se valida, en vez de transferir la entrada al organizador, transferirla a una
dirección reservada `BURN_ADDRESS` cuya clave privada no tiene nadie. Las consultas de
"disponibles" se mantienen como están (sigue siendo "del organizador"), las entradas
consumidas quedan en la BC como propiedad de la burn address.

Variantes:
- **Burn address global**: una sola para toda la red, ej. `pase://burn`.
- **Burn address por evento**: `pase://burn/{eventId}`. Permite ver "cuántas entradas se
  validaron en cada evento" con una sola query.

**Pros**
- 100% on-chain. La unicidad y la consumición conviven en la BC, sin flags externos.
- Cualquier nodo de la BC puede ver el historial completo y entender qué entradas se
  consumieron.
- Coherente con [ADR-005](005-validacion-como-transferencia.md) y
  [ADR-009](009-tabla-ticket-espejo-onchain.md) — no agrega doble fuente de verdad.

**Contras**
- Requiere coordinar con el equipo del NCT: ¿la BC permite recibir transferencias a una
  pubkey "no registrada"? ¿Hay que registrar la burn address explícitamente? ¿La BC valida
  que la burn address nunca puede transferir hacia afuera?
- Si el NCT no valida la burn address, hay que confiar en que nadie genere una clave que
  colisione (probabilidad criptográficamente despreciable, pero filosóficamente "trust me").

### Opción 3 — Híbrida: tipo de transferencia + filtro semántico

Agregar al modelo de transacción on-chain un campo `reason: "purchase" | "validation"`. El
dueño sigue volviendo al organizador, pero al consultar "disponibles" filtramos:
**"tickets del organizador sin ninguna `validation` previa en su historial"**.

**Pros**
- Mantiene "validación = devolver al organizador" sin meter una burn address.
- El historial está siempre en la BC; recomponer el estado es siempre posible.

**Contras**
- Requiere que la BC del NCT exponga el historial de cada ticket (queries de "todas las txs
  de este ticket"). Si solo guarda el estado actual, hay que agregar indexación.
- En la práctica equivale a la opción 1 si lo resolvemos del lado app (cache del historial),
  o a una versión más complicada de la opción 2 si va a la BC.

## Decisión

**Pospuesta.** Por ahora el comportamiento actual queda documentado como bug conocido. La
decisión real se toma cuando:

1. El equipo del NCT confirme qué primitivas ofrece (permite burn addresses? expone
   historial de txs por ticket?).
2. Tengamos una primera integración real para ver qué encaja.

Mientras tanto, en el TP la demo del ciclo completo (emitir → comprar → validar) funciona
bien siempre y cuando no se intente revender lo validado. Sirve para mostrar el flujo
end-to-end.

## Recomendación tentativa para cuando se decida

**Opción 2** si el equipo del NCT está dispuesto. Es la más consistente con el resto del
diseño y no agrega deuda técnica.

**Opción 1** como fallback rápido si la coordinación con NCT se complica — explícitamente
deuda técnica, anotar el problema y resolverla post-MVP.

## Consecuencias del estado actual (mientras no se decida)

### Conocidas / Aceptadas
- En la demo, si alguien valida una entrada y después intenta comprar de nuevo, **puede**
  comprar lo que se validó. Hay que evitar mostrar ese caso en la demo o explicarlo como
  bug conocido si surge.
- El total de "entradas vendidas" + "entradas validadas" puede superar el `ticketCount`
  emitido — no porque la BC mienta, sino porque estamos contando re-ventas.

### Abiertas
- Confirmar con el equipo del NCT antes de la integración real.
- Si vamos por Opción 2, definir formato exacto de la `BURN_ADDRESS`.
- Si vamos por Opción 1, planificar la migración a un mecanismo on-chain post-NCT.
