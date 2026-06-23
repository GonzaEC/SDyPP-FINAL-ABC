import type { Metadata } from "next";
import { DM_Sans, JetBrains_Mono } from "next/font/google";
import Link from "next/link";
import { getSession } from "@/lib/session";
import { HeaderActions } from "@/components/header-actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Logo } from "@/components/logo";
import { MobileNav } from "@/components/mobile-nav";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});
const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://tesera.tech"),
  title: "Tesera · Entradas en blockchain",
  description: "Cada entrada, una tesera única en la cadena. Imposible de duplicar.",
};

const themeBootstrap = `
(function(){try{
  var t=localStorage.getItem('tesera-theme');
  if(t!=='dark'&&t!=='light'){t='light';}
  document.documentElement.setAttribute('data-theme',t);
}catch(e){document.documentElement.setAttribute('data-theme','light');}
})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const user = session.userId
    ? { email: session.email ?? "", role: (session.role ?? "ATTENDEE") as "ATTENDEE" | "ORGANIZER" }
    : null;

  const navLinks = [
    { href: "/events", label: "Eventos" },
    { href: "/panel", label: "Blockchain" },
    ...(user?.role === "ORGANIZER"
      ? [
          { href: "/dashboard", label: "Panel" },
          { href: "/scan", label: "Validar" },
        ]
      : []),
    ...(user ? [{ href: "/my-tickets", label: "Mis entradas" }] : []),
  ];

  return (
    <html
      lang="es"
      className={`${dmSans.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrap }} />
      </head>
      <body className="min-h-full flex flex-col">
        <header className="site-header sticky top-0 z-30 backdrop-blur-xl bg-[color-mix(in_srgb,var(--bg)_82%,transparent)] border-b border-[var(--line)]">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
            <Link href="/" className="flex-shrink-0">
              <Logo />
            </Link>

            <nav className="hidden sm:flex items-center gap-0.5 sm:gap-1 text-[14px]">
              {navLinks.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="inline-flex items-center h-9 px-3 rounded-full text-[var(--ink-2)] hover:bg-[var(--surface)] transition-colors"
                >
                  {l.label}
                </Link>
              ))}
            </nav>

            <div className="hidden sm:flex items-center gap-0.5">
              <ThemeToggle />
              <HeaderActions user={user} />
            </div>

            <div className="flex sm:hidden items-center gap-1">
              <ThemeToggle />
              <MobileNav
                links={navLinks}
                user={user}
                footer={<HeaderActions user={user} />}
              />
            </div>
          </div>
          <span aria-hidden className="site-header__hair" />
        </header>

        <main className="flex-1 flex flex-col">{children}</main>

        <footer className="border-t border-[var(--line)] mt-16 sm:mt-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-10 sm:py-12 grid sm:grid-cols-2 gap-8 items-start">
            <div>
              <Logo size="sm" className="gap-2.5" />
              <p className="text-[14px] text-[var(--muted)] mt-3 max-w-sm">
                Cada entrada, una tesera única en la cadena. Capa web del TP de Sistemas Distribuidos.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-12 gap-y-6 justify-start sm:justify-end text-[13px]">
              <div>
                <p className="font-semibold text-[var(--ink)] mb-2">Producto</p>
                <ul className="space-y-1.5 text-[var(--muted)]">
                  <li><Link href="/events" className="hover:text-[var(--ink)] transition-colors">Eventos</Link></li>
                  <li><Link href="/register" className="hover:text-[var(--ink)] transition-colors">Crear cuenta</Link></li>
                  <li><Link href="/login" className="hover:text-[var(--ink)] transition-colors">Ingresar</Link></li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-[var(--ink)] mb-2">Explorar</p>
                <ul className="space-y-1.5 text-[var(--muted)]">
                  <li><Link href="/my-tickets" className="hover:text-[var(--ink)] transition-colors">Mis pases</Link></li>
                  <li><Link href="/scan" className="hover:text-[var(--ink)] transition-colors">Validar entrada</Link></li>
                  <li><Link href="/panel" className="hover:text-[var(--ink)] transition-colors">Panel de la cadena</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div className="border-t border-[var(--line)]">
            <div className="mx-auto max-w-6xl px-4 sm:px-6 h-12 flex items-center justify-between text-[11px] sm:text-[12px] text-[var(--muted)]">
              <span>SDyPP · 2026</span>
              <span>© Tesera · tesera.tech</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
