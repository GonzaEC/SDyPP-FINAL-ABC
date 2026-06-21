import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// Cancela un evento ya EMITTED. No lo borra (para auditabilidad).
// El evento deja de aparecer en el listado público y no se pueden comprar más entradas.
// La política de reembolso para entradas ya vendidas queda fuera de esta operación.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.organizerId !== session.userId) {
    return NextResponse.json({ error: "forbidden", message: "No sos el organizador." }, { status: 403 });
  }
  if (event.status === "CANCELLED") {
    return NextResponse.json({ event });
  }
  if (event.status === "DRAFT") {
    // En DRAFT preferimos borrarlo (DELETE). Acá no hacemos nada raro.
    return NextResponse.json(
      { error: "use_delete_for_draft", message: "Para un borrador, usá borrar en su lugar." },
      { status: 400 },
    );
  }

  const updated = await prisma.event.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ event: updated });
}
