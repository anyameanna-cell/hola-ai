export function BrushSpinner({ size = 112, label = "Painting your image" }: { size?: number; label?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" className="text-primary" role="img" aria-label={label}>
      {/* brush travels in a circle, but never draws one */}
      <g style={{ animation: "hola-brush-orbit 1.8s linear infinite", transformOrigin: "28px 28px" }}>
        <g transform="translate(28 6)">
          {/* bristles pointing toward the centre of the circle */}
          <path d="M0 8 L-3.2 2.5 L3.2 2.5 Z" fill="currentColor" />
          {/* ferrule */}
          <rect x="-3" y="-0.5" width="6" height="3" rx="1" fill="currentColor" opacity="0.7" />
          {/* handle */}
          <rect x="-1.8" y="-9" width="3.6" height="9" rx="1.8" fill="currentColor" opacity="0.45" />
        </g>
      </g>
    </svg>
  );
}
