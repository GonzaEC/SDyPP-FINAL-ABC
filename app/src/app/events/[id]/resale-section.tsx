import { Repeat } from "lucide-react";
import { prisma } from "@/lib/db";
import { settleDueOperations } from "@/lib/nct/client";
import { getDisplayName, getInitials } from "@/lib/display-name";
import { ResaleBuyButton } from "./resale-buy-button";

interface Props {
  eventId: string;
  /** publicKey del visitante (para deshabilitar comprar tu propia reventa) */
  viewerPublicKey: string | null;
  /** true si el visitante está logueado */
  viewerLoggedIn: boolean;
}

// Sección de reventa P2P en el detalle del evento. Servidor (lee directo de
// DB con settleo lazy primero). Cada listing tiene su botón cliente.
export async function ResaleSection({ eventId, viewerPublicKey, viewerLoggedIn }: Props) {
  await settleDueOperations();

  const listings = await prisma.ticketListing.findMany({
    where: { status: "ACTIVE", ticket: { eventId, validatedAt: null } },
    include: {
      ticket: { select: { id: true, ticketNumber: true, ownerPublicKey: true } },
      seller: { select: { id: true, email: true, displayName: true, publicKey: true } },
    },
    orderBy: { price: "asc" },
  });

  // Stale listings (la entrada cambió de manos por afuera) → no mostrar.
  const valid = listings.filter((l) => l.ticket.ownerPublicKey === l.seller.publicKey);
  if (valid.length === 0) return null;

  return (
    <div className="card p-5 sm:p-6 space-y-4">
      <header className="flex items-center gap-2.5">
        <div
          className="w-8 h-8 rounded-lg grid place-items-center"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          <Repeat size={16} strokeWidth={2} />
        </div>
        <div>
          <h2 className="text-[15px] sm:text-[16px] font-semibold leading-tight">
            Reventa disponible
          </h2>
          <p className="text-[11.5px] text-[var(--muted)]">
            Entradas puestas en venta por otros asistentes
          </p>
        </div>
      </header>

      <ul className="space-y-2.5">
        {valid.map((l) => {
          const sellerName = getDisplayName(l.seller);
          const initials = getInitials(sellerName);
          const isOwn = viewerPublicKey === l.seller.publicKey;
          const disabledReason = !viewerLoggedIn
            ? "Iniciá sesión para comprar"
            : isOwn
              ? "Es tu propia reventa"
              : undefined;
          return (
            <li
              key={l.id}
              className="flex items-center gap-3 rounded-[var(--radius-sm)] px-3 py-2.5"
              style={{ background: "var(--surface)" }}
            >
              <div
                className="flex-shrink-0 w-9 h-9 rounded-lg grid place-items-center text-[12px] font-semibold"
                style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium truncate">{sellerName}</p>
                <p className="text-[11.5px] text-[var(--muted)] mono">
                  Pase #{l.ticket.ticketNumber}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-[15px] font-semibold leading-none mb-1.5">
                  ${l.price.toFixed(2)}
                </p>
                <ResaleBuyButton
                  listingId={l.id}
                  disabled={disabledReason !== undefined}
                  reason={disabledReason}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
