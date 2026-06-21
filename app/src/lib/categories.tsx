import {
  Music,
  Trophy,
  Mic,
  Drama,
  PartyPopper,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

// Categorías de eventos. Lista cerrada (enum-like en código, String en DB
// para no atarnos a una enum de Postgres y poder cambiar la lista sin migrar).
export interface Category {
  value: string;
  label: string;
  Icon: LucideIcon;
}

export const CATEGORIES: readonly Category[] = [
  { value: "MUSIC", label: "Música", Icon: Music },
  { value: "SPORTS", label: "Deportes", Icon: Trophy },
  { value: "CONFERENCE", label: "Conferencia", Icon: Mic },
  { value: "THEATER", label: "Teatro", Icon: Drama },
  { value: "FESTIVAL", label: "Festival", Icon: PartyPopper },
  { value: "OTHER", label: "Otro", Icon: Sparkles },
] as const;

export type CategoryValue = (typeof CATEGORIES)[number]["value"];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as readonly CategoryValue[];

export function getCategory(value: string): Category {
  return CATEGORIES.find((c) => c.value === value) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function getCategoryLabel(value: string): string {
  return getCategory(value).label;
}

export function getCategoryIcon(value: string): LucideIcon {
  return getCategory(value).Icon;
}

export function isValidCategory(value: string): value is CategoryValue {
  return CATEGORY_VALUES.includes(value as CategoryValue);
}
