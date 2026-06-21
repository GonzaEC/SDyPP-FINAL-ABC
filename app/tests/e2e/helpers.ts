import { type Page, expect } from "@playwright/test";

// Genera un email y password únicos para evitar colisiones entre runs.
// Email tipo `e2e-1737481234567-ab3xy@e2e.test`.
export function makeCreds(prefix = "e2e") {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    email: `${prefix}-${id}@e2e.test`,
    password: "Test1234!Test1234!", // cumple requisitos comunes de password
  };
}

// Registro completo desde /register. Asume que el form usa los labels/inputs
// estándar de la app. Termina logueado (sesión activa).
export async function registerUser(
  page: Page,
  opts: { email: string; password: string; role?: "ORGANIZER" | "ATTENDEE" },
) {
  await page.goto("/register");
  // El tipo de cuenta son dos botones, no un radio. ATTENDEE es el default.
  // El nombre accesible del botón incluye el subtítulo ("Creás eventos…"),
  // así que matcheamos por substring en vez de exact.
  if (opts.role === "ORGANIZER") {
    await page.getByRole("button", { name: /organizador/i }).click();
  }
  await page.getByLabel(/email/i).fill(opts.email);
  await page.getByLabel(/contraseña/i).fill(opts.password);
  await page.getByRole("button", { name: /^crear cuenta$/i }).click();
  // Tras registrar: ORGANIZER → /dashboard, ATTENDEE → /events.
  await page.waitForURL(/\/(dashboard|events)/, { timeout: 20_000 });
}

// Login desde /login. Termina logueado.
export async function loginUser(
  page: Page,
  opts: { email: string; password: string },
) {
  await page.goto("/login");
  await page.getByLabel(/email/i).fill(opts.email);
  await page.getByLabel(/contraseña/i).fill(opts.password);
  await page.getByRole("button", { name: /^ingresar$/i }).click();
  await page.waitForURL(/\/(dashboard|events)/, { timeout: 20_000 });
}

// Crea un evento DRAFT desde /dashboard/events/new. Devuelve el id del evento
// extraído de la URL final (que es /dashboard).
export interface CreateEventInput {
  name: string;
  description?: string;
  // Datetime futuro en formato datetime-local "YYYY-MM-DDTHH:mm".
  // Si no se pasa, se genera +7 días.
  datetime?: string;
  venue?: string;
  price?: number;
  ticketCount?: number;
  category?: string;
}

export async function createDraftEvent(page: Page, input: CreateEventInput) {
  await page.goto("/dashboard/events/new");
  await page.getByLabel(/nombre/i).fill(input.name);
  if (input.description) {
    await page.getByLabel(/descripción/i).fill(input.description);
  }
  await page.getByLabel(/fecha y hora/i).fill(input.datetime ?? futureDatetimeLocal(7));
  await page.getByLabel(/lugar/i).fill(input.venue ?? "Sala de pruebas");
  await page.getByLabel(/precio/i).fill(String(input.price ?? 100));
  await page.getByLabel(/cantidad de entradas/i).fill(String(input.ticketCount ?? 5));
  if (input.category) {
    await page.getByLabel(/categoría/i).selectOption(input.category);
  }
  await page.getByRole("button", { name: /crear evento|guardar cambios/i }).click();
  await page.waitForURL(/\/dashboard$/, { timeout: 15_000 });
}

// "YYYY-MM-DDTHH:mm" para un input datetime-local, offset en días desde hoy.
export function futureDatetimeLocal(daysAhead: number, hour = 20, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

// Espera a que un evento aparezca con badge On-chain (EMITTED). Polling
// suave porque la confirmación on-chain mock tarda 1.5-4.5s.
export async function waitForEventEmitted(page: Page, eventName: string, maxMs = 15_000) {
  const card = page.locator("li", { has: page.getByText(eventName, { exact: true }) }).first();
  await expect(card).toBeVisible({ timeout: 5_000 });
  await expect(card.getByText(/on-chain|emitido/i).first()).toBeVisible({ timeout: maxMs });
}
