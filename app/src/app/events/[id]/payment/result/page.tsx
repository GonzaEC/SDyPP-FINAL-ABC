import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { PaymentResult } from "./payment-result";

export const dynamic = "force-dynamic";

// /events/[id]/payment/result?status=success&payment_id=xxx&external_reference=yyy
// MP redirige al comprador acá. Los query params son informativos — la fuente
// de verdad es el webhook. Esta página polea /api/payments/[id] para mostrar
// el estado real.
export default async function PaymentResultPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: eventId } = await params;
  const sp = await searchParams;
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const status = String(sp.status ?? "unknown");
  const externalReference = String(sp.external_reference ?? sp.paymentId ?? "");

  return (
    <div className="mx-auto max-w-xl w-full px-4 sm:px-6 py-12 sm:py-20">
      <PaymentResult
        eventId={eventId}
        paymentId={externalReference}
        mpRedirectStatus={status}
      />
    </div>
  );
}
