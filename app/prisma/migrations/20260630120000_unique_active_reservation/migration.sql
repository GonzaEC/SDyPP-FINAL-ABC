-- Reserva atómica de tickets: a lo sumo UNA reserva activa por ticket.
--
-- Prisma no puede expresar índices parciales en el schema, así que va como
-- migración SQL manual. El checkout traduce la violación (P2002) a "agotado".

-- 1) Limpieza previa: si por el bug anterior quedaron varias reservas activas
--    para el mismo ticket, dejamos solo la más reciente y cancelamos el resto
--    (si no, el CREATE UNIQUE INDEX fallaría por duplicados). En producción las
--    APPROVED canceladas acá habría que reembolsarlas; de ahora en más el flujo
--    de refund automático lo cubre.
UPDATE "Payment" p
SET "status" = 'CANCELLED', "updatedAt" = NOW()
WHERE p."status" IN ('PENDING', 'APPROVED')
  AND p."ticketId" IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM "Payment" q
    WHERE q."ticketId" = p."ticketId"
      AND q."status" IN ('PENDING', 'APPROVED')
      AND (
        q."createdAt" > p."createdAt"
        OR (q."createdAt" = p."createdAt" AND q."id" > p."id")
      )
  );

-- 2) Índice único parcial: una sola reserva activa por ticket.
CREATE UNIQUE INDEX "payment_one_active_reservation_per_ticket"
  ON "Payment" ("ticketId")
  WHERE "status" IN ('PENDING', 'APPROVED') AND "ticketId" IS NOT NULL;
