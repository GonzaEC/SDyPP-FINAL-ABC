import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock del SDK de Mercado Pago antes de importar el módulo.
vi.mock("mercadopago", () => {
  // Ambos se instancian con `new` en mercadopago.ts, así que deben ser classes.
  // `create` se comparte entre instancias para poder inspeccionarlo en el test.
  const mockCreate = vi.fn().mockResolvedValue({});
  const PaymentRefund = class {
    create = mockCreate;
  };
  const MercadoPagoConfig = class {
    constructor(public opts: { accessToken: string }) {}
  };
  return { MercadoPagoConfig, PaymentRefund, mockCreate, Preference: vi.fn(), Payment: vi.fn() };
});

import { isMpConfigured, getPublicUrl, refundPayment } from "../payments/mercadopago";
// El mock agrega `mockCreate` al módulo real; lo declaramos para que tsc entienda
// el export cuando el test lo importa.
declare module "mercadopago" {
  export const mockCreate: (...args: unknown[]) => Promise<unknown>;
}
import { mockCreate } from "mercadopago";

describe("mercadopago helper", () => {
  const OLD = { ...process.env };

  beforeEach(() => {
    process.env = { ...OLD };
    delete process.env.MP_ACCESS_TOKEN;
    delete process.env.MP_PUBLIC_URL;
    vi.clearAllMocks();
  });

  it("isMpConfigured: false sin token, true con token", () => {
    expect(isMpConfigured()).toBe(false);
    process.env.MP_ACCESS_TOKEN = "TEST-123";
    expect(isMpConfigured()).toBe(true);
  });

  it("getPublicUrl: usa MP_PUBLIC_URL sin slash final, o el default localhost", () => {
    expect(getPublicUrl()).toBe("http://localhost:3000");
    process.env.MP_PUBLIC_URL = "https://tesera.tech/";
    expect(getPublicUrl()).toBe("https://tesera.tech");
  });

  it("refundPayment crea el refund y devuelve", async () => {
    process.env.MP_ACCESS_TOKEN = "TEST-1";
    await expect(refundPayment("12345")).resolves.toBeUndefined();
    expect(mockCreate).toHaveBeenCalledWith({ payment_id: 12345 });
  });

  it("refundPayment rechaza si no hay token configurado", async () => {
    await expect(refundPayment("1")).rejects.toThrow("MP_ACCESS_TOKEN");
  });
});