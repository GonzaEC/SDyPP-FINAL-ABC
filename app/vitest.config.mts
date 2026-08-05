// Extensión .mts a propósito: el archivo usa sintaxis ESM (import/export), y con
// .ts Vite lo cargaba como CommonJS y avisaba que en una versión mayor futura ese
// modo dejaría de estar soportado. Con .mts se interpreta como ESM desde el vamos.
//
// Consecuencia del cambio: en ESM no existe __dirname. El equivalente es
// import.meta.dirname, disponible desde Node 20.11 — corremos 22 en Docker y 24 en
// desarrollo, así que está cubierto.
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
});
