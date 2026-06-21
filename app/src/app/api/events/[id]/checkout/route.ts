import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { isMpConfigured, createPreference } from "@/lib/payments/mercadopago";

// POST /api/events/[id]/checkout
// Crea una preferencia de pago en MercadoPago y devuelve la URL de checkout.
// Si MP no está configurado (MP_ACCESS_TOKEN vacío), cae en el flujo mock
// (compra directa sin pago real, como antes del Sprint C5).
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await params;
  const session = await getSession();
  if (!session.userId || !session.publicKey) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { organizer: { select: { publicKey: true } } },
  });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.status !== "EMITTED") {
    return NextResponse.json({ error: "event_not_emitted", message: "El evento no está emitido." }, { status: 409 });
  }
  if (event.organizer.publicKey === session.publicKey) {
    return NextResponse.json({ error: "cannot_buy_own_event", message: "No podés comprar entradas de tu propio evento." }, { status: 400 });
  }

  // Reservar un ticket disponible (del organizador, no validado) para este pago.
  // Excluimos validatedAt != null: una entrada consumida no se revende (ADR-015).
  const available = await prisma.ticket.findFirst({
    where: {
      eventId,
      ownerPublicKey: event.organizer.publicKey,
      validatedAt: null,
    },
    orderBy: { ticketNumber: "asc" },
  });
  if (!available) {
    return NextResponse.json({ error: "sold_out", message: "Agotado, no quedan entradas." }, { status: 409 });
  }

  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return NextResponse.json({ error: "user_not_found" }, { status: 404 });

  // Crear el Payment en estado PENDING.
  const payment = await prisma.payment.create({
    data: {
      userId: session.userId,
      eventId,
      ticketId: available.id,
      amount: event.price,
      status: "PENDING",
    },
  });

  // Si MP no está configurado, devolvemos un flag para que el cliente
  // haga el flujo mock (POST /api/events/[id]/buy como antes).
  if (!isMpConfigured()) {
    return NextResponse.json({
      mock: true,
      paymentId: payment.id,
      ticketId: available.id,
      ticketNumber: available.ticketNumber,
      message: "MP no configurado. Usá el botón mock.",
    });
  }

  // Crear preferencia en MP.
  try {
    const pref = await createPreference({
      paymentId: payment.id,
      eventName: event.name,
      ticketNumber: available.ticketNumber,
      amount: event.price,
      eventId,
      buyerEmail: user.email,
    });

    await prisma.payment.update({
      where: { id: payment.id },
      data: { mpPreferenceId: pref.preferenceId },
    });

    return NextResponse.json({
      mock: false,
      paymentId: payment.id,
      ticketNumber: available.ticketNumber,
      checkoutUrl: pref.checkoutUrl,
      initPoint: pref.initPoint,
      sandboxInitPoint: pref.sandboxInitPoint,
    });
  } catch (err) {
    console.error("[checkout] Error creando preferencia MP:", err);
    // Si falla la creación de preferencia, limpiamos el payment.
    await prisma.payment.delete({ where: { id: payment.id } });
    return NextResponse.json(
      { error: "mp_error", message: "Error al crear el pago en MercadoPago." },
      { status: 502 },
    );
  }
}
