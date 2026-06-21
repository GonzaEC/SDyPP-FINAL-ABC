import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { EventInput, formatZodError } from "@/lib/validations/event";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ event });
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.organizerId !== session.userId) {
    return NextResponse.json({ error: "forbidden", message: "No sos el organizador." }, { status: 403 });
  }
  if (event.status !== "DRAFT") {
    return NextResponse.json(
      { error: "cannot_edit_emitted", message: "Una vez emitido a la blockchain, el evento no se puede editar." },
      { status: 409 },
    );
  }

  const parsed = EventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: formatZodError(parsed.error), details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const updated = await prisma.event.update({
    where: { id },
    data: {
      name: data.name,
      description: data.description,
      datetime: new Date(data.datetime),
      venue: data.venue,
      imageUrl: data.imageUrl,
      price: data.price,
      ticketCount: data.ticketCount,
      category: data.category,
    },
  });
  return NextResponse.json({ event: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (event.organizerId !== session.userId) {
    return NextResponse.json({ error: "forbidden", message: "No sos el organizador." }, { status: 403 });
  }
  if (event.status === "EMITTED") {
    return NextResponse.json(
      {
        error: "cannot_delete_emitted",
        message: "Un evento ya emitido a blockchain no se puede borrar. Cancelalo en su lugar.",
      },
      { status: 409 },
    );
  }
  await prisma.event.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
