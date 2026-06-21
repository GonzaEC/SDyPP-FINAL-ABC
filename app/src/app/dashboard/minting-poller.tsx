"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Polea cada N ms el estado de las operaciones MINTING. Cuando todas terminan
// (CONFIRMED o FAILED), refresca la página para que el server vuelva a leer
// los Events ya actualizados por el settlement.
export function MintingPoller({
  operations,
  intervalMs = 1500,
}: {
  operations: { id: string; opRef: string | null }[];
  intervalMs?: number;
}) {
  const router = useRouter();
  const refs = operations.map((o) => o.opRef).filter((x): x is string => Boolean(x));

  useEffect(() => {
    if (refs.length === 0) return;
    let cancelled = false;

    async function tick() {
      const results = await Promise.allSettled(
        refs.map((r) =>
          fetch(`/api/operations/${r}`)
            .then((res) => (res.ok ? res.json() : null))
            .catch(() => null),
        ),
      );
      if (cancelled) return;
      const allTerminal = results.every(
        (r) => r.status === "fulfilled" && r.value && r.value.status !== "PENDING",
      );
      if (allTerminal) {
        router.refresh();
      }
    }

    const t = setInterval(tick, intervalMs);
    // Una vez inmediato para no perder tiempo en el primer tick.
    void tick();
    return () => {
      cancelled = true;
      clearInterval(t);
    };
    // refs.join() para que el array no dispare re-render por identidad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refs.join(","), intervalMs]);

  return null;
}
