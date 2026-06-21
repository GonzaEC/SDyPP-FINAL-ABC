import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

// Devuelve el blob cifrado de la clave privada del usuario logueado.
// El navegador lo descifra localmente con la password — el server nunca ve el claro.
// Se usa para re-desbloquear la clave después de un refresh sin pedir relogin completo.
export async function GET() {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { encryptedPrivateKey: true, kdfSalt: true, kdfIv: true, publicKey: true },
  });
  if (!user) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json(user);
}
