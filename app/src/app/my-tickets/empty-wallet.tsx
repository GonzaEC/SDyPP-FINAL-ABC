import Link from "next/link";
import { Ticket } from "lucide-react";

// Empty state: un "pase fantasma" + CTA. Refuerza la metáfora wallet
// desde el primer momento, en lugar de mostrar solo texto.
export function EmptyWallet() {
  return (
    <div className="rise rise-1 space-y-6">
      <div className="pass-deck">
        <div
          className="card overflow-hidden"
          style={{ opacity: 0.45, background: "var(--surface)" }}
        >
          <div className="px-5 sm:px-6 py-6 flex items-start gap-4">
            <div
              className="flex-shrink-0 w-[68px] h-[68px] rounded-xl grid place-items-center"
              style={{ background: "var(--surface-2)", color: "var(--muted-2)" }}
            >
              <Ticket size={26} strokeWidth={1.5} />
            </div>
            <div className="flex-1 space-y-2">
              <div className="h-4 w-2/3 rounded-full" style={{ background: "var(--surface-2)" }} />
              <div className="h-3 w-1/2 rounded-full" style={{ background: "var(--surface-2)" }} />
              <div className="h-3 w-20 rounded-full mt-3" style={{ background: "var(--surface-2)" }} />
            </div>
          </div>
        </div>
      </div>

      <div className="text-center pt-2">
        <Link href="/events" className="btn btn-primary inline-flex items-center gap-2">
          Ver cartelera
        </Link>
      </div>
    </div>
  );
}
