import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// POST /api/tickets/[id]/list — el dueño de una entrada la lista para reventa.
// DELETE /api/tickets/[id]/list — cancela el listing activo.
// Ver ADR-017.

const Body = z.object({
  price: z
    .number({ message: "El precio debe ser un número" })
    .positive({ message: "El precio debe ser mayor a 0" })
    .max(10_000_000, { message: "El precio es absurdamente alto" }),
});

// Tope anti-scalping suave: 2× el precio original del evento.
const RESALE_PRICE_CAP_MULTIPLIER = 2;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ticketId } = await params;
  const session = await getSession();
  if (!session.userId || !session.publicKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }
  const { price } = parsed.data;

  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { event: { select: { id: true, price: true, name: true } } },
  });
  if (!ticket) {
    return NextResponse.json({ error: "ticket_not_found" }, { status: 404 });
  }
  if (ticket.ownerPublicKey !== session.publicKey) {
    return NextResponse.json(
      { error: "not_owner", message: "Solo el dueño actual puede listar la entrada." },
      { status: 403 },
    );
  }
  if (ticket.validatedAt) {
    return NextResponse.json(
      { error: "already_validated", message: "Esta entrada ya fue usada, no se puede revender." },
      { status: 409 },
    );
  }

  const maxPrice = ticket.event.price * RESALE_PRICE_CAP_MULTIPLIER;
  if (price > maxPrice) {
    return NextResponse.json(
      {
        error: "price_too_high",
        message: `El precio máximo de reventa es $${maxPrice.toFixed(2)} (2× el original).`,
      },
      { status: 400 },
    );
  }

  // Solo un listing activo a la vez por ticket.
  const existing = await prisma.ticketListing.findFirst({
    where: { ticketId, status: "ACTIVE" },
  });
  if (existing) {
    return NextResponse.json(
      { error: "already_listed", message: "Ya tenés esta entrada en venta." },
      { status: 409 },
    );
  }

  const listing = await prisma.ticketListing.create({
    data: {
      ticketId,
      sellerId: session.userId,
      price,
    },
  });

  return NextResponse.json({ listing });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: ticketId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const listing = await prisma.ticketListing.findFirst({
    where: { ticketId, status: "ACTIVE" },
  });
  if (!listing) {
    return NextResponse.json({ error: "no_active_listing" }, { status: 404 });
  }
  if (listing.sellerId !== session.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  await prisma.ticketListing.update({
    where: { id: listing.id },
    data: { status: "CANCELLED", resolvedAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
