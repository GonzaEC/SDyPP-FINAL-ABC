# ADR-025: Reserva atómica de entradas e invariante de reembolso

**Estado**: Accepted
**Fecha**: 2026-08-04

## Contexto

Dos compradores que iban por la última entrada de un evento podían pagar los dos. El
checkout buscaba una entrada libre excluyendo las ya reservadas y creaba el `Payment`, pero
entre la lectura y la escritura había una ventana en la que otra request podía hacer
exactamente lo mismo. Un TOCTOU clásico.

El problema no terminaba en la base de datos. La transferencia on-chain se dispara recién
cuando MercadoPago confirma el pago, así que las dos transferencias del mismo ticket
llegaban al NCT por separado, ambas pasaban la verificación de propiedad —el organizador
seguía siendo el dueño cuando cada una se recibió— y la última en aplicarse pisaba a la
anterior. El comprador perdedor quedaba con la plata gastada y sin entrada.

## Decisión

Defensa en las tres capas, cada una cubriendo lo que la anterior no puede:

1. **Base de datos**: índice único parcial `payment_one_active_reservation_per_ticket` sobre
   `Payment(ticketId)` donde `status IN ('PENDING','APPROVED')`. A lo sumo una reserva
   activa por entrada, garantizado por Postgres.
2. **Aplicación**: el checkout traduce la violación (`P2002`) a "agotado". El segundo
   comprador recibe un 409 y **no llega a la pantalla de pago**.
3. **Blockchain**: el NCT re-verifica la propiedad **al aplicar el bloque**, no solo al
   recibir la transacción. Si el ticket ya cambió de dueño, marca la operación como FAILED
   en lugar de sobrescribir al dueño legítimo.

Sobre eso se define un invariante explícito: **plata adentro = entrada entregada, o plata de
vuelta**. Todo camino en el que el pago se aprobó pero la entrega falló de forma terminal
dispara un reembolso automático en MercadoPago.

## Consecuencias

### Positivas
- El doble gasto es imposible por construcción, no por convención: lo impone un constraint.
- El segundo comprador se entera antes de pagar, que es el momento correcto.
- El invariante de reembolso convierte una clase entera de fallos en un problema resuelto
  automáticamente en vez de un reclamo manual.

### Negativas
- El índice parcial no se puede expresar en el schema de Prisma; vive en una migración SQL
  escrita a mano. Si alguien regenera el schema sin mirar, lo pierde.
- Depender de `P2002` acopla la lógica de negocio a un código de error del ORM.
- Las reservas `PENDING` abandonadas bloquearían la entrada para siempre, así que hay un TTL
  de 15 minutos que las cancela. Ese TTL introduce su propio caso borde: un pago aprobado
  después del vencimiento, que se resuelve reembolsando.

### Abiertas
- El TTL de 15 minutos no está alineado con ningún timeout de MercadoPago; es un número
  elegido por nosotros.

## Alternativas consideradas

### Bloqueo pesimista (`SELECT ... FOR UPDATE`) sobre la entrada
Habría funcionado para la carrera en la base, pero no aporta nada contra la carrera on-chain,
que ocurre mucho después y en otro sistema. Habríamos necesitado igual la defensa del NCT, y
además el lock se sostiene durante toda la transacción.

### Resolver solo en el NCT
Dejar que la blockchain sea el árbitro único es elegante, pero significa que el segundo
comprador **paga primero y se entera después**. Cobrar para después reembolsar es una
experiencia mucho peor que decir "agotado" antes del checkout.

### Cola de reservas serializada
Un único proceso asignando entradas elimina la carrera por diseño, pero introduce un punto
único de falla y un cuello de botella en el momento de más carga, que es justo cuando se
abre la venta de un evento.
