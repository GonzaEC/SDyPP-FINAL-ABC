# ADR-016: Integración con MercadoPago (Checkout Pro)

**Estado:** Aceptada  
**Fecha:** 2026-06-20

## Contexto

El MVP venía con un botón "Comprar" que transfería la entrada instantáneamente sin
cobrar plata real. Para la demo y la evaluación del TP, necesitamos mostrar un flujo
de pago verdadero integrado con una pasarela conocida.

## Decisión

Usamos **MercadoPago Checkout Pro** en modo sandbox (entorno de prueba con tarjetas
de prueba de MP, sin plata real). El flujo completo es:

1. Comprador → `POST /api/events/[id]/checkout` → se crea un Payment (PENDING) +
   una preferencia de pago en MP → se devuelve la URL de checkout de MP.
2. Se redirige al comprador al checkout de MP → paga con tarjeta de prueba.
3. MP redirige de vuelta a `/events/[id]/payment/result` con query params.
4. **En paralelo** MP envía un webhook a `POST /api/payments/webhook`.
5. El webhook consulta la API de MP para verificar el estado real del pago
   (nunca confiar solo en el body del webhook).
6. Si `approved` → se dispara `submitTransfer()` al NCT → la entrada se transfiere
   al comprador en blockchain.
7. Si `rejected`/`cancelled` → se marca el Payment como tal y se libera el ticket.

## Fallback sin MP configurado

Si `MP_ACCESS_TOKEN` está vacío (o no existe), el endpoint `/checkout` devuelve
`{ mock: true }` y el frontend cae en el flujo mock anterior (POST a `/buy` directo,
sin pago real). Esto permite seguir desarrollando sin tener credenciales de MP.

## Modelo de datos

```
Payment {
  id, userId, eventId, ticketId, amount, currency, status,
  mpPreferenceId, mpPaymentId, mpStatus, mpStatusDetail,
  nctOpRef, nctStatus,
  createdAt, updatedAt
}
```

Estados: `PENDING → APPROVED | REJECTED | CANCELLED | REFUNDED`

## Seguridad del webhook

- Nunca confiamos en el body del webhook como fuente de verdad.
- Siempre consultamos la API de MP con `getPaymentInfo(mpPaymentId)` para
  verificar el estado antes de actuar.
- El external_reference (nuestro payment.id) vincula la notificación con
  nuestro registro.
- Idempotencia: si el payment ya fue procesado, ignoramos el webhook repetido.

## Alternativas evaluadas

| Opción | Pro | Contra |
|--------|-----|--------|
| Checkout Pro (elegida) | Flujo hosteado por MP, menos superficie de ataque, compatible con todos los medios de pago | El usuario sale de nuestra app momentáneamente |
| Checkout API (Transparent) | Todo en nuestro frontend | Más complejo, hay que manejar tokenización, PCI compliance, más código |
| Stripe | Buena DX, buena doc | No es popular en Argentina, no soporta pesos AR nativamente |

## Consecuencias

- El organizador recibe el pago en su cuenta de MP (en prod). Nosotros no
  intermediamos plata.
- La entrada solo se transfiere al comprador **después** de que el webhook
  confirme `approved`. Hasta ese momento el ticket sigue siendo del organizador.
- En sandbox las tarjetas son de prueba y los pagos no mueven plata real.
- El endpoint `/api/events/[id]/buy` sigue existiendo como fallback mock. Si
  en algún momento se quiere deprecar, basta borrar la ruta.
