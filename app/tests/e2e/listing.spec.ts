import { test, expect } from "@playwright/test";

test.describe("Listado público de eventos", () => {
  test("la página de cartelera carga", async ({ page }) => {
    await page.goto("/events");
    await expect(page.getByRole("heading", { name: /próximos eventos/i })).toBeVisible();
    // El input de búsqueda y el select de categoría deben estar visibles.
    await expect(page.getByPlaceholder(/buscar/i)).toBeVisible();
    await expect(page.getByLabel(/filtrar por categoría/i)).toBeVisible();
  });

  test("filtro por categoría actualiza la URL", async ({ page }) => {
    await page.goto("/events");
    await page.getByLabel(/filtrar por categoría/i).selectOption("SPORTS");
    await expect(page).toHaveURL(/category=SPORTS/, { timeout: 3_000 });

    // El botón "Limpiar" debe aparecer y limpiar la URL.
    await page.getByRole("button", { name: /limpiar/i }).click();
    await expect(page).toHaveURL(/\/events$/, { timeout: 3_000 });
  });

  test("búsqueda con texto que no existe muestra empty state", async ({ page }) => {
    await page.goto("/events");
    await page.getByPlaceholder(/buscar/i).fill(`xyzzy-no-existe-${Date.now()}`);
    await expect(page.getByRole("heading", { name: /sin resultados/i })).toBeVisible({
      timeout: 3_000,
    });
  });
});
