import Link from "next/link";
import { Logo } from "@/components/logo";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="flex flex-col items-center text-center gap-5 max-w-md rise">
        <Logo size="sm" withWordmark={false} />
        <p className="eyebrow">Error 404</p>
        <h1 className="text-[28px] sm:text-[32px] font-semibold leading-tight tracking-tight">
          Esta página no existe
        </h1>
        <p className="text-[15px] text-[var(--muted)] leading-relaxed">
          La URL que buscabas puede haber cambiado o no estar más disponible.
          Volvé a la cartelera para encontrar eventos.
        </p>
        <Link href="/events" className="btn btn-primary mt-2">
          Ver eventos
        </Link>
      </div>
    </div>
  );
}
