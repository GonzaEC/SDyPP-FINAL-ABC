"use client";

import { useState } from "react";
import { Calendar, MapPin, QrCode } from "lucide-react";
import { TicketQR } from "@/components/ticket-qr";
import { ListingControl } from "./listing-control";
import type { EventGroupTicket } from "./wallet-view";

interface Props {
  ticket: EventGroupTicket;
  eventDate: string; // ISO
  eventVenue: string;
  eventPrice: number;
  publicKey: string;
}

export function PassCard({ ticket, eventDate, eventVenue, eventPrice, publicKey }: Props) {
  const [open, setOpen] = useState(false);
  const date = new Date(eventDate);
  const isValidated = ticket.validatedAt !== null;
  const isListed = ticket.activeListing !== null;

  // Color del badge / accent según estado.
  const accent = isValidated
    ? { color: "var(--muted)", background: "var(--surface-2)" }
    : isListed
      ? { color: "#5C3D00", background: "rgba(255,209,102,0.35)" }
      : { color: "var(--brand)", background: "var(--brand-soft)" };

  const statusLabel = isValidated ? "validado" : isListed ? "en venta" : "activo";

  return (
    <div className="relative" style={{ opacity: isValidated ? 0.65 : 1 }}>
      {isValidated && <div className="stamp-used">USADO</div>}

      {/* PASE — layout horizontal con perforación */}
      <div className="px-4 sm:px-5 py-4 flex items-stretch gap-4 sm:gap-5">
        {/* Sección izquierda: número + status */}
        <div className="flex-shrink-0 flex flex-col justify-between min-w-[110px] sm:min-w-[130px]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--muted)] leading-none">
              Pase
            </p>
            <p className="text-[28px] sm:text-[34px] font-semibold leading-none mt-1 mono tracking-tight">
              #{String(ticket.ticketNumber).padStart(3, "0")}
            </p>
          </div>
          <span
            className="inline-block w-fit text-[10px] font-semibold uppercase tracking-[0.1em] px-2 py-1 rounded-full mt-3"
            style={accent}
          >
            {statusLabel}
          </span>
        </div>

        {/* Perforación */}
        <div className="pass-perforation flex-shrink-0 self-stretch" aria-hidden />

        {/* Sección derecha: info + acción */}
        <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
          <div className="space-y-1 text-[12.5px] text-[var(--muted)]">
            <div className="flex items-center gap-1.5">
              <Calendar size={12} strokeWidth={2} />
              <span>
                {date.toLocaleDateString("es-AR", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {" · "}
                <span className="mono">
                  {date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <MapPin size={12} strokeWidth={2} />
              <span className="truncate">{eventVenue}</span>
            </div>
            {isListed && ticket.activeListing && (
              <p className="text-[12px] pt-1" style={{ color: "#5C3D00" }}>
                En venta a{" "}
                <span className="font-semibold">
                  ${ticket.activeListing.price.toFixed(2)}
                </span>
              </p>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setOpen((v) => !v)}
              disabled={isValidated}
              className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
              title={isValidated ? "Esta entrada ya fue validada" : undefined}
            >
              <QrCode size={14} strokeWidth={2.2} />
              {open ? "Ocultar QR" : "Mostrar QR"}
            </button>
          </div>
        </div>
      </div>

      {/* PANEL del QR */}
      {open && !isValidated && (
        <div
          className="border-t border-[var(--line)] p-5 flex flex-col items-center gap-3"
          style={{ background: "var(--bg)" }}
        >
          <TicketQR ticketId={ticket.ticketId} publicKey={publicKey} size={240} />
          <p className="text-[12px] text-[var(--muted)] max-w-xs text-center">
            Mostrá este QR en la puerta. Se renueva cada 30 segundos para evitar capturas.
          </p>
        </div>
      )}

      {/* Listing control — sin cambios estructurales */}
      {!isValidated && (
        <ListingControl
          ticketId={ticket.ticketId}
          eventPrice={eventPrice}
          activeListing={ticket.activeListing}
        />
      )}
    </div>
  );
}
