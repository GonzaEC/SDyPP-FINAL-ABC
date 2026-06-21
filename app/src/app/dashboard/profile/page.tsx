import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await getSession();
  if (!session.userId) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, displayName: true, bio: true, publicKey: true },
  });
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-3xl w-full px-4 sm:px-6 py-10 sm:py-14">
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 text-[13px] sm:text-[14px] text-[var(--muted)] hover:text-[var(--ink)] transition-colors mb-5 sm:mb-6"
      >
        <ArrowLeft size={14} strokeWidth={2} />
        Volver al panel
      </Link>

      <header className="mb-6 sm:mb-8 space-y-2">
        <p className="eyebrow">Tu perfil</p>
        <h1 className="text-[30px] sm:text-[40px] lg:text-[44px] leading-[1.05] tracking-[-0.025em] font-semibold">
          Cómo te ven los asistentes
        </h1>
        <p className="text-[14px] sm:text-[15px] text-[var(--muted)] max-w-xl">
          Tu nombre y bio aparecen en cada uno de tus eventos y en tu página pública.
        </p>
      </header>

      <ProfileForm
        initial={{
          displayName: user.displayName ?? "",
          bio: user.bio ?? "",
        }}
        organizerId={user.id}
      />
    </div>
  );
}
