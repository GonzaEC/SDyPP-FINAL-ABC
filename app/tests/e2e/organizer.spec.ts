import { test, expect, type Page } from "@playwright/test";
import {
  makeCreds,
  registerUser,
  createDraftEvent,
  futureDatetimeLocal,
} from "./helpers";

// Helper local: si aparece el modal de desbloqueo (porque la página se
// recargó y se perdió la clave de memoria), lo completamos con la password.
async function unlockIfPrompted(page: Page, password: string) {
  const modal = page.getByRole("heading", { name: /desbloquear tu clave/i });
  if (await modal.isVisible({ timeout: 500 }).catch(() => false)) {
    await page.getByLabel(/contraseña/i).fill(password);
    await page.getByRole("button", { name: /^desbloquear$/i }).click();
    await expect(modal).toBeHidden({ timeout: 5_000 });
  }
}

test.describe("Flujo del organizador", () => {
  test("crea un evento DRAFT, lo edita y aparece con datos nuevos", async ({ page }) => {
    const creds = makeCreds("org-edit");
    await registerUser(page, { ...creds, role: "ORGANIZER" });

    const eventName = `Festival E2E ${Date.now()}`;
    await createDraftEvent(page, {
      name: eventName,
      description: "Evento de prueba E2E",
      venue: "Sala Test",
      price: 500,
      ticketCount: 10,
    });

    await expect(page.getByText(eventName).first()).toBeVisible();

    // Editar — el link "Editar" está en la card del evento.
    const eventCard = page.locator("li", { has: page.getByText(eventName, { exact: true }) }).first();
    await eventCard.getByRole("link", { name: /^editar$/i }).click();
    await page.waitForURL(/\/dashboard\/events\/.+\/edit/);

    const newName = `${eventName} (editado)`;
    await page.getByLabel(/nombre/i).fill(newName);
    await page.getByRole("button", { name: /guardar cambios/i }).click();
    await page.waitForURL(/\/dashboard$/);

    await expect(page.getByText(newName).first()).toBeVisible();
  });

  test("emite un evento y pasa a EMITTED", async ({ page }) => {
    const creds = makeCreds("org-emit");
    await registerUser(page, { ...creds, role: "ORGANIZER" });

    const eventName = `Mint E2E ${Date.now()}`;
    await createDraftEvent(page, {
      name: eventName,
      venue: "Estadio",
      price: 1000,
      ticketCount: 3,
    });

    // El botón Emitir está inline en la card. La clave debería estar
    // todavía desbloqueada en memoria desde el registro.
    const card = page.locator("li", { has: page.getByText(eventName, { exact: true }) }).first();
    await card.getByRole("button", { name: /^emitir$/i }).click();
    await unlockIfPrompted(page, creds.password);

    // Esperar que el badge pase a Emitido (mock tarda 1.5-4.5s, dejamos 20s).
    await expect(card.getByText(/^emitido$/i)).toBeVisible({ timeout: 20_000 });
  });

  test("no se puede crear evento con fecha pasada", async ({ page }) => {
    const creds = makeCreds("org-past");
    await registerUser(page, { ...creds, role: "ORGANIZER" });

    await page.goto("/dashboard/events/new");
    await page.getByLabel(/nombre/i).fill("Evento en el pasado");
    await page.getByLabel(/fecha y hora/i).fill(futureDatetimeLocal(-7));
    await page.getByLabel(/lugar/i).fill("Nowhere");
    await page.getByLabel(/precio/i).fill("100");
    await page.getByLabel(/cantidad/i).fill("5");
    await page.getByRole("button", { name: /crear evento/i }).click();

    // Debe seguir en /new sin redirigir.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/dashboard\/events\/new/);
  });

  test("editor de perfil guarda displayName y se ve en página pública", async ({ page }) => {
    const creds = makeCreds("org-profile");
    await registerUser(page, { ...creds, role: "ORGANIZER" });

    await page.goto("/dashboard/profile");
    const displayName = `Gonzalo E2E ${Date.now()}`;
    await page.getByLabel(/nombre público/i).fill(displayName);
    await page.getByLabel(/bio/i).fill("Bio de prueba E2E");
    await page.getByRole("button", { name: /guardar cambios/i }).click();

    await expect(page.getByText(/perfil actualizado/i)).toBeVisible({ timeout: 5_000 });

    // El link "Ver mi página pública" tiene el id del organizador.
    const publicLink = page.getByRole("link", { name: /ver mi página pública/i });
    const href = await publicLink.getAttribute("href");
    expect(href).toMatch(/\/organizers\/.+/);
    await page.goto(href!);
    await expect(page.getByRole("heading", { name: displayName })).toBeVisible();
    await expect(page.getByText("Bio de prueba E2E")).toBeVisible();
  });
});
