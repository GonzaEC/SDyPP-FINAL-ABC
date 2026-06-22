type LogoProps = {
  size?: "sm" | "md";
  withWordmark?: boolean;
  className?: string;
};

const SIZES: Record<NonNullable<LogoProps["size"]>, { box: number; text: string }> = {
  sm: { box: 24, text: "text-[15px]" },
  md: { box: 28, text: "text-[17px] sm:text-[18px]" },
};

export function Logo({ size = "md", withWordmark = true, className }: LogoProps) {
  const s = SIZES[size];
  return (
    <span className={`flex items-center gap-2.5 group ${className ?? ""}`}>
      <span
        aria-hidden
        className="tesera-mark inline-grid place-items-center flex-shrink-0"
        style={{ width: s.box, height: s.box }}
      >
        <svg
          width={s.box}
          height={s.box}
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="tesera-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0a3aff" />
              <stop offset="60%" stopColor="#0066ff" />
              <stop offset="100%" stopColor="#4d8bff" />
            </linearGradient>
          </defs>
          {/* Tessera base — rounded square */}
          <rect x="0" y="0" width="32" height="32" rx="8" fill="url(#tesera-bg)" />
          {/* Mosaic split: 2x2 grid of inner tiles, one highlighted */}
          <g>
            <rect x="6" y="6" width="9" height="9" rx="1.6" fill="#fff" fillOpacity="0.92" />
            <rect x="17" y="6" width="9" height="9" rx="1.6" fill="#fff" fillOpacity="0.32" />
            <rect x="6" y="17" width="9" height="9" rx="1.6" fill="#fff" fillOpacity="0.32" />
            <rect x="17" y="17" width="9" height="9" rx="1.6" fill="#fff" fillOpacity="0.92" />
          </g>
          {/* Inner highlight */}
          <rect
            x="0.5"
            y="0.5"
            width="31"
            height="31"
            rx="7.5"
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth="1"
          />
        </svg>
      </span>
      {withWordmark && (
        <span
          className={`tesera-wordmark font-semibold ${s.text}`}
        >
          Tesera
        </span>
      )}
    </span>
  );
}
