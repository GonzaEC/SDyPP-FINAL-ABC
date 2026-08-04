import { defineConfig, devices } from "@playwright/test";

// Tests E2E corren contra el Docker ya levantado en localhost:3000.
// Asumimos que la app está corriendo (no levantamos webServer acá para
// evitar conflictos con el container).
//
// Uso (el compose vive en la raíz del repo, un nivel arriba de acá):
//   docker compose up -d --build
//   npm run test:e2e
//
// Cada test usa emails random tipo `test-{uuid}@e2e.test` para no chocar
// con datos de dev. La DB no se limpia entre tests — la basura queda.
// Para limpiar, `docker compose down -v` desde la raíz (borra los volúmenes de
// postgres y redis, o sea también la blockchain).

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // serial para evitar race conditions en la BC mock
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
