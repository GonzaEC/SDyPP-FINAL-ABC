import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { verifySignature, canonicalize } from "../crypto/server";

// Node 22 expone webcrypto estable.
const subtle = (globalThis as any).crypto.subtle;
const ECDSA = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };

function bytesToB64(u8: Uint8Array): string {
  return Buffer.from(u8).toString("base64");
}

function signPayload(priv: CryptoKey, payload: unknown): Promise<Uint8Array> {
  const msg = new Uint8Array(new TextEncoder().encode(canonicalize(payload)));
  return subtle.sign(ECDSA, priv, msg);
}

describe("verifySignature (server ECDSA)", () => {
  let kp: CryptoKeyPair;

  beforeEach(async () => {
    kp = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
  });

  it("acepta una firma válida generada con WebCrypto", async () => {
    const spki = new Uint8Array(await subtle.exportKey("spki", kp.publicKey));
    const payload = { type: "mint_batch", eventId: "evt_1", ticketCount: 10, issuer: "org" };
    const sig = await signPayload(kp.privateKey, payload);

    const ok = await verifySignature(bytesToB64(spki), payload, bytesToB64(sig));
    expect(ok).toBe(true);
  });

  it("rechaza un payload manipulado", async () => {
    const spki = new Uint8Array(await subtle.exportKey("spki", kp.publicKey));
    const payload = { type: "mint_batch", eventId: "evt_1", ticketCount: 10 };
    const sig = await signPayload(kp.privateKey, payload);

    const tampered = { ...payload, ticketCount: 9999 };
    const ok = await verifySignature(bytesToB64(spki), tampered, bytesToB64(sig));
    expect(ok).toBe(false);
  });

  it("rechaza una firma de otra clave", async () => {
    const other = await subtle.generateKey(ECDSA, true, ["sign", "verify"]);
    const spki = new Uint8Array(await subtle.exportKey("spki", other.publicKey));
    const payload = { type: "transfer", ticketId: "t1", to: "bob" };
    // firmamos con la clave del test, no con `other`
    const sig = await signPayload(kp.privateKey, payload);

    const ok = await verifySignature(bytesToB64(spki), payload, bytesToB64(sig));
    expect(ok).toBe(false);
  });

  it("lanza con entrada malformada (pubkey no base64 real)", async () => {
    // El server.ts no valida el formato: b64ToBytes lanza InvalidCharacterError.
    // Es responsabilidad del route handler capturarlo y responder 400.
    await expect(verifySignature("###no-b64###", { a: 1 }, "###no-b64###")).rejects.toThrow();
  });
});

describe("canonicalize", () => {
  it("ordena las keys alfabéticamente y sin espacios", () => {
    expect(canonicalize({ bee: 2, apple: 1, cat: 3 })).toBe('{"apple":1,"bee":2,"cat":3}');
  });

  it("es determinista en estructuras anidadas", () => {
    const obj = { b: { y: 1, x: [3, 2, 1] }, a: "v" };
    expect(canonicalize(obj)).toBe(canonicalize(obj));
  });

  it("maneja primitivos", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize("hola")).toBe('"hola"');
    expect(canonicalize(42)).toBe("42");
  });
});