"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  initial: { displayName: string; bio: string };
  organizerId: string;
}

export function ProfileForm({ initial, organizerId }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/me/profile", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName, bio }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "save_failed");
      }
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card p-5 sm:p-8 space-y-5">
      <label className="field">
        <span className="field-label">Nombre público</span>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="input"
          placeholder="Cómo querés que te vean los asistentes"
          maxLength={60}
        />
        <span className="text-[11px] text-[var(--muted)] mt-1.5">
          Si lo dejás vacío, mostramos la parte antes del @ de tu email.
        </span>
      </label>

      <label className="field">
        <span className="field-label">Bio</span>
        <textarea
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          rows={4}
          className="textarea"
          placeholder="Contá quién sos y qué tipo de eventos organizás."
          maxLength={500}
        />
        <span className="text-[11px] text-[var(--muted)] mt-1.5">
          {bio.length}/500
        </span>
      </label>

      {error && (
        <div className="text-[13px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[var(--radius-sm)] px-3 py-2.5">
          {error}
        </div>
      )}
      {saved && !error && (
        <div className="text-[13px] text-[var(--success)] bg-[var(--success-soft)] rounded-[var(--radius-sm)] px-3 py-2.5">
          Perfil actualizado.
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-3 pt-3 border-t border-[var(--line)]">
        <a
          href={`/organizers/${organizerId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-secondary w-full sm:w-auto"
        >
          Ver mi página pública
        </a>
        <button type="submit" disabled={loading} className="btn btn-primary w-full sm:w-auto">
          {loading && <span className="spinner" />}
          {loading ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>
    </form>
  );
}
