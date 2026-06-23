"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { EventPassDeck } from "./event-pass-deck";

export interface EventGroupTicket {
  ticketId: string;
  ticketNumber: number;
  validatedAt: string | null;
  activeListing: { id: string; price: number } | null;
}

export interface EventGroup {
  event: {
    id: string;
    name: string;
    datetime: string;
    venue: string;
    imageUrl: string | null;
    price: number;
  };
  tickets: EventGroupTicket[];
  stats: { total: number; listed: number; validated: number };
}

interface Props {
  groups: EventGroup[];
  publicKey: string;
  defaultOpenEventId?: string;
}

const SEARCH_THRESHOLD = 5;

export function WalletView({ groups, publicKey, defaultOpenEventId }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const openFromUrl = searchParams.get("open");
  const openEventId = openFromUrl ?? defaultOpenEventId ?? null;

  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.event.name.toLowerCase().includes(q) ||
        g.event.venue.toLowerCase().includes(q),
    );
  }, [groups, query]);

  function toggle(eventId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (openEventId === eventId) {
      params.delete("open");
    } else {
      params.set("open", eventId);
    }
    const qs = params.toString();
    router.replace(qs ? `/my-tickets?${qs}` : "/my-tickets", { scroll: false });
  }

  return (
    <div className="space-y-6">
      {groups.length > SEARCH_THRESHOLD && (
        <div className="relative">
          <Search
            size={16}
            strokeWidth={2}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none z-10"
            style={{ color: "var(--muted)" }}
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar evento o lugar…"
            className="input"
            style={{ paddingLeft: 38 }}
            aria-label="Buscar en tu billetera"
          />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-[13px] text-[var(--muted)] text-center py-8">
          No hay eventos que coincidan con &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="space-y-7">
          {filtered.map((group, i) => (
            <li key={group.event.id} className={`rise rise-${Math.min(i + 1, 6)}`}>
              <EventPassDeck
                group={group}
                publicKey={publicKey}
                open={openEventId === group.event.id}
                onToggle={() => toggle(group.event.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
