// Helpers para upload directo a Cloudinary desde el browser usando un
// "unsigned upload preset". Ventajas:
// - El bytestream nunca pasa por nuestro server (menos carga, menos memoria).
// - No exponemos el API secret de Cloudinary; solo el cloud name + preset
//   público (que de por sí no permite operaciones destructivas).
//
// Setup en Cloudinary:
//   1) Registrarse y copiar el "cloud name" del dashboard.
//   2) Settings → Upload → Upload presets → Add → Signing mode: Unsigned.
//      Copiar el nombre del preset.
//   3) Setear NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME y
//      NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET en .env.
//
// Si no está configurado, la UI cae al input de URL manual como fallback.

export const CLOUDINARY_CLOUD_NAME =
  process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? "";

export const CLOUDINARY_UPLOAD_PRESET =
  process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? "";

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_UPLOAD_PRESET);
}

export interface CloudinaryUploadResult {
  secure_url: string;
  public_id: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export async function uploadToCloudinary(
  file: File,
  onProgress?: (pct: number) => void,
): Promise<CloudinaryUploadResult> {
  if (!isCloudinaryConfigured()) {
    throw new Error("Cloudinary no está configurado.");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);

  // Usamos XHR para soportar progreso (fetch todavía no expone progreso de upload).
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(
      "POST",
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`,
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Respuesta inválida de Cloudinary."));
        }
      } else {
        let msg = "Error al subir la imagen.";
        try {
          msg = JSON.parse(xhr.responseText)?.error?.message ?? msg;
        } catch {
          // ignore
        }
        reject(new Error(msg));
      }
    };
    xhr.onerror = () => reject(new Error("Error de red al subir la imagen."));
    xhr.send(formData);
  });
}

// Tamaño máximo aceptado del lado del cliente (10 MB).
// Cloudinary también tiene su propio límite según el plan.
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const ACCEPTED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];
