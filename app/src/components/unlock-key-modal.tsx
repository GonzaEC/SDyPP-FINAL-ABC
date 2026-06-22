"use client";

import { useEffect, useRef, useState } from "react";
import { unlockPrivateKey } from "@/lib/crypto/client";
import { setUnlockedKey } from "@/lib/identity-store";
import { IconLock } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  onUnlocked: () => void;
}

export function UnlockKeyModal({ open, onClose, onUnlocked }: Props) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setPassword("");
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/me/unlock-blob");
      if (!res.ok) throw new Error("session_expired");
      const blob = await res.json();
      const key = await unlockPrivateKey(
        password,
        blob.encryptedPrivateKey,
        blob.kdfSalt,
        blob.kdfIv,
      );
      setUnlockedKey(key);
      onUnlocked();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // AES-GCM con key derivada incorrecta tira OperationError.
      if (msg.includes("session_expired")) {
        setError("Tu sesión expiró. Iniciá sesión de nuevo.");
      } else {
        setError("Contraseña incorrecta.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-[var(--bg)] border border-[var(--line)] rounded-2xl p-6 w-full max-w-sm shadow-xl space-y-4"
      >
        <header className="space-y-1.5">
          <div
            className="w-10 h-10 rounded-xl grid place-items-center"
            style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
          >
            <IconLock size={20} />
          </div>
          <h2 className="text-[18px] font-semibold leading-tight">Desbloquear tu clave</h2>
          <p className="text-[13px] text-[var(--muted)] leading-snug">
            Tu clave privada vive solo en memoria del navegador. Si refrescaste la página, hay
            que volver a desbloquearla con tu contraseña para firmar. El servidor no la ve.
          </p>
        </header>

        <label className="field">
          <span className="field-label">Contraseña</span>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="••••••••"
            required
          />
        </label>

        {error && (
          <p
            className="text-[13px]"
            style={{ color: "var(--danger)" }}
          >
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary btn-sm">
            Cancelar
          </button>
          <button type="submit" disabled={loading || !password} className="btn btn-primary btn-sm">
            {loading && <span className="spinner" />}
            {loading ? "Desbloqueando…" : "Desbloquear"}
          </button>
        </div>
      </form>
    </div>
  );
}
