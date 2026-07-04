import { HolaLogo } from "@/components/HolaLogo";

interface HolaLoaderProps {
  /** Fill viewport (full app splash) vs inline (fills its parent). */
  fullscreen?: boolean;
  label?: string;
}

/**
 * Loading animation: dark-purple background, glowing pink dust,
 * jumping "..." dots, Hola icon floating above.
 */
export function HolaLoader({ fullscreen = false, label }: HolaLoaderProps) {
  return (
    <div
      className={
        (fullscreen ? "fixed inset-0 z-50 " : "w-full h-full min-h-[60vh] ") +
        "flex flex-col items-center justify-center overflow-hidden hola-loader-bg"
      }
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
    >
      {/* pink glow "dust" */}
      <div className="hola-loader-dust" aria-hidden />
      <div className="hola-loader-dust hola-loader-dust-2" aria-hidden />

      <div className="relative flex flex-col items-center gap-6">
        <div className="hola-loader-icon">
          <HolaLogo size={72} />
        </div>
        <div className="flex items-end gap-2 h-6">
          <span className="hola-loader-dot" />
          <span className="hola-loader-dot" style={{ animationDelay: "0.15s" }} />
          <span className="hola-loader-dot" style={{ animationDelay: "0.3s" }} />
        </div>
        {label && <p className="text-sm text-white/70">{label}</p>}
      </div>
    </div>
  );
}
