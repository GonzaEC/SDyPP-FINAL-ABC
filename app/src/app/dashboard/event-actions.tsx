"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Status = "DRAFT" | "EMITTED" | "CANCELLED" | string;

export function EventActions({ eventId, status }: { eventId: string; status: Status }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isDraft = status === "DRAFT";
  const isEmitted = status === "EMITTED";

  async function handleDelete() {
    if (!confirm("¿Borrar este borrador? Esta acción no se puede deshacer.")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "delete_failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (
      !confirm(
        "¿Cancelar este evento? Las entradas ya emitidas no se devuelven al pool — la cancelación es informativa para los compradores.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/cancel`, { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "cancel_failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setBusy(false);
    }
  }

  if (status === "CANCELLED") {
    return null;
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex items-center gap-2">
        {isDraft && (
          <>
            <Link
              href={`/dashboard/events/${eventId}/edit`}
              className="btn btn-secondary btn-sm"
            >
              Editar
            </Link>
            <button
              onClick={handleDelete}
              disabled={busy}
              className="btn btn-ghost btn-sm"
              style={{ color: "var(--danger)" }}
            >
              Borrar
            </button>
          </>
        )}
        {isEmitted && (
          <button
            onClick={handleCancel}
            disabled={busy}
            className="btn btn-ghost btn-sm"
            style={{ color: "var(--danger)" }}
          >
            Cancelar evento
          </button>
        )}
      </div>
      {error && (
        <p className="text-[11px] text-[var(--danger)] max-w-[240px] text-right">{error}</p>
      )}
    </div>
  );
}
