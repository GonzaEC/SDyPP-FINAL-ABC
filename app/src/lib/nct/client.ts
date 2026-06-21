import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";

// ============================================================================
// Tipos públicos
// ============================================================================

export interface MintBatchInput {
  eventId: string;
  organizerPublicKey: string;
  ticketCount: number;
  signedPayload: unknown;
  signature: string;
}

export type OpStatus = "PENDING" | "CONFIRMED" | "FAILED";

export interface OperationResult {
  opRef: string; // id de la operación (devuelto al cliente para tracking)
  status: OpStatus;
  acceptedAt: string;
  estimatedConfirmAt?: string;
  errorCode?: string;
  mock: boolean;
}

export interface TransferInput {
  ticketId: string;
  fromPublicKey: string;
  toPublicKey: string;
  reason: "purchase" | "validation" | "resale";
  signedPayload: unknown;
  signature: string;
}

export interface TicketOwnership {
  ticketId: string;
  eventId: string;
  ticketNumber: number;
  ownerPublicKey: string;
}

// ============================================================================
// Modo mock vs real
// ============================================================================

const NCT_URL = process.env.NCT_URL;

function isMockMode() {
  return !NCT_URL || NCT_URL === "mock";
}

function mockDelayMs(): number {
  const min = Number(process.env.NCT_MOCK_DELAY_MIN_MS ?? "1500");
  const max = Number(process.env.NCT_MOCK_DELAY_MAX_MS ?? "4500");
  if (Number.isNaN(min) || Number.isNaN(max) || max < min) return 2500;
  return Math.floor(min + Math.random() * (max - min));
}

function mockShouldFail(): boolean {
  const rate = Number(process.env.NCT_MOCK_FAILURE_RATE ?? "0");
  if (Number.isNaN(rate) || rate <= 0) return false;
  return Math.random() < rate;
}

// ============================================================================
// Submit: crean operación PENDING en el mock, o llaman al NCT real.
// ============================================================================

export async function submitMintBatch(input: MintBatchInput): Promise<OperationResult> {
  if (isMockMode()) {
    const scheduledConfirmAt = new Date(Date.now() + mockDelayMs());
    const op = await prisma.nctOperation.create({
      data: {
        type: "mint_batch",
        status: "PENDING",
        eventId: input.eventId,
        organizerPublicKey: input.organizerPublicKey,
        ticketCount: input.ticketCount,
        scheduledConfirmAt,
      },
    });
    console.log(
      `[NCT mock] Submit mint_batch event=${input.eventId} count=${input.ticketCount} op=${op.id} confirmAt=${scheduledConfirmAt.toISOString()}`,
    );
    return {
      opRef: op.id,
      status: "PENDING",
      acceptedAt: op.createdAt.toISOString(),
      estimatedConfirmAt: scheduledConfirmAt.toISOString(),
      mock: true,
    };
  }

  const res = await fetch(`${NCT_URL!.replace(/\/$/, "")}/transactions/mint`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`NCT mint failed: ${res.status}`);
  const body = (await res.json()) as { opRef?: string; batchRef?: string; status?: OpStatus; acceptedAt?: string };
  return {
    opRef: body.opRef ?? body.batchRef ?? "unknown",
    status: body.status ?? "PENDING",
    acceptedAt: body.acceptedAt ?? new Date().toISOString(),
    mock: false,
  };
}

export async function submitTransfer(input: TransferInput): Promise<OperationResult> {
  if (isMockMode()) {
    // Validación adelantada: el dueño actual debe coincidir (rechazo síncrono
    // antes de crear la op pending). Esto es lo que la BC real haría al recibir
    // la tx antes de minarla.
    const ticket = await prisma.ticket.findUnique({ where: { id: input.ticketId } });
    if (!ticket) throw new Error("ticket_not_found");
    if (ticket.ownerPublicKey !== input.fromPublicKey) {
      throw new Error("not_current_owner");
    }
    const scheduledConfirmAt = new Date(Date.now() + mockDelayMs());
    const op = await prisma.nctOperation.create({
      data: {
        type: "transfer",
        status: "PENDING",
        ticketId: input.ticketId,
        fromPublicKey: input.fromPublicKey,
        toPublicKey: input.toPublicKey,
        reason: input.reason,
        scheduledConfirmAt,
      },
    });
    console.log(
      `[NCT mock] Submit transfer ticket=${input.ticketId} reason=${input.reason} op=${op.id} confirmAt=${scheduledConfirmAt.toISOString()}`,
    );
    return {
      opRef: op.id,
      status: "PENDING",
      acceptedAt: op.createdAt.toISOString(),
      estimatedConfirmAt: scheduledConfirmAt.toISOString(),
      mock: true,
    };
  }

  const res = await fetch(`${NCT_URL!.replace(/\/$/, "")}/transactions/transfer`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`NCT transfer failed: ${res.status}`);
  const body = (await res.json()) as { opRef?: string; txRef?: string; status?: OpStatus; acceptedAt?: string };
  return {
    opRef: body.opRef ?? body.txRef ?? "unknown",
    status: body.status ?? "PENDING",
    acceptedAt: body.acceptedAt ?? new Date().toISOString(),
    mock: false,
  };
}

// ============================================================================
// Settlement lazy: cada lectura llama a settleDueOperations() para procesar
// las operaciones cuyo tiempo de "minado" ya pasó. Esto evita necesitar un
// worker / cron separado.
// ============================================================================

export async function settleDueOperations(): Promise<void> {
  if (!isMockMode()) return;
  const due = await prisma.nctOperation.findMany({
    where: { status: "PENDING", scheduledConfirmAt: { lte: new Date() } },
    orderBy: { scheduledConfirmAt: "asc" },
    take: 50, // safety: no procesar todo de una en requests grandes
  });
  for (const op of due) {
    await settleOne(op.id);
  }
}

async function settleOne(opId: string): Promise<void> {
  // Re-leemos con FOR UPDATE-style: si dos requests intentan settlear la misma
  // op a la vez, solo una debe ganar. Lo hacemos optimista: si el update
  // afecta 0 filas, otro la procesó primero.
  const op = await prisma.nctOperation.findUnique({ where: { id: opId } });
  if (!op || op.status !== "PENDING") return;

  // Lock optimista: solo procesa si sigue PENDING.
  const fail = mockShouldFail();
  try {
    if (fail) {
      const updated = await prisma.nctOperation.updateMany({
        where: { id: opId, status: "PENDING" },
        data: { status: "FAILED", failedAt: new Date(), errorCode: "mock_random_failure" },
      });
      if (updated.count === 0) return;
      // Si era un mint, devolver el evento a DRAFT así el organizador puede
      // reintentarlo. Si no, queda colgado en MINTING para siempre.
      if (op.type === "mint_batch" && op.eventId) {
        await prisma.event.updateMany({
          where: { id: op.eventId, status: "MINTING" },
          data: { status: "DRAFT", ncTBatchRef: null },
        });
      }
      console.log(`[NCT mock] Op ${opId} FAILED (random)`);
      return;
    }

    if (op.type === "mint_batch") {
      if (!op.eventId || !op.organizerPublicKey || !op.ticketCount) {
        await markFailed(opId, "invalid_mint_payload");
        return;
      }
      // Materializa los tickets.
      await prisma.$transaction(async (tx) => {
        await tx.ticket.createMany({
          data: Array.from({ length: op.ticketCount! }, (_, i) => ({
            eventId: op.eventId!,
            ticketNumber: i + 1,
            ownerPublicKey: op.organizerPublicKey!,
          })),
        });
        await tx.event.update({
          where: { id: op.eventId! },
          data: { status: "EMITTED", ncTBatchRef: op.id },
        });
        await tx.nctOperation.update({
          where: { id: opId },
          data: { status: "CONFIRMED", confirmedAt: new Date() },
        });
      });
      console.log(`[NCT mock] Op ${opId} CONFIRMED mint_batch event=${op.eventId}`);
      return;
    }

    if (op.type === "transfer") {
      if (!op.ticketId || !op.toPublicKey || !op.fromPublicKey) {
        await markFailed(opId, "invalid_transfer_payload");
        return;
      }
      // Re-chequear dueño: si entre el submit y ahora otra tx ya transfirió,
      // este transfer falla.
      const ticket = await prisma.ticket.findUnique({ where: { id: op.ticketId } });
      if (!ticket || ticket.ownerPublicKey !== op.fromPublicKey) {
        await markFailed(opId, "not_current_owner_at_settlement");
        return;
      }
      // Una transferencia con reason=validation deja la entrada en estado
      // terminal: vuelve al organizador pero ya no se puede revender (ADR-015).
      const isValidation = op.reason === "validation";
      const now = new Date();
      await prisma.$transaction(async (tx) => {
        await tx.ticket.update({
          where: { id: op.ticketId! },
          data: {
            ownerPublicKey: op.toPublicKey!,
            lastTransferAt: now,
            ...(isValidation ? { validatedAt: now } : {}),
          },
        });
        await tx.nctOperation.update({
          where: { id: opId },
          data: { status: "CONFIRMED", confirmedAt: now },
        });
      });
      console.log(`[NCT mock] Op ${opId} CONFIRMED transfer ticket=${op.ticketId}${isValidation ? " (validated)" : ""}`);
      return;
    }

    await markFailed(opId, "unknown_op_type");
  } catch (err) {
    console.error(`[NCT mock] Op ${opId} error:`, err);
    await markFailed(opId, "settlement_error");
  }
}

async function markFailed(opId: string, code: string) {
  const op = await prisma.nctOperation.findUnique({ where: { id: opId } });
  await prisma.nctOperation.updateMany({
    where: { id: opId, status: "PENDING" },
    data: { status: "FAILED", failedAt: new Date(), errorCode: code },
  });
  if (op?.type === "mint_batch" && op.eventId) {
    await prisma.event.updateMany({
      where: { id: op.eventId, status: "MINTING" },
      data: { status: "DRAFT", ncTBatchRef: null },
    });
  }
}

export async function getOperationStatus(opId: string): Promise<{
  status: OpStatus;
  errorCode?: string;
  confirmedAt?: string;
  failedAt?: string;
  estimatedConfirmAt?: string;
} | null> {
  if (isMockMode()) {
    await settleDueOperations();
    const op = await prisma.nctOperation.findUnique({ where: { id: opId } });
    if (!op) return null;
    return {
      status: op.status as OpStatus,
      errorCode: op.errorCode ?? undefined,
      confirmedAt: op.confirmedAt?.toISOString(),
      failedAt: op.failedAt?.toISOString(),
      estimatedConfirmAt: op.scheduledConfirmAt.toISOString(),
    };
  }
  const res = await fetch(`${NCT_URL!.replace(/\/$/, "")}/operations/${opId}`);
  if (!res.ok) return null;
  return (await res.json()) as {
    status: OpStatus;
    errorCode?: string;
    confirmedAt?: string;
    failedAt?: string;
  };
}

// ============================================================================
// Queries read-only sobre el estado on-chain.
// Llaman a settleDueOperations() primero para no devolver data atrasada.
// ============================================================================

export async function getTicketsByOwner(publicKey: string): Promise<TicketOwnership[]> {
  if (isMockMode()) {
    await settleDueOperations();
    const tickets = await prisma.ticket.findMany({
      where: { ownerPublicKey: publicKey },
      orderBy: [{ eventId: "asc" }, { ticketNumber: "asc" }],
    });
    return tickets.map((t) => ({
      ticketId: t.id,
      eventId: t.eventId,
      ticketNumber: t.ticketNumber,
      ownerPublicKey: t.ownerPublicKey,
    }));
  }
  throw new Error("not_implemented_for_real_nct");
}

export async function getTicketOwner(ticketId: string): Promise<string | null> {
  if (isMockMode()) {
    await settleDueOperations();
    const t = await prisma.ticket.findUnique({ where: { id: ticketId } });
    return t?.ownerPublicKey ?? null;
  }
  throw new Error("not_implemented_for_real_nct");
}

export async function getAvailableTicketsCount(eventId: string, organizerPublicKey: string): Promise<number> {
  if (isMockMode()) {
    await settleDueOperations();
  }
  // Excluye entradas ya validadas: aunque pertenezcan al organizador, no se
  // pueden volver a vender (ADR-015).
  return prisma.ticket.count({
    where: { eventId, ownerPublicKey: organizerPublicKey, validatedAt: null },
  });
}
