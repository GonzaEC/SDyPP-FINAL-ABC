import { defineConfig, devices } from "@playwright/test";

// Tests E2E corren contra el Docker ya levantado en localhost:3000.
// Asumimos que la app está corriendo (no levantamos webServer acá para
// evitar conflictos con el container).
//
// Uso:
//   docker compose up -d
//   npm run test:e2e
//
// Cada test usa emails random tipo `test-{uuid}@e2e.test` para no chocar
// con datos de dev. La DB no se limpia entre tests — la basura queda.
// Para limpiar, hacer `docker compose down -v` (borra el volumen de postgres).

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
