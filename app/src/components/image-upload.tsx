"use client";

import { useRef, useState } from "react";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_BYTES,
  isCloudinaryConfigured,
  uploadToCloudinary,
} from "@/lib/cloudinary";

interface Props {
  value: string;
  onChange: (url: string) => void;
}

// Componente dual: si Cloudinary está configurado, ofrece upload directo
// (drag & drop + click). Si no, cae a input de URL manual como fallback,
// así seguimos funcionando para el dev que no quiere setear Cloudinary.
export function ImageUpload({ value, onChange }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [mode, setMode] = useState<"upload" | "url">("upload");

  const configured = isCloudinaryConfigured();

  async function handleFile(file: File) {
    setError(null);
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError("Formato no soportado. Usá JPG, PNG, WEBP o GIF.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError(`La imagen pesa demasiado (máx ${MAX_IMAGE_BYTES / 1024 / 1024} MB).`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadToCloudinary(file, setProgress);
      onChange(result.secure_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al subir.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function handleSelectClick() {
    fileRef.current?.click();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  if (!configured && mode === "upload") {
    // Sin Cloudinary configurado, mostramos un cartel y caemos a URL manual.
    return (
      <div className="space-y-3">
        <div
          className="rounded-[var(--radius-sm)] px-4 py-3 text-[12.5px] flex items-start gap-2.5"
          style={{ background: "var(--surface)", color: "var(--muted)" }}
        >
          <ImageIcon size={16} className="flex-shrink-0 mt-0.5" />
          <span>
            El upload directo no está configurado.{" "}
            <button
              type="button"
              onClick={() => setMode("url")}
              className="underline"
              style={{ color: "var(--brand)" }}
            >
              Pegar una URL en su lugar
            </button>
          </span>
        </div>
      </div>
    );
  }

  if (mode === "url") {
    return (
      <div className="space-y-2">
        <input
          type="url"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input"
          placeholder="https://…"
        />
        {configured && (
          <button
            type="button"
            onClick={() => setMode("upload")}
            className="text-[12px] underline"
            style={{ color: "var(--brand)" }}
          >
            ← Volver a subir un archivo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <input
        ref={fileRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          // Reset para permitir re-seleccionar el mismo archivo.
          e.target.value = "";
        }}
      />

      {value ? (
        <div
          className="relative rounded-[var(--radius-sm)] overflow-hidden border border-[var(--line)]"
          style={{ aspectRatio: "16 / 9" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Vista previa"
            className="w-full h-full object-cover"
            onError={() => setError("No se pudo cargar la imagen.")}
          />
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              type="button"
              onClick={handleSelectClick}
              disabled={uploading}
              className="px-2.5 py-1 rounded-md text-[12px] font-medium bg-white/95 text-[var(--ink)] hover:bg-white shadow-sm"
            >
              Cambiar
            </button>
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={uploading}
              className="w-7 h-7 grid place-items-center rounded-md bg-white/95 text-[var(--danger)] hover:bg-white shadow-sm"
              aria-label="Quitar imagen"
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </div>
        </div>
      ) : (
        <div
          onClick={handleSelectClick}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className="rounded-[var(--radius-sm)] border-2 border-dashed cursor-pointer transition-colors px-5 py-8 sm:py-10 text-center"
          style={{
            borderColor: dragOver ? "var(--brand)" : "var(--line)",
            background: dragOver ? "var(--brand-soft)" : "transparent",
          }}
        >
          {uploading ? (
            <div className="space-y-3">
              <Loader2
                size={28}
                strokeWidth={2}
                className="mx-auto animate-spin"
                style={{ color: "var(--brand)" }}
              />
              <p className="text-[13px] text-[var(--muted)]">Subiendo… {progress}%</p>
              <div className="w-full h-1 rounded-full overflow-hidden" style={{ background: "var(--line)" }}>
                <div
                  className="h-full transition-all duration-150"
                  style={{ background: "var(--brand)", width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload size={22} strokeWidth={1.8} className="mx-auto" style={{ color: "var(--muted)" }} />
              <p className="text-[13.5px] font-medium">
                Arrastrá una imagen o <span style={{ color: "var(--brand)" }}>elegí un archivo</span>
              </p>
              <p className="text-[11.5px] text-[var(--muted)]">
                JPG, PNG, WEBP o GIF · hasta {MAX_IMAGE_BYTES / 1024 / 1024} MB
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <p className="text-[12px] text-[var(--danger)]">{error}</p>
      )}

      {!uploading && (
        <button
          type="button"
          onClick={() => setMode("url")}
          className="text-[11.5px] underline"
          style={{ color: "var(--muted)" }}
        >
          O pegar una URL existente
        </button>
      )}
    </div>
  );
}
