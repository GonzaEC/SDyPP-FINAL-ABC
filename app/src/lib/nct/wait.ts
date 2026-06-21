import { getOperationStatus, type OpStatus } from "./client";

// Espera a que una operación del NCT termine (CONFIRMED o FAILED) o hasta
// agotar el timeout. Útil para endpoints que se comportan síncronos hacia
// el cliente (ej. buy, validate) aunque por debajo la BC tenga delay.
//
// Internamente, cada poll dispara settleDueOperations() porque la query
// getOperationStatus la llama. Por eso es honesto el "polling" en mock.
export async function awaitOperation(
  opId: string,
  { timeoutMs = 10_000, intervalMs = 200 }: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ status: OpStatus; errorCode?: string }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await getOperationStatus(opId);
    if (!s) return { status: "FAILED", errorCode: "operation_disappeared" };
    if (s.status !== "PENDING") return { status: s.status, errorCode: s.errorCode };
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return { status: "FAILED", errorCode: "timeout_waiting_settlement" };
}
