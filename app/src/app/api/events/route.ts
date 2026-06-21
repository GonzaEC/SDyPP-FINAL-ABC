import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { EventInput, formatZodError } from "@/lib/validations/event";
import { isValidCategory } from "@/lib/categories";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const category = searchParams.get("category")?.trim();

  const where: Record<string, unknown> = {
    status: { in: ["PUBLISHED", "EMITTED"] },
  };
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { venue: { contains: q, mode: "insensitive" } },
      { description: { contains: q, mode: "insensitive" } },
    ];
  }
  if (category && isValidCategory(category)) {
    where.category = category;
  }

  const events = await prisma.event.findMany({
    where,
    orderBy: { datetime: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      datetime: true,
      venue: true,
      imageUrl: true,
      price: true,
      ticketCount: true,
      category: true,
      status: true,
    },
  });
  return NextResponse.json({ events });
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.userId || session.role !== "ORGANIZER") {
    return NextResponse.json({ error: "forbidden", message: "Solo organizadores pueden crear eventos." }, { status: 403 });
  }
  const parsed = EventInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: formatZodError(parsed.error), details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const data = parsed.data;
  const event = await prisma.event.create({
    data: {
      organizerId: session.userId,
      name: data.name,
      description: data.description,
      datetime: new Date(data.datetime),
      venue: data.venue,
      imageUrl: data.imageUrl,
      price: data.price,
      ticketCount: data.ticketCount,
      category: data.category,
      status: "DRAFT",
    },
  });
  return NextResponse.json({ event });
}
