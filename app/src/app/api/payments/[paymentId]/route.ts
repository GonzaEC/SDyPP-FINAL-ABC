import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { settleDueOperations } from "@/lib/nct/client";

// GET /api/payments/[paymentId]
// Devuelve el estado de un payment al comprador (solo el owner puede consultar).
// La página de resultado usa este endpoint para polling.
export async function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = await params;
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Settle por si hay ops NCT pendientes.
  await settleDueOperations();

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      event: { select: { id: true, name: true, venue: true, datetime: true } },
    },
  });
  if (!payment) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (payment.userId !== session.userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Si el pago fue aprobado y tiene una op NCT, verificar si ya se confirmó.
  let nctStatus = payment.nctStatus;
  if (payment.nctOpRef && nctStatus === "PENDING") {
    const op = await prisma.nctOperation.findUnique({ where: { id: payment.nctOpRef } });
    if (op && op.status !== "PENDING") {
      nctStatus = op.status;
      await prisma.payment.update({
        where: { id: paymentId },
        data: { nctStatus: op.status },
      });
    }
  }

  return NextResponse.json({
    id: payment.id,
    status: payment.status,
    mpStatus: payment.mpStatus,
    nctStatus,
    nctOpRef: payment.nctOpRef,
    ticketId: payment.ticketId,
    event: payment.event,
    createdAt: payment.createdAt.toISOString(),
  });
}
