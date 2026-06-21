import { test, expect } from "@playwright/test";
import { makeCreds, registerUser, loginUser } from "./helpers";

test.describe("Autenticación", () => {
  test("registro de asistente → redirige a /events", async ({ page }) => {
    const creds = makeCreds("attendee");
    await registerUser(page, { ...creds, role: "ATTENDEE" });
    await expect(page).toHaveURL(/\/events/);
  });

  test("registro de organizador → redirige a /dashboard", async ({ page }) => {
    const creds = makeCreds("org");
    await registerUser(page, { ...creds, role: "ORGANIZER" });
    await expect(page).toHaveURL(/\/dashboard/);
    // El header debería mostrar "Tus eventos" (hay h1 y h2 — apuntamos al h1).
    await expect(page.getByRole("heading", { level: 1, name: /tus eventos/i })).toBeVisible();
  });

  test("registro + logout + login con la misma contraseña funciona", async ({ page }) => {
    const creds = makeCreds("roundtrip");
    await registerUser(page, { ...creds, role: "ORGANIZER" });

    // Logout — el botón está en el header como "Salir".
    await page.getByRole("button", { name: /salir/i }).click();
    await page.waitForURL(/\/(login|$)/);

    // Login con las mismas credenciales — verifica que la clave privada
    // se puede descifrar de nuevo (custodia híbrida funcionando).
    await loginUser(page, creds);
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("login con password incorrecta muestra error", async ({ page }) => {
    const creds = makeCreds("badpass");
    await registerUser(page, { ...creds, role: "ATTENDEE" });

    await page.getByRole("button", { name: /salir/i }).click();
    await page.waitForURL(/\/(login|$)/);

    await page.goto("/login");
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/contraseña/i).fill("password-incorrecta-xyz");
    await page.getByRole("button", { name: /^ingresar$/i }).click();

    // Debe seguir en /login con un mensaje de error visible.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("text=/invalid|incorrect|invál|incorrect|error|falló/i").first()).toBeVisible({
      timeout: 5_000,
    });
  });

  test("no se puede registrar el mismo email dos veces", async ({ page }) => {
    const creds = makeCreds("dup");
    await registerUser(page, { ...creds, role: "ATTENDEE" });

    await page.getByRole("button", { name: /salir/i }).click();
    await page.waitForURL(/\/(login|$)/);

    await page.goto("/register");
    await page.getByLabel(/email/i).fill(creds.email);
    await page.getByLabel(/contraseña/i).fill(creds.password);
    await page.getByRole("button", { name: /^crear cuenta$/i }).click();

    // Debe quedarse en /register mostrando error.
    await expect(page).toHaveURL(/\/register/);
  });
});
