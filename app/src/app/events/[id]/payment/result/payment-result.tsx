"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type PaymentState = {
  status: string;
  mpStatus: string | null;
  nctStatus: string | null;
  nctOpRef: string | null;
  ticketId: string | null;
  event: { id: string; name: string; venue: string; datetime: string } | null;
};

type Stage = "loading" | "waiting_mp" | "waiting_nct" | "confirmed" | "failed" | "error";

export function PaymentResult({
  eventId,
  paymentId,
  mpRedirectStatus,
}: {
  eventId: string;
  paymentId: string;
  mpRedirectStatus: string;
}) {
  const [stage, setStage] = useState<Stage>("loading");
  const [data, setData] = useState<PaymentState | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!paymentId) {
      setStage("error");
      setErrorMsg("No se recibió referencia de pago.");
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 40; // ~60s de polling

    async function poll() {
      if (cancelled) return;
      attempts++;
      try {
        const res = await fetch(`/api/payments/${paymentId}`);
        if (!res.ok) {
          if (attempts > 5) {
            setStage("error");
            setErrorMsg("No se pudo verificar el estado del pago.");
            return;
          }
          timer = setTimeout(poll, 1500);
          return;
        }
        const body = (await res.json()) as PaymentState;
        if (cancelled) return;
        setData(body);

        if (body.status === "APPROVED" && body.nctStatus === "CONFIRMED") {
          setStage("confirmed");
          return;
        }
        if (body.status === "APPROVED" && body.nctStatus === "FAILED") {
          setStage("failed");
          setErrorMsg("El pago fue aprobado pero la transferencia en blockchain falló. Contactá al organizador.");
          return;
        }
        if (body.status === "REJECTED" || body.status === "CANCELLED") {
          setStage("failed");
          setErrorMsg(
            body.status === "REJECTED"
              ? "El pago fue rechazado. Probá con otra tarjeta."
              : "El pago fue cancelado.",
          );
          return;
        }
        if (body.status === "APPROVED" && (body.nctStatus === "PENDING" || !body.nctStatus)) {
          setStage("waiting_nct");
        } else {
          setStage("waiting_mp");
        }

        if (attempts >= MAX_ATTEMPTS) {
          setStage("error");
          setErrorMsg("El pago está tardando más de lo esperado. Revisá en 'Mis entradas' en unos minutos.");
          return;
        }

        timer = setTimeout(poll, 1500);
      } catch {
        if (cancelled) return;
        timer = setTimeout(poll, 2000);
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [paymentId]);

  return (
    <div className="card p-6 sm:p-10 text-center space-y-5">
      {stage === "loading" && <LoadingState text="Verificando pago…" />}
      {stage === "waiting_mp" && <LoadingState text="Esperando confirmación de MercadoPago…" />}
      {stage === "waiting_nct" && (
        <LoadingState text="Pago aprobado. Registrando en blockchain…" />
      )}

      {stage === "confirmed" && (
        <>
          <div
            className="mx-auto w-16 h-16 rounded-full grid place-items-center"
            style={{ background: "var(--success-soft)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M5 12l5 5L20 7" stroke="var(--success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h2 className="text-[24px] sm:text-[28px] font-semibold">
            Entrada confirmada
          </h2>
          <p className="text-[14px] text-[var(--muted)]">
            Tu pago fue aprobado y la entrada ya está registrada en blockchain a tu nombre.
          </p>
          {data?.event && (
            <div
              className="rounded-[var(--radius-sm)] p-4 text-left text-[13px] space-y-1"
              style={{ background: "var(--surface)" }}
            >
              <p className="font-semibold text-[15px]">{data.event.name}</p>
              <p className="text-[var(--muted)]">{data.event.venue}</p>
              <p className="text-[var(--muted)]">
                {new Date(data.event.datetime).toLocaleDateString("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          )}
          <div className="flex flex-col gap-2.5 pt-2">
            <Link href="/my-tickets" className="btn btn-primary w-full">
              Ver mis entradas
            </Link>
            <Link href={`/events/${eventId}`} className="btn btn-secondary w-full">
              Volver al evento
            </Link>
          </div>
        </>
      )}

      {stage === "failed" && (
        <>
          <div
            className="mx-auto w-16 h-16 rounded-full grid place-items-center"
            style={{ background: "var(--danger-soft)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <path d="M6 6l12 12M18 6L6 18" stroke="var(--danger)" strokeWidth="2.5" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-[24px] sm:text-[28px] font-semibold">
            No pudimos completar la compra
          </h2>
          <p className="text-[14px] text-[var(--danger)]">{errorMsg}</p>
          <Link href={`/events/${eventId}`} className="btn btn-primary w-full">
            Volver al evento
          </Link>
        </>
      )}

      {stage === "error" && (
        <>
          <div
            className="mx-auto w-16 h-16 rounded-full grid place-items-center"
            style={{ background: "var(--surface)" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="var(--muted)" strokeWidth="1.8" />
              <path d="M12 8v5M12 16.5v.5" stroke="var(--muted)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <h2 className="text-[24px] sm:text-[28px] font-semibold">
            Estado desconocido
          </h2>
          <p className="text-[14px] text-[var(--muted)]">{errorMsg}</p>
          <div className="flex flex-col gap-2.5 pt-2">
            <Link href="/my-tickets" className="btn btn-primary w-full">
              Revisar mis entradas
            </Link>
            <Link href={`/events/${eventId}`} className="btn btn-secondary w-full">
              Volver al evento
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

function LoadingState({ text }: { text: string }) {
  return (
    <>
      <div className="mx-auto w-16 h-16 rounded-full grid place-items-center" style={{ background: "var(--brand-soft)" }}>
        <span className="spinner" style={{ width: 28, height: 28 }} />
      </div>
      <h2 className="text-[20px] sm:text-[24px] font-semibold">{text}</h2>
      <p className="text-[13px] text-[var(--muted)]">No cierres esta página.</p>
    </>
  );
}
