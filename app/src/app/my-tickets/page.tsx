import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { getTicketsByOwner } from "@/lib/nct/client";
import { WalletView, type EventGroup } from "./wallet-view";
import { EmptyWallet } from "./empty-wallet";

export const dynamic = "force-dynamic";

export default async function MyTicketsPage() {
  const session = await getSession();
  if (!session.userId || !session.publicKey) redirect("/login");

  // Solo pases adquiridos: excluimos los tickets del stock del propio organizador
  // (esos viven en su inventario, ver plan/ADR). Esto resuelve el caso del
  // organizador que emite 80k tickets y no debería verlos como "pases personales".
  const ownership = await getTicketsByOwner(session.publicKey, {
    excludeOwnedEventsOf: session.userId,
  });

  if (ownership.length === 0) {
    return (
      <div className="mx-auto max-w-4xl w-full px-4 sm:px-6 py-10 sm:py-14 space-y-10">
        <header className="space-y-2">
          <p className="eyebrow">Mis pases</p>
          <h1 className="text-[30px] sm:text-[40px] lg:text-[44px] leading-[1.05] tracking-[-0.025em] font-semibold">
            Tu billetera está vacía
          </h1>
          <p className="text-[14px] sm:text-[15px] text-[var(--muted)] max-w-lg">
            Cuando compres una entrada va a aparecer acá como un pase coleccionable, con su QR firmado.
          </p>
        </header>
        <EmptyWallet />
      </div>
    );
  }

  // Necesitamos validatedAt para mostrar el sello "USADO".
  const ticketIds = ownership.map((o) => o.ticketId);
  const ticketDetails = await prisma.ticket.findMany({
    where: { id: { in: ticketIds } },
    select: { id: true, validatedAt: true },
  });
  const validatedById = new Map(
    ticketDetails.map((t) => [t.id, t.validatedAt ? t.validatedAt.toISOString() : null]),
  );

  const eventIds = [...new Set(ownership.map((o) => o.eventId))];
  const events = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, name: true, datetime: true, venue: true, imageUrl: true, price: true },
  });
  const eventById = new Map(events.map((e) => [e.id, e]));

  // Listings activos del usuario para cada ticket.
  const activeListings = await prisma.ticketListing.findMany({
    where: { ticketId: { in: ticketIds }, status: "ACTIVE" },
    select: { id: true, ticketId: true, price: true },
  });
  const listingByTicket = new Map(activeListings.map((l) => [l.ticketId, l]));

  // Agrupar por evento.
  const groupsMap = new Map<string, EventGroup>();
  for (const o of ownership) {
    const event = eventById.get(o.eventId);
    if (!event) continue;
    if (!groupsMap.has(o.eventId)) {
      groupsMap.set(o.eventId, {
        event: {
          id: event.id,
          name: event.name,
          datetime: event.datetime.toISOString(),
          venue: event.venue,
          imageUrl: event.imageUrl,
          price: event.price,
        },
        tickets: [],
        stats: { total: 0, listed: 0, validated: 0 },
      });
    }
    const group = groupsMap.get(o.eventId)!;
    const listing = listingByTicket.get(o.ticketId);
    const validatedAt = validatedById.get(o.ticketId) ?? null;
    group.tickets.push({
      ticketId: o.ticketId,
      ticketNumber: o.ticketNumber,
      validatedAt,
      activeListing: listing ? { id: listing.id, price: listing.price } : null,
    });
    group.stats.total += 1;
    if (listing) group.stats.listed += 1;
    if (validatedAt) group.stats.validated += 1;
  }

  // Ordenar grupos por fecha del evento (próximos primero), tickets dentro
  // por número ascendente.
  const groups = [...groupsMap.values()].sort(
    (a, b) => new Date(a.event.datetime).getTime() - new Date(b.event.datetime).getTime(),
  );
  for (const g of groups) {
    g.tickets.sort((a, b) => a.ticketNumber - b.ticketNumber);
  }

  return (
    <div className="mx-auto max-w-4xl w-full px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <header className="space-y-2">
        <p className="eyebrow">Mis pases</p>
        <h1 className="text-[30px] sm:text-[40px] lg:text-[44px] leading-[1.05] tracking-[-0.025em] font-semibold">
          Tu billetera
        </h1>
        <p className="text-[14px] sm:text-[15px] text-[var(--muted)] max-w-lg">
          {groups.length === 1
            ? "Tocá un pase para mostrar el QR. Se firma con tu clave privada y se renueva cada 30 segundos."
            : `${groups.length} eventos en tu colección. Tocá un mazo para ver los pases.`}
        </p>
      </header>

      <WalletView
        groups={groups}
        publicKey={session.publicKey}
        defaultOpenEventId={groups.length === 1 ? groups[0].event.id : undefined}
      />
    </div>
  );
}
