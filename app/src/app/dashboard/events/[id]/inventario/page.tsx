import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Ticket, ShoppingCart, CheckCircle2, Tag, Wallet } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { settleDueOperations } from "@/lib/nct/client";
import { InventoryBar } from "./inventory-bar";

export const dynamic = "force-dynamic";

export default async function InventoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session.userId) redirect("/login");
  if (session.role !== "ORGANIZER") redirect("/events");

  // Settle pendientes antes de leer para que los conteos estén al día.
  await settleDueOperations();

  const event = await prisma.event.findUnique({
    where: { id },
    include: { organizer: { select: { id: true, publicKey: true } } },
  });
  if (!event) notFound();
  if (event.organizer.id !== session.userId) redirect("/dashboard");

  const organizerKey = event.organizer.publicKey;

  // Conteos agregados (sin traer filas individuales — escala a 80k tickets).
  //
  // Ojo con el modelo: al validarse en puerta, la entrada se transfiere de
  // vuelta al organizador (ADR-005). Por eso una entrada validada vuelve a
  // tener owner == organizer. Para "vendidas" no alcanza con mirar el dueño
  // actual; hay que contar también las validadas (que se vendieron y se
  // consumieron). Definiciones:
  //   - soldActive: comprada, en manos del asistente, sin validar (owner != org, validatedAt null)
  //   - validated:  ya escaneada en puerta (validatedAt != null)
  //   - available:  todavía en stock del organizador, sin validar
  //   - everSold = soldActive + validated  → lo que mostramos como "Vendidas"
  const [emitted, soldActive, available, validated, listed, revenueAgg] = await Promise.all([
    prisma.ticket.count({ where: { eventId: id } }),
    prisma.ticket.count({
      where: { eventId: id, ownerPublicKey: { not: organizerKey }, validatedAt: null },
    }),
    prisma.ticket.count({
      where: { eventId: id, ownerPublicKey: organizerKey, validatedAt: null },
    }),
    prisma.ticket.count({ where: { eventId: id, validatedAt: { not: null } } }),
    prisma.ticketListing.count({
      where: { status: "ACTIVE", ticket: { eventId: id } },
    }),
    prisma.payment.aggregate({
      where: { eventId: id, status: "APPROVED" },
      _sum: { amount: true },
    }),
  ]);

  const revenue = revenueAgg._sum.amount ?? 0;
  // Vendidas alguna vez = en manos + validadas (las validadas también se vendieron).
  const everSold = soldActive + validated;
  const sellThroughPct = emitted > 0 ? Math.round((everSold / emitted) * 100) : 0;

  const date = new Date(event.datetime);

  return (
    <div className="mx-auto max-w-4xl w-full px-4 sm:px-6 py-10 sm:py-14 space-y-8">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-[13px] sm:text-[14px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Volver al panel
      </Link>

      <header className="space-y-2">
        <p className="eyebrow">Inventario</p>
        <h1 className="text-[28px] sm:text-[38px] lg:text-[42px] leading-[1.05] tracking-[-0.025em] font-semibold">
          {event.name}
        </h1>
        <p className="text-[13px] sm:text-[14px] text-[var(--muted)]">
          {event.venue} · {date.toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })}
          {" · "}
          <span className="mono">{date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })} hs</span>
        </p>
      </header>

      {emitted === 0 ? (
        <div className="card p-12 text-center">
          <div
            className="mx-auto w-14 h-14 rounded-2xl grid place-items-center mb-4"
            style={{ background: "var(--surface)" }}
          >
            <Ticket size={24} strokeWidth={1.6} style={{ color: "var(--muted)" }} />
          </div>
          <h3 className="text-[18px] font-semibold mb-1">Sin entradas todavía</h3>
          <p className="text-[14px] text-[var(--muted)] max-w-sm mx-auto">
            Este evento aún no fue emitido a la blockchain, o el minteo está en curso.
          </p>
        </div>
      ) : (
        <>
          {/* Hero: ingresos + sell-through */}
          <section className="grid sm:grid-cols-2 gap-3 sm:gap-4">
            <div
              className="card p-5 sm:p-6 flex flex-col justify-between"
              style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
            >
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium opacity-90">Ingresos confirmados</p>
                <Wallet size={20} strokeWidth={2} className="opacity-90" />
              </div>
              <p className="text-[34px] sm:text-[42px] font-semibold leading-none tracking-[-0.02em] mt-4">
                ${revenue.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>

            <div className="card p-5 sm:p-6 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <p className="text-[13px] font-medium text-[var(--muted)]">Vendidas</p>
                <ShoppingCart size={20} strokeWidth={2} style={{ color: "var(--muted)" }} />
              </div>
              <div className="mt-4">
                <p className="text-[34px] sm:text-[42px] font-semibold leading-none tracking-[-0.02em]">
                  {sellThroughPct}%
                </p>
                <p className="text-[13px] text-[var(--muted)] mt-1.5">
                  {everSold.toLocaleString("es-AR")} de {emitted.toLocaleString("es-AR")} entradas
                </p>
              </div>
            </div>
          </section>

          {/* Barra de distribución */}
          <section className="card p-5 sm:p-6 space-y-4">
            <h2 className="text-[15px] font-semibold">Distribución del lote</h2>
            <InventoryBar
              available={available}
              soldActive={soldActive}
              validated={validated}
              total={emitted}
            />
          </section>

          {/* Stats detalladas */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard
              icon={<Ticket size={16} strokeWidth={2} />}
              label="Disponibles"
              value={available}
              tint="var(--brand)"
              soft="var(--brand-soft)"
            />
            <StatCard
              icon={<ShoppingCart size={16} strokeWidth={2} />}
              label="En manos"
              value={soldActive}
              tint="var(--success)"
              soft="var(--success-soft)"
            />
            <StatCard
              icon={<CheckCircle2 size={16} strokeWidth={2} />}
              label="Validadas"
              value={validated}
              tint="var(--muted)"
              soft="var(--surface-2)"
            />
            <StatCard
              icon={<Tag size={16} strokeWidth={2} />}
              label="En reventa"
              value={listed}
              tint="var(--warn)"
              soft="var(--warn-soft)"
            />
          </section>

          <p className="text-[12px] text-[var(--muted)] leading-relaxed">
            <strong>Disponibles</strong>: en stock, todavía tuyas · <strong>En manos</strong>: compradas, sin usar ·{" "}
            <strong>Validadas</strong>: ya escaneadas en puerta (estado terminal) · <strong>En reventa</strong>: listadas
            por asistentes para revender. Los conteos se leen del espejo on-chain.
          </p>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tint,
  soft,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tint: string;
  soft: string;
}) {
  return (
    <div className="card p-4">
      <div
        className="w-8 h-8 rounded-lg grid place-items-center mb-3"
        style={{ background: soft, color: tint }}
      >
        {icon}
      </div>
      <p className="text-[24px] sm:text-[28px] font-semibold leading-none tracking-[-0.02em]">
        {value.toLocaleString("es-AR")}
      </p>
      <p className="text-[12px] text-[var(--muted)] mt-1.5">{label}</p>
    </div>
  );
}
