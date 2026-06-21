# ADR-017: Reventa peer-to-peer entre asistentes (mock)

**Estado:** Aceptada
**Fecha:** 2026-06-21

## Contexto

Hasta ahora, las entradas viajan en una sola dirección: el organizador las emite, los
asistentes las compran, y al validarlas vuelven al organizador como estado terminal
(ver [ADR-005](005-validacion-como-transferencia.md) y [ADR-015](015-reventa-entradas-validadas.md)).

Falta un caso que existe en la vida real: un asistente que ya no puede ir al evento
quiere venderle su entrada a otro asistente. Esto se llama **reventa peer-to-peer**
y es la pieza K1 del roadmap.

## Decisión

Implementamos reventa P2P **contra el mock** (la BC real puede manejar transferencias
arbitrarias, así que el modelo es portable cuando el NCT esté listo). Las restricciones:

1. **Solo el dueño actual** de una entrada puede listarla.
2. **No se listan entradas validadas** (consumidas — ver [ADR-015](015-reventa-entradas-validadas.md)).
3. **Precio con tope**: máximo 2× el precio original del evento (anti-scalping suave).
4. **Estados del listing**: `ACTIVE → SOLD | CANCELLED`. Un ticket tiene a lo sumo
   un listing activo a la vez.
5. **Cobro**: la plata pasa por la cuenta MP del platform owner (la nuestra) — el TP
   no implementa MP Connect / marketplace OAuth, así que no hay split automático.
   En producción real se necesitaría que cada vendedor enganche su propia cuenta MP.
6. **Transferencia on-chain**: al confirmarse el pago (webhook MP `approved`), se
   dispara `submitTransfer` con `reason="resale"` y `fromPublicKey = seller.publicKey`,
   `toPublicKey = buyer.publicKey`. El listing pasa a `SOLD`.

## Modelo de firma de la transferencia (deuda con E5)

Como el vendedor no necesariamente está online cuando el comprador paga, la firma
de la transferencia del vendedor es un problema abierto. En el mock no importamos:
el mock no verifica firmas. Cuando integremos el NCT real (Parte 2 del roadmap),
necesitaremos uno de estos:

- **Pre-firma al listar**: el vendedor firma "doy permiso de transferir #42 a quien
  pague" cuando publica el listing; el sistema guarda esa firma y la usa al confirmar.
- **Escrow de la entrada**: al listar, transferimos #42 a una "operator key" del
  platform; al pagar, el platform la transfiere al comprador. Requiere confianza
  en el platform.
- **Síncrono**: el vendedor tiene que aprobar en vivo cada venta. UX malo.

La decisión queda pendiente para E5 y un futuro ADR cuando hablemos con el equipo BC.

## Modelo de datos

```
TicketListing {
  id          String   @id
  ticketId    String   @unique          // un ticket = 0 o 1 listing activo
  sellerId    String                    // dueño que listó
  price       Float
  currency    String   @default("ARS")
  status      String   @default("ACTIVE") // ACTIVE | SOLD | CANCELLED
  buyerId     String?                   // se setea al confirmar pago
  paymentId   String?                   // FK opcional al Payment
  listedAt    DateTime @default(now())
  resolvedAt  DateTime?
}
```

`Payment` gana un `listingId String?` para que el webhook distinga
"compra de stock del organizador" vs "compra de reventa".

## Validaciones en cada paso

| Momento | Validación |
|---|---|
| Listar | Soy el dueño actual + ticket no validado + sin listing activo previo + precio ≤ 2× precio del evento |
| Cancelar | Soy el seller del listing + estado ACTIVE |
| Iniciar checkout | Listing ACTIVE + no soy el seller + ticket sigue siendo del seller + ticket no validado |
| Webhook approved | Listing sigue ACTIVE (race: alguien ya pagó primero) → si no, devolvemos |

## Alternativas evaluadas

| Opción | Pro | Contra |
|--------|-----|--------|
| **Reventa con cobro vía MP** (elegida) | Reusa toda la infra de pagos existente | No hay split, plata va al platform |
| Reventa sin pago real (solo transferencia) | Más simple | Para qué… no agrega valor sobre regalar la pubkey |
| Reventa con MP Connect / split automático | Producción-ready | Complejo, fuera de scope del TP |
| Reventa con cap dinámico (organizador define) | Más flexible | Otro campo en el evento, más UI |

## Consecuencias

- **Positivas**
  - El asistente que no puede ir recupera su plata (al menos parcialmente).
  - El sistema demuestra el flujo P2P completo on-chain.
  - K2 (verificación pública de una entrada) queda más cerca: ya tenemos historial
    de quién la tuvo.
- **Negativas**
  - El cobro centralizado en el platform es una limitación visible (no es el modelo
    final para producción).
  - El cap fijo de 2× puede no calzar con todos los eventos.
- **Abiertas**
  - Cómo firma el vendedor cuando no está online (E5 → futuro ADR).
  - ¿Comisión del platform sobre cada reventa? Hoy 0% — definir si interesa.
