"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Tag, X } from "lucide-react";

interface Props {
  ticketId: string;
  eventPrice: number; // para mostrar el cap (2× original)
  activeListing: { id: string; price: number } | null;
}

export function ListingControl({ ticketId, eventPrice, activeListing }: Props) {
  const router = useRouter();
  const [opening, setOpening] = useState(false);
  const [price, setPrice] = useState(String(eventPrice));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const maxPrice = eventPrice * 2;

  async function handleList(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/list`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price: Number(price) }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "list_failed");
      }
      setOpening(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!confirm("¿Cancelar la venta de esta entrada?")) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/tickets/${ticketId}/list`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "cancel_failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  if (activeListing) {
    return (
      <div className="border-t border-[var(--line)] px-4 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-3" style={{ background: "var(--surface)" }}>
        <div className="flex items-center gap-2 text-[12.5px]">
          <Tag size={14} strokeWidth={2} style={{ color: "var(--brand)" }} />
          <span>
            En venta a <span className="font-semibold">${activeListing.price.toFixed(2)}</span>
          </span>
        </div>
        <button
          onClick={handleCancel}
          disabled={loading}
          className="btn btn-secondary btn-sm inline-flex items-center gap-1"
        >
          <X size={12} strokeWidth={2.4} />
          Cancelar venta
        </button>
        {error && (
          <p className="basis-full text-[11.5px]" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        )}
      </div>
    );
  }

  if (!opening) {
    return (
      <div className="border-t border-[var(--line)] px-4 sm:px-5 py-3 flex items-center justify-end">
        <button
          onClick={() => setOpening(true)}
          className="btn btn-secondary btn-sm inline-flex items-center gap-1"
        >
          <Tag size={12} strokeWidth={2.2} />
          Vender
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleList}
      className="border-t border-[var(--line)] px-4 sm:px-5 py-3 space-y-2.5"
      style={{ background: "var(--surface)" }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1 min-w-[140px]">
          <span className="block text-[11px] font-semibold text-[var(--muted)] uppercase tracking-wider mb-1">
            Precio de venta
          </span>
          <input
            type="number"
            min="1"
            max={maxPrice}
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="input"
            required
            autoFocus
          />
        </label>
        <button type="submit" disabled={loading} className="btn btn-primary btn-sm">
          {loading && <span className="spinner" />}
          {loading ? "Publicando…" : "Publicar"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpening(false);
            setError(null);
          }}
          disabled={loading}
          className="btn btn-secondary btn-sm"
        >
          Cancelar
        </button>
      </div>
      <p className="text-[11px] text-[var(--muted)]">
        Tope anti-scalping: máx ${maxPrice.toFixed(2)} (2× del precio original).
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </form>
  );
}
