import { describe, expect, it, vi } from "vitest";

// Aislamos classifyTransferError de las dependencias pesadas del route handler
// (prisma, mercadopago, nct client, metrics). vi.mock es hoisted: se registra
// antes del import del módulo a testear.
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/payments/mercadopago", () => ({
  getPaymentInfo: vi.fn(),
  refundPayment: vi.fn(),
}));
vi.mock("@/lib/nct/client", () => ({ submitTransfer: vi.fn() }));
vi.mock("@/lib/observability/metrics", () => ({
  metrics: { paymentsConfirmed: { inc: vi.fn() } },
}));

import { classifyTransferError } from "./route";

/**
 * Núcleo de la lógica de refunds: decidir si un error de transferencia on-chain
 * es TERMINAL (hay que reembolsar automáticamente) o RETRYABLE (se puede
 * reintentar). El código fuente está en webhook/route.ts -> classifyTransferError.
 */
describe("classifyTransferError (refund decision)", () => {
  it("marca como terminal los errores de negocio irrecuperables", () => {
    const terminals = [
      new Error("ticket_not_found: evt:5"),
      new Error("not_current_owner: la entrada ya fue transferida"),
      new Error("listing_not_active"),
      new Error("no_ticket_reserved"),
      new Error("invalid_signature"),
    ];
    for (const e of terminals) {
      expect(classifyTransferError(e)).toBe("terminal");
    }
  });

  it("marca como retryable los errores transitorios/desconocidos", () => {
    const retryables = [
      new Error("ECONNREFUSED connecting to nct:8000"),
      new Error("timeout waiting for solution"),
      new Error("RabbitMQ connection lost"),
      "some generic string with no known code",
    ];
    for (const e of retryables) {
      expect(classifyTransferError(e)).toBe("retryable");
    }
  });

  it("es sensible al código completo, no a la palabra suelta", () => {
    expect(classifyTransferError(new Error("not_current_owner"))).toBe("terminal");
    // la palabra 'owner' sin el código completo no es terminal
    expect(classifyTransferError(new Error("owner: otra cosa"))).toBe("retryable");
  });
});