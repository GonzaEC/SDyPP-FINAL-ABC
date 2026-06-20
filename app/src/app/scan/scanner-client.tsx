"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

type Result =
  | { kind: "ok"; ticketNumber: number; eventName: string; venue: string }
  | { kind: "error"; code: string; message: string };

const READER_ID = "qr-reader";

export function ScannerClient() {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [running, setRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const lastSubmittedRef = useRef<string | null>(null);

  const handleScan = useCallback(
    async (decodedText: string) => {
      if (busy) return;
      if (lastSubmittedRef.current === decodedText) return;
      lastSubmittedRef.current = decodedText;
      setBusy(true);
      setResult(null);
      try {
        const parsed = JSON.parse(decodedText);
        const res = await fetch("/api/validate", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(parsed),
        });
        const body = await res.json();
        if (!res.ok) {
          setResult({
            kind: "error",
            code: body.error ?? "unknown",
            message: translateError(body.error),
          });
        } else {
          setResult({
            kind: "ok",
            ticketNumber: body.ticket.ticketNumber,
            eventName: body.ticket.eventName,
            venue: body.ticket.venue,
          });
        }
      } catch (err) {
        setResult({
          kind: "error",
          code: "parse_error",
          message: err instanceof Error ? err.message : "QR ilegible",
        });
      } finally {
        setBusy(false);
        setTimeout(() => {
          lastSubmittedRef.current = null;
        }, 2000);
      }
    },
    [busy],
  );

  async function start() {
    if (running || starting) return;
    setCameraError(null);
    setStarting(true);

    // Pre-flight: ¿existe la API de cámara? (Falla seca si se accede por http en mobile.)
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        "Tu navegador no expone la cámara. Si entraste por http://, en celulares se requiere HTTPS.",
      );
      setStarting(false);
      return;
    }

    const html5Qr = new Html5Qrcode(READER_ID);
    scannerRef.current = html5Qr;
    try {
      await html5Qr.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 240, height: 240 } },
        (decodedText) => handleScan(decodedText),
        () => {
          /* ignoramos errores de "no encontré QR en este frame" */
        },
      );
      setRunning(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setCameraError(humanCameraError(msg));
      scannerRef.current = null;
    } finally {
      setStarting(false);
    }
  }

  async function stop() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      await s.stop();
      s.clear();
    } catch {
      // ignore
    }
    scannerRef.current = null;
    setRunning(false);
  }

  useEffect(() => {
    return () => {
      const s = scannerRef.current;
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {});
      }
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="card overflow-hidden">
        {/* El div con el ID es donde html5-qrcode inyecta el <video>. Lo dejamos limpio
            (sin flex, sin texto adentro) para no pelear con el render del video. */}
        <div className="relative w-full bg-black" style={{ aspectRatio: "1 / 1" }}>
          <div id={READER_ID} className="absolute inset-0 w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />

          {!running && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 gap-3 pointer-events-none">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                <path
                  d="M4 7a2 2 0 0 1 2-2h2l1.5-2h5L16 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <circle cx="12" cy="12" r="3.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <p className="text-[13px]">
                {starting ? "Abriendo cámara…" : "Cámara apagada"}
              </p>
            </div>
          )}

          {/* Marco guía para alinear el QR cuando la cámara está activa */}
          {running && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div
                className="border-2 border-white/80 rounded-2xl"
                style={{ width: 240, height: 240, boxShadow: "0 0 0 9999px rgba(0,0,0,0.35)" }}
              />
            </div>
          )}
        </div>

        <div className="border-t border-[var(--line)] p-4 flex items-center justify-between gap-3">
          {running ? (
            <button onClick={stop} className="btn btn-secondary btn-sm">Detener cámara</button>
          ) : (
            <button onClick={start} disabled={starting} className="btn btn-primary btn-sm">
              {starting && <span className="spinner" />}
              {starting ? "Iniciando…" : "Iniciar cámara"}
            </button>
          )}
          {busy && (
            <span className="text-[12px] text-[var(--muted)] flex items-center gap-2">
              <span className="spinner" />
              Validando…
            </span>
          )}
        </div>
      </div>

      {cameraError && (
        <div
          className="card p-4 text-[13px]"
          style={{ borderColor: "var(--danger)", background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          <p className="font-semibold mb-1">No pude abrir la cámara</p>
          <p>{cameraError}</p>
        </div>
      )}

      {result?.kind === "ok" && (
        <div
          className="card p-5 space-y-1"
          style={{ borderColor: "var(--success)", background: "var(--success-soft)" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "var(--success)" }}>
            ✓ Acceso autorizado
          </p>
          <p className="text-[15px]">
            Entrada #{result.ticketNumber} — {result.eventName}
          </p>
          <p className="text-[13px] text-[var(--muted)]">{result.venue}</p>
          <p className="text-[12px] text-[var(--muted)] mt-2">
            La entrada fue devuelta al organizador y ya no puede reutilizarse.
          </p>
        </div>
      )}

      {result?.kind === "error" && (
        <div
          className="card p-5 space-y-1"
          style={{ borderColor: "var(--danger)", background: "var(--danger-soft)" }}
        >
          <p className="text-[14px] font-semibold" style={{ color: "var(--danger)" }}>
            ✗ Rechazado
          </p>
          <p className="text-[13px]">{result.message}</p>
          <p className="text-[11px] mono text-[var(--muted)] mt-1">{result.code}</p>
        </div>
      )}
    </div>
  );
}

function humanCameraError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("permission") || m.includes("notallowed")) {
    return "Permiso denegado. Habilitá la cámara en el menú de candado del navegador.";
  }
  if (m.includes("notfound") || m.includes("devicesnotfound")) {
    return "No encontré una cámara en este dispositivo.";
  }
  if (m.includes("notreadable") || m.includes("trackstart")) {
    return "Otra app está usando la cámara. Cerrá videollamadas o el visor de cámara.";
  }
  if (m.includes("secure")) {
    return "La cámara requiere HTTPS en móviles. Probá con un túnel (cloudflared/ngrok).";
  }
  return msg;
}

function translateError(code: string | undefined): string {
  switch (code) {
    case "invalid_qr":
      return "El QR no tiene el formato esperado.";
    case "invalid_timestamp":
      return "El timestamp del QR es inválido.";
    case "qr_expired":
      return "El QR está vencido. Pedile al asistente que abra de nuevo su entrada.";
    case "qr_from_future":
      return "El reloj del dispositivo está adelantado.";
    case "invalid_signature":
      return "La firma del QR no es válida.";
    case "ticket_not_found":
      return "Esta entrada no existe.";
    case "not_event_organizer":
      return "No sos el organizador del evento de esta entrada.";
    case "not_current_owner":
      return "La entrada ya fue usada o transferida a otro dueño.";
    case "parse_error":
      return "No pude leer el QR.";
    case "camera_failed":
      return "No pude abrir la cámara. Permisos del navegador?";
    default:
      return code ?? "Error desconocido.";
  }
}
