import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { settleDueOperations } from "@/lib/nct/client";
import { getDisplayName } from "@/lib/display-name";

// GET /api/events/[id]/listings — listings ACTIVE de un evento.
// Filtra los que tienen ticket validado o cuyo dueño on-chain ya no
// es el seller (race contra una transferencia manual).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  // settleo lazy primero para no devolver listings con ownership atrasada
  await settleDueOperations();

  const listings = await prisma.ticketListing.findMany({
    where: { status: "ACTIVE", ticket: { eventId, validatedAt: null } },
    include: {
      ticket: { select: { id: true, ticketNumber: true, ownerPublicKey: true } },
      seller: { select: { id: true, email: true, displayName: true, publicKey: true } },
    },
    orderBy: { price: "asc" },
  });

  // Filtrar los stale: si el dueño on-chain no es el seller, el listing es inválido.
  const valid = listings.filter((l) => l.ticket.ownerPublicKey === l.seller.publicKey);

  return NextResponse.json({
    listings: valid.map((l) => ({
      id: l.id,
      ticketNumber: l.ticket.ticketNumber,
      price: l.price,
      currency: l.currency,
      sellerName: getDisplayName(l.seller),
      sellerId: l.seller.id,
      listedAt: l.listedAt,
    })),
  });
}
