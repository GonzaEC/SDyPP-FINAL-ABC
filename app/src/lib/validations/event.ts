import { z } from "zod";
import { CATEGORY_VALUES } from "@/lib/categories";

// Schema compartido entre crear y editar eventos.
// Mensajes en español para que el cliente pueda mostrarlos directo.

const trimmedString = (min: number, max: number, label: string) =>
  z
    .string()
    .transform((s) => s.trim())
    .refine((s) => s.length >= min, { message: `${label} no puede estar vacío` })
    .refine((s) => s.length <= max, { message: `${label} no puede tener más de ${max} caracteres` });

export const EventInput = z.object({
  name: trimmedString(1, 120, "El nombre"),
  description: z
    .string()
    .max(2000, { message: "La descripción no puede tener más de 2000 caracteres" })
    .default("")
    .transform((s) => s.trim()),
  datetime: z
    .string()
    .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Fecha inválida" })
    .refine((v) => Date.parse(v) > Date.now(), { message: "La fecha tiene que ser futura" }),
  venue: trimmedString(1, 200, "El lugar"),
  imageUrl: z
    .union([z.string().url({ message: "La URL de la imagen no es válida" }), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  price: z
    .number({ message: "El precio debe ser un número" })
    .nonnegative({ message: "El precio no puede ser negativo" })
    .max(10_000_000, { message: "El precio es absurdamente alto" }),
  ticketCount: z
    .number({ message: "La cantidad de entradas debe ser un número" })
    .int({ message: "La cantidad debe ser entera" })
    .positive({ message: "Tenés que emitir al menos una entrada" })
    .max(100_000, { message: "Máximo 100.000 entradas por evento" }),
  category: z
    .enum(CATEGORY_VALUES as unknown as [string, ...string[]], {
      message: "Categoría inválida",
    })
    .default("OTHER"),
});

export type EventInputData = z.infer<typeof EventInput>;

// Formatea los errores de Zod en un mensaje plano para mostrarle al usuario.
export function formatZodError(err: z.ZodError): string {
  const issues = err.issues;
  if (issues.length === 0) return "Datos inválidos.";
  // Devolver el primer mensaje (UX directa), pero podríamos juntarlos todos.
  return issues[0].message;
}
