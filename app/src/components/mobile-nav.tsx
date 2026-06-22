"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string };

export function MobileNav({
  links,
  footer,
  user,
}: {
  links: NavLink[];
  footer?: React.ReactNode;
  user?: { email: string; role: string } | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label={open ? "Cerrar menú" : "Abrir menú"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`mn-trigger sm:hidden ${open ? "is-open" : ""}`}
      >
        <span className="mn-trigger__line" />
        <span className="mn-trigger__line" />
        <span className="sr-only">Menú</span>
      </button>

      {mounted && (
        <div
          className={`mn-portal sm:hidden ${open ? "is-open" : ""}`}
          aria-hidden={!open}
        >
          <button
            type="button"
            aria-label="Cerrar menú"
            className="mn-scrim"
            tabIndex={open ? 0 : -1}
            onClick={() => setOpen(false)}
          />

          <aside
            className="mn-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Navegación principal"
          >
            <div className="mn-grain" aria-hidden />

            <header className="mn-head">
              <span className="mn-eyebrow">
                <span className="mn-dot" /> Menú · Tesera
              </span>
              {user ? (
                <div className="mn-identity">
                  <span className="mn-identity__avatar" aria-hidden>
                    {user.email.charAt(0).toUpperCase()}
                  </span>
                  <span className="mn-identity__meta">
                    <span className="mn-identity__email">{user.email}</span>
                    <span className="mn-identity__role">
                      {user.role === "ORGANIZER" ? "organizador" : "asistente"}
                      <span className="mn-identity__sep">·</span>
                      <span className="mn-identity__chain">on-chain</span>
                    </span>
                  </span>
                </div>
              ) : (
                <div className="mn-identity mn-identity--guest">
                  <span className="mn-identity__avatar mn-identity__avatar--guest" aria-hidden>
                    ◇
                  </span>
                  <span className="mn-identity__meta">
                    <span className="mn-identity__email">Sin identidad</span>
                    <span className="mn-identity__role">
                      ingresá para firmar transacciones
                    </span>
                  </span>
                </div>
              )}
            </header>

            <nav className="mn-nav" aria-label="Secciones">
              {links.map((l, i) => {
                const active = pathname === l.href || (l.href !== "/" && pathname?.startsWith(l.href));
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`mn-link ${active ? "is-active" : ""}`}
                    style={{ ["--mn-i" as string]: String(i) }}
                  >
                    <span className="mn-link__num" aria-hidden>
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="mn-link__label">{l.label}</span>
                    <span className="mn-link__arrow" aria-hidden>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M7 17L17 7M17 7H9M17 7v8"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  </Link>
                );
              })}
            </nav>

            {footer && (
              <footer className="mn-foot">
                <span className="mn-foot__label">
                  {user ? "Sesión activa" : "Sin sesión"}
                </span>
                <div className="mn-foot__actions">{footer}</div>
              </footer>
            )}
          </aside>
        </div>
      )}
    </>
  );
}
