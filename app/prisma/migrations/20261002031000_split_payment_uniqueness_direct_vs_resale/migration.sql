-- Separa la unicidad de reservas activas por ticket en dos casos:
--   (a) Compra directa al organizador  → listingId IS NULL
--   (b) Reventa P2P                     → listingId IS NOT NULL
--
-- Antes todo caía en un único índice parcial sobre ticketId que impedía
-- cualquier Payment PENDING/APPROVED nuevo si ya existía uno APPROVED del
-- mismo ticket. En reventas eso era un bug: el Payment APPROVED del primer
-- comprador seguía bloqueando que un comprador posterior iniciase un checkout
-- del listing, aunque el ticket ya fuese del primer comprador y éste lo
-- hubiese puesto a la venta.
--
-- El fix divide el índice en dos escenarios que no se pisan entre sí:
--   • compras directas: una sola reserva activa por ticket SIN listing
--   • reventas:          una sola reserva activa por listing (listingId es
--                        único por naturaleza; esto evita doble-reserva del
--                        mismo listing por dos compradores concurrentes)

-- 1) Reemplazar el índice único parcial anterior.
DROP INDEX IF EXISTS "payment_one_active_reservation_per_ticket";

-- 2) Compras directas: a lo sumo UNA reserva activa por ticket cuando no es
--    reventa. Protege el flujo original de /events/[id]/checkout.
CREATE UNIQUE INDEX "payment_one_direct_active_per_ticket"
  ON "Payment" ("ticketId")
  WHERE "status" IN ('PENDING', 'APPROVED')
    AND "ticketId" IS NOT NULL
    AND "listingId" IS NULL;

-- 3) Reventas: a lo sumo UNA reserva activa por listing. Protege contra que
--    dos compradores inicien checkout del mismo listing a la vez; igual la
--    primera transición a APPROVED marca el listing como SOLD, pero este
--    índice es la red de seguridad a nivel BD.
CREATE UNIQUE INDEX "payment_one_active_per_listing"
  ON "Payment" ("listingId")
  WHERE "status" IN ('PENDING', 'APPROVED')
    AND "listingId" IS NOT NULL;
