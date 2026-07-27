// Formateo de fechas SIEMPRE en horario de Argentina.
//
// Por qué existe: las fechas de eventos se guardan en UTC (un `19:00` ART se
// persiste como `22:00Z`). Las páginas son Server Components y el contenedor de
// Next corre en UTC, así que un `toLocaleTimeString("es-AR")` SIN timeZone
// renderiza la hora UTC (22:00) en vez de la local (19:00). Pasar `timeZone`
// explícito lo resuelve de raíz, sin depender del TZ del contenedor (Intl usa
// la base de zonas horarias de ICU, siempre presente en Node).
//
// Usar estos helpers en lugar de `.toLocaleDateString/.toLocaleTimeString("es-AR", …)`
// sueltos para que todo el sitio muestre la misma zona.
export const AR_TZ = "America/Argentina/Buenos_Aires";

export function fmtDate(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleDateString("es-AR", { timeZone: AR_TZ, ...opts });
}

export function fmtTime(d: Date, opts: Intl.DateTimeFormatOptions): string {
  return d.toLocaleTimeString("es-AR", { timeZone: AR_TZ, ...opts });
}

// Devuelve "YYYY-MM-DDTHH:mm" en hora de Argentina, para precargar un
// <input type="datetime-local"> (que no maneja zonas). Extrae los componentes
// vía Intl en AR_TZ, así no importa en qué zona corra el server.
export function toDatetimeLocalAR(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AR_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
