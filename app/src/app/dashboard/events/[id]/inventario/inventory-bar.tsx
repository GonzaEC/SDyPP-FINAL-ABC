// Barra apilada que muestra la distribución del lote: disponibles / en manos /
// validadas. Server component (sin interactividad — solo presentación).
// Cada segmento se dimensiona por porcentaje sobre el total emitido.

interface Props {
  available: number;
  soldActive: number;
  validated: number;
  total: number;
}

const SEGMENTS = [
  { key: "available", label: "Disponibles", color: "var(--brand)" },
  { key: "soldActive", label: "En manos", color: "var(--success)" },
  { key: "validated", label: "Validadas", color: "var(--muted-2)" },
] as const;

export function InventoryBar({ available, soldActive, validated, total }: Props) {
  const values: Record<string, number> = { available, soldActive, validated };
  const safeTotal = total > 0 ? total : 1;

  return (
    <div className="space-y-3">
      <div
        className="flex h-3 rounded-full overflow-hidden"
        style={{ background: "var(--surface-2)" }}
      >
        {SEGMENTS.map((seg) => {
          const pct = (values[seg.key] / safeTotal) * 100;
          if (pct <= 0) return null;
          return (
            <div
              key={seg.key}
              style={{ width: `${pct}%`, background: seg.color }}
              title={`${seg.label}: ${values[seg.key]}`}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {SEGMENTS.map((seg) => (
          <div key={seg.key} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full"
              style={{ background: seg.color }}
            />
            <span className="text-[12px] text-[var(--muted)]">
              {seg.label}{" "}
              <span className="text-[var(--ink)] font-medium mono">
                {values[seg.key].toLocaleString("es-AR")}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
