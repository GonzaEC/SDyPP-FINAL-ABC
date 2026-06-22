"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { signPayload } from "@/lib/crypto/client";
import { getUnlockedKey } from "@/lib/identity-store";
import { UnlockKeyModal } from "./unlock-key-modal";
import { IconLock } from "./icons";

interface Props {
  ticketId: string;
  publicKey: string;
  size?: number;
  refreshMs?: number;
}

interface QRPayload {
  v: 1;
  type: "ticket_proof";
  ticketId: string;
  publicKey: string;
  issuedAt: string;
}

export function TicketQR({ ticketId, publicKey, size = 320, refreshMs = 30_000 }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issuedAt, setIssuedAt] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [tick, setTick] = useState(0); // se usa para forzar regeneración tras desbloquear

  const generate = useCallback(async () => {
    setError(null);
    const key = getUnlockedKey();
    if (!key) {
      setLocked(true);
      setDataUrl(null);
      return;
    }
    setLocked(false);
    try {
      const payload: QRPayload = {
        v: 1,
        type: "ticket_proof",
        ticketId,
        publicKey,
        issuedAt: new Date().toISOString(),
      };
      const signature = await signPayload(key, payload);
      const encoded = JSON.stringify({ payload, signature });
      const url = await QRCode.toDataURL(encoded, {
        width: 520,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#0a0a0a", light: "#ffffff" },
      });
      setDataUrl(url);
      setIssuedAt(payload.issuedAt);
    } catch (err) {
      setError(err instanceof Error ? err.message : "qr_generation_failed");
    }
  }, [ticketId, publicKey]);

  useEffect(() => {
    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    (async () => {
      await generate();
      if (cancelled) return;
      interval = setInterval(generate, refreshMs);
    })();
    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [generate, refreshMs, tick]);

  // ESC para cerrar fullscreen.
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFullscreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [fullscreen]);

  if (error) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-[12px] text-[var(--danger)] bg-[var(--surface-2)] rounded-lg p-4 text-center"
      >
        {error}
      </div>
    );
  }

  if (locked) {
    return (
      <>
        <div
          style={{ width: size, height: size }}
          className="flex flex-col items-center justify-center gap-3 text-center bg-[var(--surface-2)] rounded-lg p-5"
        >
          <div
            className="w-12 h-12 rounded-xl grid place-items-center"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <IconLock size={22} />
          </div>
          <p className="text-[13px] text-[var(--muted)] max-w-[220px] leading-snug">
            Tu clave está bloqueada. Desbloqueala con tu contraseña para mostrar el QR.
          </p>
          <button
            type="button"
            onClick={() => setUnlockOpen(true)}
            className="btn btn-primary btn-sm"
          >
            Desbloquear
          </button>
        </div>
        <UnlockKeyModal
          open={unlockOpen}
          onClose={() => setUnlockOpen(false)}
          onUnlocked={() => setTick((t) => t + 1)}
        />
      </>
    );
  }

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center text-[12px] text-[var(--muted)] bg-[var(--surface-2)] rounded-lg"
      >
        Firmando…
      </div>
    );
  }

  return (
    <>
      <div className="inline-flex flex-col items-center gap-2">
        <button
          type="button"
          onClick={() => setFullscreen(true)}
          className="block rounded-lg overflow-hidden ring-1 ring-black/5 hover:ring-2 hover:ring-[var(--brand)] transition"
          title="Tocar para pantalla completa"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            width={size}
            height={size}
            alt={`QR entrada ${ticketId}`}
            className="block"
            style={{ imageRendering: "pixelated" }}
          />
        </button>
        {issuedAt && (
          <p className="text-[11px] font-mono text-[var(--muted)]">
            Firmado {new Date(issuedAt).toLocaleTimeString()} · tocá para agrandar
          </p>
        )}
      </div>

      {fullscreen && (
        <div
          className="fixed inset-0 z-50 bg-white flex flex-col items-center justify-center p-6 gap-4"
          onClick={() => setFullscreen(false)}
          role="dialog"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={dataUrl}
            alt={`QR entrada ${ticketId}`}
            className="max-w-[90vmin] max-h-[80vh] w-auto h-auto"
            style={{ imageRendering: "pixelated" }}
          />
          {issuedAt && (
            <p className="text-[13px] font-mono text-zinc-600">
              Firmado {new Date(issuedAt).toLocaleTimeString()}
            </p>
          )}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreen(false);
            }}
          >
            Cerrar
          </button>
        </div>
      )}
    </>
  );
}
