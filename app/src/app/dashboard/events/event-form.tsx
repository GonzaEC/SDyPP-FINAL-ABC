"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORIES } from "@/lib/categories";
import { ImageUpload } from "@/components/image-upload";

export interface EventFormInitial {
  name: string;
  description: string;
  datetime: string; // formato datetime-local: "YYYY-MM-DDTHH:mm"
  venue: string;
  imageUrl: string;
  price: string;
  ticketCount: string;
  category: string;
}

const EMPTY: EventFormInitial = {
  name: "",
  description: "",
  datetime: "",
  venue: "",
  imageUrl: "",
  price: "0",
  ticketCount: "100",
  category: "OTHER",
};

interface Props {
  mode: "create" | "edit";
  initial?: Partial<EventFormInitial>;
  /** Solo presente en modo edit */
  eventId?: string;
}

export function EventForm({ mode, initial, eventId }: Props) {
  const router = useRouter();
  const [form, setForm] = useState<EventFormInitial>({ ...EMPTY, ...initial });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof EventFormInitial>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const body = {
        name: form.name,
        description: form.description,
        datetime: new Date(form.datetime).toISOString(),
        venue: form.venue,
        imageUrl: form.imageUrl || undefined,
        price: Number(form.price),
        ticketCount: Number(form.ticketCount),
        category: form.category,
      };
      const url = mode === "create" ? "/api/events" : `/api/events/${eventId}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? body.error ?? "save_failed");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown_error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl w-full px-4 sm:px-6 py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-[13px] sm:text-[14px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors mb-5 sm:mb-6"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Volver al panel
      </Link>

      <header className="mb-6 sm:mb-8 space-y-2">
        <p className="eyebrow">{mode === "create" ? "Crear evento" : "Editar evento"}</p>
        <h1 className="text-[30px] sm:text-[40px] lg:text-[44px] leading-[1.05] tracking-[-0.025em] font-semibold">
          {mode === "create" ? "Nuevo evento" : form.name || "Editar evento"}
        </h1>
        <p className="text-[14px] sm:text-[15px] text-[var(--muted)] max-w-xl">
          {mode === "create"
            ? "Cargá los datos básicos. Después firmás la emisión con tu clave para mintar el lote."
            : "Solo podés editar mientras el evento esté en borrador. Una vez emitido a la blockchain, el lote es inmutable."}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="card p-5 sm:p-8 space-y-5 sm:space-y-6">
        <Field label="Nombre del evento">
          <input
            required
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            className="input"
            placeholder="Ej. Festival Distribuido 2026"
            maxLength={120}
          />
        </Field>

        <Field label="Descripción">
          <textarea
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            rows={3}
            className="textarea"
            placeholder="Lo que el asistente debe saber sobre el evento."
            maxLength={2000}
          />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Fecha y hora">
            <input
              type="datetime-local"
              required
              value={form.datetime}
              onChange={(e) => update("datetime", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Lugar">
            <input
              required
              value={form.venue}
              onChange={(e) => update("venue", e.target.value)}
              className="input"
              placeholder="Auditorio, sala, dirección…"
              maxLength={200}
            />
          </Field>
        </div>

        <Field label="Categoría">
          <select
            value={form.category}
            onChange={(e) => update("category", e.target.value)}
            className="input"
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Imagen del evento (opcional)">
          <ImageUpload value={form.imageUrl} onChange={(url) => update("imageUrl", url)} />
        </Field>

        <div className="grid sm:grid-cols-2 gap-5">
          <Field label="Precio ($AR)">
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Cantidad de entradas">
            <input
              type="number"
              min="1"
              max="100000"
              required
              value={form.ticketCount}
              onChange={(e) => update("ticketCount", e.target.value)}
              className="input"
            />
          </Field>
        </div>

        <div
          className="rounded-[var(--radius-sm)] px-4 py-3 text-[13px] flex items-start gap-3"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.8" />
            <path d="M12 8v5M12 16.5v.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span>
            La cantidad de entradas se materializa al emitir. Una vez emitido, el lote es inmutable —
            la firma cubre el conjunto completo.
          </span>
        </div>

        {error && (
          <div className="text-[13px] text-[var(--danger)] bg-[var(--danger-soft)] rounded-[var(--radius-sm)] px-3 py-2.5">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-3 sm:pt-2 border-t border-[var(--line)]">
          <button type="button" onClick={() => router.back()} className="btn btn-secondary w-full sm:w-auto">
            Cancelar
          </button>
          <button type="submit" disabled={loading} className="btn btn-primary w-full sm:w-auto">
            {loading && <span className="spinner" />}
            {loading ? (mode === "create" ? "Creando…" : "Guardando…") : mode === "create" ? "Crear evento" : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
