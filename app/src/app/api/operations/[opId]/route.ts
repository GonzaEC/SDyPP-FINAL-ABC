import { NextResponse } from "next/server";
import { getOperationStatus } from "@/lib/nct/client";

// GET /api/operations/{opId} — devuelve el estado actual de una operación
// del NCT. Usado por la UI para hacer polling mientras está PENDING.
// El propio handler dispara settleDueOperations() vía getOperationStatus.
export async function GET(_req: Request, { params }: { params: Promise<{ opId: string }> }) {
  const { opId } = await params;
  const op = await getOperationStatus(opId);
  if (!op) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(op);
}
