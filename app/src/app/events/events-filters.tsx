"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { CATEGORIES } from "@/lib/categories";

export function EventsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialQ = searchParams.get("q") ?? "";
  const initialCategory = searchParams.get("category") ?? "";

  const [q, setQ] = useState(initialQ);
  const [category, setCategory] = useState(initialCategory);

  // Debounce de la búsqueda para no spamear el server con cada tecla.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (category) params.set("category", category);
      const qs = params.toString();
      router.replace(qs ? `/events?${qs}` : "/events", { scroll: false });
    }, 300);
    return () => clearTimeout(timer);
  }, [q, category, router]);

  const hasFilters = q.trim() || category;

  return (
    <div
      className="grid gap-3 items-center"
      style={{
        gridTemplateColumns: hasFilters
          ? "minmax(0, 1fr) 14rem auto"
          : "minmax(0, 1fr) 14rem",
      }}
    >
      <div className="relative min-w-0">
        <Search
          size={16}
          strokeWidth={2}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"
          style={{ color: "var(--muted)" }}
        />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre, lugar o descripción…"
          className="input"
          style={{ paddingLeft: 38 }}
          aria-label="Buscar eventos"
        />
      </div>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="input"
        aria-label="Filtrar por categoría"
      >
        <option value="">Todas las categorías</option>
        {CATEGORIES.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setQ("");
            setCategory("");
          }}
          className="btn btn-secondary inline-flex items-center gap-1.5 whitespace-nowrap"
        >
          <X size={14} strokeWidth={2.2} />
          Limpiar
        </button>
      )}
    </div>
  );
}
