"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  listingId: string;
  disabled?: boolean;
  reason?: string;
}

export function ResaleBuyButton({ listingId, disabled, reason }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/listings/${listingId}/checkout`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "checkout_failed");
      }

      if (data.mock) {
        // Mock: la compra ya pasó. Refrescamos.
        router.refresh();
        return;
      }

      // MP configurado: redirect.
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
      setLoading(false);
    }
  }

  if (disabled) {
    return (
      <button disabled className="btn btn-secondary btn-sm cursor-not-allowed opacity-60" title={reason}>
        Comprar
      </button>
    );
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn btn-primary btn-sm"
      >
        {loading && <span className="spinner" />}
        {loading ? "Preparando…" : "Comprar"}
      </button>
      {error && (
        <p className="text-[11px] mt-1" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      )}
    </>
  );
}
