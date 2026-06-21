import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";

const ProfileInput = z.object({
  displayName: z
    .string()
    .max(60, { message: "El nombre no puede tener más de 60 caracteres" })
    .transform((s) => s.trim())
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional(),
  bio: z
    .string()
    .max(500, { message: "La bio no puede tener más de 500 caracteres" })
    .transform((s) => s.trim())
    .transform((s) => (s.length === 0 ? null : s))
    .nullable()
    .optional(),
});

export async function PUT(req: Request) {
  const session = await getSession();
  if (!session.userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = ProfileInput.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", message: parsed.error.issues[0]?.message ?? "Datos inválidos" },
      { status: 400 },
    );
  }

  const updated = await prisma.user.update({
    where: { id: session.userId },
    data: {
      ...(parsed.data.displayName !== undefined ? { displayName: parsed.data.displayName } : {}),
      ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio } : {}),
    },
    select: { id: true, displayName: true, bio: true },
  });

  return NextResponse.json({ user: updated });
}
