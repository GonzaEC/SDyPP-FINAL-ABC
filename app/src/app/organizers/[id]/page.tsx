import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCategory } from "@/lib/categories";
import { getDisplayName, getInitials } from "@/lib/display-name";

export const dynamic = "force-dynamic";

export default async function OrganizerPublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const organizer = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      bio: true,
      publicKey: true,
      createdAt: true,
    },
  });
  if (!organizer) notFound();

  const events = await prisma.event.findMany({
    where: { organizerId: id, status: { in: ["PUBLISHED", "EMITTED"] } },
    orderBy: { datetime: "asc" },
  });

  const displayName = getDisplayName(organizer);
  const initials = getInitials(displayName);
  const upcoming = events.filter((e) => new Date(e.datetime).getTime() > Date.now());
  const past = events.filter((e) => new Date(e.datetime).getTime() <= Date.now());
  const memberSince = organizer.createdAt.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="mx-auto max-w-5xl w-full px-4 sm:px-6 py-10 sm:py-14 space-y-8 sm:space-y-10">
      <Link
        href="/events"
        className="inline-flex items-center gap-1.5 text-[13px] sm:text-[14px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Volver a la cartelera
      </Link>

      <header className="flex flex-col sm:flex-row sm:items-start gap-5 sm:gap-7">
        <div
          className="flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-2xl grid place-items-center text-[26px] sm:text-[32px] font-semibold"
          style={{ background: "var(--brand-soft)", color: "var(--brand)" }}
        >
          {initials}
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <p className="eyebrow">Organizador</p>
          <h1 className="text-[28px] sm:text-[40px] lg:text-[44px] leading-[1.05] tracking-[-0.025em] font-semibold">
            {displayName}
          </h1>
          {organizer.bio && (
            <p className="text-[14px] sm:text-[15.5px] text-[var(--ink-2)] leading-relaxed max-w-2xl whitespace-pre-wrap">
              {organizer.bio}
            </p>
          )}
          <div className="flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[var(--muted)] pt-1">
            <span>En la plataforma desde {memberSince}</span>
            <span className="mono">
              {organizer.publicKey.slice(0, 10)}…{organizer.publicKey.slice(-6)}
            </span>
          </div>
        </div>
      </header>

      <section className="space-y-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[20px] sm:text-[24px] font-semibold">
            Próximos eventos
            <span className="ml-2 text-[14px] font-normal text-[var(--muted)]">
              {upcoming.length}
            </span>
          </h2>
        </div>
        {upcoming.length === 0 ? (
          <div className="card p-10 text-center text-[14px] text-[var(--muted)]">
            No tiene eventos próximos por ahora.
          </div>
        ) : (
          <EventGrid events={upcoming} />
        )}
      </section>

      {past.length > 0 && (
        <section className="space-y-5">
          <h2 className="text-[20px] sm:text-[24px] font-semibold">
            Eventos pasados
            <span className="ml-2 text-[14px] font-normal text-[var(--muted)]">
              {past.length}
            </span>
          </h2>
          <EventGrid events={past} dim />
        </section>
      )}
    </div>
  );
}

type EventCard = {
  id: string;
  name: string;
  venue: string;
  datetime: Date;
  imageUrl: string | null;
  category: string;
  price: number;
};

function EventGrid({ events, dim }: { events: EventCard[]; dim?: boolean }) {
  return (
    <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
      {events.map((e) => {
        const d = new Date(e.datetime);
        const cat = getCategory(e.category);
        const CatIcon = cat.Icon;
        return (
          <li key={e.id}>
            <Link
              href={`/events/${e.id}`}
              className={
                "card overflow-hidden hover:-translate-y-0.5 hover:shadow-[var(--shadow)] transition-all duration-300 block group " +
                (dim ? "opacity-70 hover:opacity-100" : "")
              }
            >
              <div
                className="h-[120px] relative overflow-hidden"
                style={{
                  background: e.imageUrl
                    ? `url(${e.imageUrl}) center/cover`
                    : "linear-gradient(135deg, #0a3aff 0%, #0066ff 60%, #4d8bff 100%)",
                }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                <span
                  className="absolute top-3 right-3 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full bg-white/95 backdrop-blur"
                  style={{ color: "var(--ink)" }}
                >
                  <CatIcon size={12} strokeWidth={2.2} />
                  {cat.label}
                </span>
              </div>
              <div className="p-4 sm:p-5 space-y-2">
                <h3 className="text-[16px] sm:text-[17px] font-semibold leading-tight group-hover:text-[var(--brand)] transition-colors">
                  {e.name}
                </h3>
                <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--muted)]">
                  <Calendar size={12} strokeWidth={2} />
                  {d.toLocaleDateString("es-AR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
                <div className="flex items-center gap-1.5 text-[12.5px] text-[var(--muted)] truncate">
                  <MapPin size={12} strokeWidth={2} />
                  <span className="truncate">{e.venue}</span>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
