// Devuelve un display name para mostrar en UIs públicas.
// Preferimos el campo explícito; si no, usamos la parte antes del @ del email.
export function getDisplayName(user: { displayName: string | null; email: string }): string {
  if (user.displayName && user.displayName.trim()) return user.displayName.trim();
  const prefix = user.email.split("@")[0];
  return prefix || "Organizador";
}

// Iniciales para avatares (máximo 2 letras).
export function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
