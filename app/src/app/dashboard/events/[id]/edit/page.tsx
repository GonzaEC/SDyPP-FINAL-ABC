import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { toDatetimeLocalAR } from "@/lib/datetime";
import { EventForm } from "../../event-form";

export const dynamic = "force-dynamic";

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) redirect("/login");
  if (session.role !== "ORGANIZER") redirect("/events");

  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) notFound();
  if (event.organizerId !== session.userId) redirect("/dashboard");
  if (event.status !== "DRAFT") {
    // Una vez emitido no se puede editar: lo mandamos al dashboard con la info ya bloqueada.
    redirect("/dashboard");
  }

  return (
    <EventForm
      mode="edit"
      eventId={event.id}
      initial={{
        name: event.name,
        description: event.description,
        datetime: toDatetimeLocalAR(new Date(event.datetime)),
        venue: event.venue,
        imageUrl: event.imageUrl ?? "",
        price: String(event.price),
        ticketCount: String(event.ticketCount),
        category: event.category,
      }}
    />
  );
}
