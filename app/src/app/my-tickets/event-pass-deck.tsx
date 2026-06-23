"use client";

import { ChevronDown, MapPin, Tag } from "lucide-react";
import { PassCard } from "./pass-card";
import type { EventGroup } from "./wallet-view";

interface Props {
  group: EventGroup;
  publicKey: string;
  open: boolean;
  onToggle: () => void;
}

export function EventPassDeck({ group, publicKey, open, onToggle }: Props) {
  const { event, tickets, stats } = group;
  const date = new Date(event.datetime);
  const showDeckGhosts = stats.total > 1;
  const allValidated = stats.validated === stats.total && stats.total > 0;

  return (
    <div className={showDeckGhosts ? "pass-deck" : ""}>
      <article
        className="card overflow-hidden transition-all duration-300 ease-out"
        style={{
          // Cuando está cerrado, el deck se "levanta" en hover (lo aplicamos
          // solo al contenedor; los ghost cards permanecen abajo).
          transform: open ? "translateY(0)" : undefined,
        }}
      >
        {/* HEADER — clickable, abre/cierra el mazo */}
        <button
          type="button"
          onClick={onToggle}
          className="w-full text-left group/header relative overflow-hidden cursor-pointer"
          aria-expanded={open}
          aria-controls={`deck-${event.id}-body`}
        >
          {/* Backdrop con imagen del evento */}
          <div
            className="absolute inset-0 -z-0"
            style={{
              background: event.imageUrl
                ? `url(${event.imageUrl}) center/cover`
                : "linear-gradient(135deg, #0a3aff 0%, #0066ff 60%, #4d8bff 100%)",
              opacity: open ? 0.92 : 0.85,
            }}
            aria-hidden
          />
          {/* Overlay de legibilidad */}
          <div
            className="absolute inset-0 -z-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(11,13,18,0.15) 0%, rgba(11,13,18,0.65) 100%)",
            }}
            aria-hidden
          />

          <div className="relative z-10 px-5 sm:px-6 py-5 sm:py-6 flex items-start gap-4 sm:gap-5 text-white">
            {/* Date pill */}
            <div
              className="flex-shrink-0 flex flex-col items-center justify-center w-14 h-14 sm:w-[68px] sm:h-[68px] rounded-xl backdrop-blur-md"
              style={{ background: "rgba(255,255,255,0.95)", color: "var(--ink)" }}
            >
              <span className="text-[9px] sm:text-[10px] font-semibold uppercase tracking-[0.12em] opacity-75 leading-none">
                {date.toLocaleDateString("es-AR", { month: "short" }).replace(".", "")}
              </span>
              <span className="text-[20px] sm:text-[24px] font-semibold leading-none mt-1">
                {date.toLocaleDateString("es-AR", { day: "2-digit" })}
              </span>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1">
              <h3 className="text-[17px] sm:text-[19px] font-semibold leading-tight truncate drop-shadow-sm">
                {event.name}
              </h3>
              <div className="flex items-center gap-1.5 text-[12.5px] opacity-90">
                <MapPin size={12} strokeWidth={2} />
                <span className="truncate">{event.venue}</span>
                <span className="opacity-70">·</span>
                <span className="mono">
                  {date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
              {/* Stats badges */}
              <div className="flex flex-wrap items-center gap-1.5 pt-2">
                <span
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(255,255,255,0.95)", color: "var(--ink)" }}
                >
                  {stats.total} {stats.total === 1 ? "pase" : "pases"}
                </span>
                {stats.listed > 0 && (
                  <span
                    className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,209,102,0.95)", color: "#5C3D00" }}
                  >
                    <Tag size={10} strokeWidth={2.4} />
                    {stats.listed} en venta
                  </span>
                )}
                {allValidated && (
                  <span
                    className="text-[10px] font-bold tracking-[0.1em] px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(255,255,255,0.85)", color: "var(--muted)" }}
                  >
                    USADO
                  </span>
                )}
              </div>
            </div>

            {/* Chevron */}
            <div
              className="flex-shrink-0 w-8 h-8 rounded-full grid place-items-center backdrop-blur-md transition-transform duration-300"
              style={{
                background: "rgba(255,255,255,0.95)",
                color: "var(--ink)",
                transform: open ? "rotate(180deg)" : "rotate(0)",
              }}
            >
              <ChevronDown size={16} strokeWidth={2.4} />
            </div>
          </div>
        </button>

        {/* CUERPO — pases individuales */}
        {open && (
          <div
            id={`deck-${event.id}-body`}
            className="border-t border-[var(--line)] divide-y divide-[var(--line)]"
            style={{ background: "var(--surface)" }}
          >
            {tickets.map((t) => (
              <PassCard
                key={t.ticketId}
                ticket={t}
                eventDate={event.datetime}
                eventVenue={event.venue}
                eventPrice={event.price}
                publicKey={publicKey}
              />
            ))}
          </div>
        )}
      </article>
    </div>
  );
}
