"use client";

import { useEffect, useState } from "react";

export type OpStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface OperationState {
  status: OpStatus;
  errorCode?: string;
  confirmedAt?: string;
  failedAt?: string;
  estimatedConfirmAt?: string;
}

// Polea /api/operations/[opRef] hasta que el estado deje de ser PENDING.
// Backoff suave: arranca en `intervalMs` y crece ligeramente para no hostigar.
// Si opRef es null, no hace nada (estado idle).
export function useOperationStatus(
  opRef: string | null,
  { intervalMs = 800, maxIntervalMs = 2000, timeoutMs = 20_000 }: {
    intervalMs?: number;
    maxIntervalMs?: number;
    timeoutMs?: number;
  } = {},
): OperationState | null {
  const [state, setState] = useState<OperationState | null>(null);

  useEffect(() => {
    if (!opRef) {
      setState(null);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const startedAt = Date.now();
    let currentInterval = intervalMs;

    async function poll() {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/operations/${opRef}`);
        if (!res.ok) {
          if (res.status === 404) {
            setState({ status: "FAILED", errorCode: "operation_not_found" });
            return;
          }
          throw new Error(String(res.status));
        }
        const body = (await res.json()) as OperationState;
        if (cancelled) return;
        setState(body);
        if (body.status !== "PENDING") return; // terminal, paramos
        if (Date.now() - startedAt > timeoutMs) {
          setState({ status: "FAILED", errorCode: "timeout_waiting_settlement" });
          return;
        }
        currentInterval = Math.min(maxIntervalMs, Math.floor(currentInterval * 1.15));
        timer = setTimeout(poll, currentInterval);
      } catch {
        if (cancelled) return;
        // Errores de red: reintento con el mismo backoff hasta el timeout.
        if (Date.now() - startedAt > timeoutMs) {
          setState({ status: "FAILED", errorCode: "network_timeout" });
          return;
        }
        timer = setTimeout(poll, currentInterval);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [opRef, intervalMs, maxIntervalMs, timeoutMs]);

  return state;
}
