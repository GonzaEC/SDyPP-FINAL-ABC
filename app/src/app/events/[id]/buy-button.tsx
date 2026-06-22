"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useOperationStatus } from "@/lib/use-operation-status";

type LocalStage =
  | { kind: "idle" }
  | { kind: "creating_checkout" }
  | { kind: "redirecting" }
  // Stages del flujo mock (sin MP)
  | { kind: "mock_buying" }
  | { kind: "mock_polling"; opRef: string; ticketNumber: number }
  | { kind: "confirmed"; ticketNumber: number }
  | { kind: "failed"; reason: string };

export function BuyButton({ eventId, disabled, reason }: { eventId: string; disabled?: boolean; reason?: string }) {
  const router = useRouter();
  const [stage, setStage] = useState<LocalStage>({ kind: "idle" });

  // Para el flujo mock, poleamos la operación NCT.
  const mockPolling = stage.kind === "mock_polling" ? stage.opRef : null;
  const op = useOperationStatus(mockPolling);

  useEffect(() => {
    if (stage.kind !== "mock_polling" || !op) return;
    if (op.status === "CONFIRMED") {
      setStage({ kind: "confirmed", ticketNumber: stage.ticketNumber });
      router.refresh();
    } else if (op.status === "FAILED") {
      setStage({ kind: "failed", reason: op.errorCode ?? "transfer_failed" });
    }
  }, [op, stage, router]);

  async function handleBuy() {
    setStage({ kind: "creating_checkout" });
    try {
      const res = await fetch(`/api/events/${eventId}/checkout`, { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "checkout_failed");
      }

      if (data.mock) {
        // MP no configurado — flujo mock directo (como Sprint 4b).
        setStage({ kind: "mock_buying" });
        const buyRes = await fetch(`/api/events/${eventId}/buy`, { method: "POST" });
        if (!buyRes.ok && buyRes.status !== 202) {
          const buyData = await buyRes.json().catch(() => ({}));
          throw new Error(buyData.error ?? "buy_failed");
        }
        const buyData = await buyRes.json();
        setStage({ kind: "mock_polling", opRef: buyData.opRef, ticketNumber: buyData.ticket.ticketNumber });
        return;
      }

      // MP configurado — redirigir al checkout de MP.
      setStage({ kind: "redirecting" });
      // Con credenciales nuevas (APP_USR-... test), MP usa init_point en lugar
      // de sandbox_init_point. El servidor decide cuál mandar como `checkoutUrl`.
      const checkoutUrl = data.checkoutUrl;
      window.location.href = checkoutUrl;
    } catch (err) {
      setStage({ kind: "failed", reason: err instanceof Error ? err.message : "unknown_error" });
    }
  }

  if (disabled) {
    return (
      <>
        <button
          disabled
          className="btn btn-primary w-full btn-lg cursor-not-allowed opacity-60"
          title={reason}
        >
          Comprar entrada
        </button>
        {reason && (
          <p className="text-[12px] text-[var(--muted)] text-center mt-2">{reason}</p>
        )}
      </>
    );
  }

  if (stage.kind === "confirmed") {
    return (
      <div className="text-center space-y-2">
        <p className="text-[14px] font-semibold flex items-center justify-center gap-1.5" style={{ color: "var(--success)" }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Entrada #{stage.ticketNumber} confirmada en blockchain
        </p>
        <a href="/my-tickets" className="btn btn-secondary w-full btn-sm">
          Ver mis entradas
        </a>
      </div>
    );
  }

  if (stage.kind === "failed") {
    return (
      <>
        <button onClick={handleBuy} className="btn btn-primary w-full btn-lg">
          Reintentar compra
        </button>
        <p className="text-[12px] text-[var(--danger)] text-center mt-2">{translateError(stage.reason)}</p>
      </>
    );
  }

  if (stage.kind === "creating_checkout" || stage.kind === "redirecting") {
    return (
      <button disabled className="btn btn-primary w-full btn-lg cursor-wait">
        <span className="spinner" />
        {stage.kind === "creating_checkout" ? "Preparando pago…" : "Redirigiendo a MercadoPago…"}
      </button>
    );
  }

  if (stage.kind === "mock_buying" || stage.kind === "mock_polling") {
    const inFlight = stage.kind;
    const ticketLabel = stage.kind === "mock_polling" ? `Entrada #${stage.ticketNumber} reservada` : null;
    return (
      <div className="space-y-3">
        <button disabled className="btn btn-primary w-full btn-lg cursor-wait">
          <span className="spinner" />
          {inFlight === "mock_buying" ? "Enviando…" : "Esperando confirmación on-chain…"}
        </button>
        <div
          className="rounded-[var(--radius-sm)] px-3 py-2.5 text-[12px] space-y-1"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <span><span className="opacity-70">1.</span> Pago recibido</span>
            <CheckIcon done />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span><span className="opacity-70">2.</span> Transferencia enviada al NCT</span>
            <CheckIcon done={inFlight === "mock_polling"} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span><span className="opacity-70">3.</span> Minado en blockchain</span>
            {inFlight === "mock_polling" ? <span className="spinner" style={{ width: 10, height: 10 }} /> : <CheckIcon />}
          </div>
        </div>
        {ticketLabel && (
          <p className="text-[11px] text-[var(--muted)] text-center mono">{ticketLabel}</p>
        )}
      </div>
    );
  }

  return (
    <button onClick={handleBuy} className="btn btn-primary w-full btn-lg">
      Comprar pase
    </button>
  );
}

function CheckIcon({ done }: { done?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ opacity: done ? 1 : 0.25 }}>
      <path d="M5 12l5 5L20 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function translateError(err: string) {
  switch (err) {
    case "sold_out":
      return "Agotado, no quedan entradas.";
    case "cannot_buy_own_event":
      return "No podés comprar entradas de tu propio evento.";
    case "event_not_emitted":
      return "El evento todavía no fue emitido a la blockchain.";
    case "unauthorized":
      return "Tenés que iniciar sesión para comprar.";
    case "not_current_owner_at_settlement":
      return "Alguien más compró la entrada antes que vos. Probá de nuevo.";
    case "mock_random_failure":
      return "El NCT rechazó la transacción. Probá de nuevo.";
    case "timeout_waiting_settlement":
      return "El NCT está tardando demasiado. Probá de nuevo en un momento.";
    case "mp_error":
      return "Error al comunicar con MercadoPago. Intentá de nuevo.";
    default:
      return err;
  }
}
