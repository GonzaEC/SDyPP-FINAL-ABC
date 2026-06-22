export default function Loading() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center gap-4 rise">
        <span
          className="spinner"
          style={{ width: 24, height: 24, color: "var(--brand)" }}
        />
        <p className="text-[14px] text-[var(--muted)]">Cargando…</p>
      </div>
    </div>
  );
}
