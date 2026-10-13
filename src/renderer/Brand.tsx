/** The gold diamond from the app icon, without the icon's dark tile. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="40 32 176 192" aria-hidden="true">
      <defs>
        <linearGradient id="logo-gold" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3cf7a" />
          <stop offset="1" stopColor="#b07a22" />
        </linearGradient>
      </defs>
      <path d="M128 36 L212 128 L128 220 L44 128 Z" fill="url(#logo-gold)" />
      <path d="M128 36 L212 128 L128 128 Z" fill="#fff" opacity="0.18" />
      <path d="M128 76 L164 128 L128 180 L92 128 Z" fill="#14110f" opacity="0.28" />
    </svg>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <div className={`brand ${className}`.trim()}>
      <Logo />
      <div>
        <div className="brand-name">Forever Addons</div>
        <div className="brand-sub">WoW Forever</div>
      </div>
    </div>
  );
}
