export function BrushSpinner({ size = 112, label = "Painting your image" }: { size?: number; label?: string }) {
  // A single brush stroke that draws itself, then erases itself — over and over.
  const D = "M8 40 C 18 12, 38 12, 48 40";
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" className="text-primary" role="img" aria-label={label}>
      <path
        d={D}
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="100 100"
        style={{ animation: "hola-stroke-draw-erase 2.2s ease-in-out infinite" }}
      />
      {/* brush riding the stroke while it draws */}
      <g style={{ animation: "hola-brush-fade 2.2s ease-in-out infinite" }}>
        <g transform="translate(-2.5 -14)">
          <path d="M2.5 22 L0 16 L5 16 Z" fill="currentColor" />
          <rect x="0.4" y="13" width="4.2" height="3" rx="1" fill="currentColor" opacity="0.7" />
          <rect x="1.6" y="4" width="1.8" height="9" rx="0.9" fill="currentColor" opacity="0.45" />
        </g>
        <animateMotion dur="2.2s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;0.5;1" calcMode="linear" path={D} />
      </g>
    </svg>
  );
}
