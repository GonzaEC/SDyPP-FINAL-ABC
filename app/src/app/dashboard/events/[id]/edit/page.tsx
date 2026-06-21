import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { EventForm } from "../../event-form";

export const dynamic = "force-dynamic";

// Convierte un Date a string en formato datetime-local LOCAL (no UTC).
// El input type="datetime-local" no acepta zona horaria, así que hay que pasar
// "YYYY-MM-DDTHH:mm" interpretado en hora local del browser.
function toDatetimeLocalString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

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
        datetime: toDatetimeLocalString(new Date(event.datetime)),
        venue: event.venue,
        imageUrl: event.imageUrl ?? "",
        price: String(event.price),
        ticketCount: String(event.ticketCount),
        category: event.category,
      }}
    />
  );
}
