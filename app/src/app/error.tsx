"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center text-center gap-5 max-w-md rise">
        <div
          className="w-12 h-12 rounded-xl grid place-items-center"
          style={{ background: "var(--danger-soft)", color: "var(--danger)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M12 9v4M12 17h.01"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-[24px] sm:text-[28px] font-semibold leading-tight tracking-tight">
          Algo se rompió
        </h1>
        <p className="text-[15px] text-[var(--muted)] leading-relaxed">
          Ocurrió un error inesperado al cargar esta página. Probá de nuevo en
          unos segundos.
        </p>
        <div className="flex gap-2 mt-2">
          <button type="button" onClick={() => unstable_retry()} className="btn btn-primary">
            Reintentar
          </button>
          <Link href="/" className="btn btn-secondary">
            Volver al inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
