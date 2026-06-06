import { cn } from "@/lib/utils";

interface HolaLogoProps {
  size?: number;
  className?: string;
}

export function HolaLogo({ size = 32, className }: HolaLogoProps) {
  return (
    <div
      className={cn(
        "bg-brand-gradient shadow-brand inline-flex items-center justify-center rounded-xl font-bold text-white select-none",
        className,
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.55,
        lineHeight: 1,
      }}
      aria-label="Hola"
    >
      H
    </div>
  );
}
