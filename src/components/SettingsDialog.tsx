import { useState } from "react";
import { Settings, Sun, Moon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useTheme, type ThemeName, type FontFamily, type FontSize } from "@/components/ThemeProvider";
import { cn } from "@/lib/utils";

const THEMES: { id: ThemeName; label: string; gradient: string }[] = [
  { id: "default", label: "Default", gradient: "linear-gradient(135deg, oklch(0.68 0.25 350), oklch(0.55 0.27 295))" },
  { id: "fire", label: "Fire", gradient: "linear-gradient(135deg, oklch(0.74 0.20 60), oklch(0.55 0.25 25))" },
  { id: "water", label: "Water", gradient: "linear-gradient(135deg, oklch(0.70 0.16 200), oklch(0.50 0.20 250))" },
  { id: "forest", label: "Forest", gradient: "linear-gradient(135deg, oklch(0.78 0.20 130), oklch(0.50 0.18 160))" },
];

const FONTS: { id: FontFamily; label: string; sample: string }[] = [
  { id: "sans", label: "Sans", sample: "Aa" },
  { id: "serif", label: "Serif", sample: "Aa" },
  { id: "mono", label: "Mono", sample: "Aa" },
];

const SIZES: { id: FontSize; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "medium", label: "Medium" },
  { id: "large", label: "Large" },
  { id: "xlarge", label: "XL" },
];

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <SettingsContent />
    </Dialog>
  );
}

function SettingsContent() {
  const { theme, mode, fontFamily, fontSize, setTheme, setMode, setFontFamily, setFontSize } = useTheme();

  return (
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Appearance</DialogTitle>
        <DialogDescription>Customize how Hola looks and feels.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        <section className="space-y-2">
          <Label>Color theme</Label>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border-2 p-2 transition",
                  theme === t.id ? "border-primary" : "border-transparent hover:border-border",
                )}
              >
                <div
                  className="h-12 w-12 rounded-lg flex items-center justify-center text-white font-bold text-lg shadow"
                  style={{ background: t.gradient }}
                >
                  H
                </div>
                <span className="text-xs">{t.label}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Label>Mode</Label>
          <div className="grid grid-cols-2 gap-2">
            <Button variant={mode === "light" ? "default" : "outline"} onClick={() => setMode("light")}>
              <Sun className="h-4 w-4 mr-1" /> Light
            </Button>
            <Button variant={mode === "dark" ? "default" : "outline"} onClick={() => setMode("dark")}>
              <Moon className="h-4 w-4 mr-1" /> Dark
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <Label>Font family</Label>
          <div className="grid grid-cols-3 gap-2">
            {FONTS.map((f) => (
              <button
                key={f.id}
                onClick={() => setFontFamily(f.id)}
                className={cn(
                  "rounded-lg border-2 px-3 py-3 transition",
                  fontFamily === f.id ? "border-primary" : "border-border hover:border-muted-foreground/40",
                )}
                style={{ fontFamily: f.id === "serif" ? "Georgia, serif" : f.id === "mono" ? "monospace" : "system-ui" }}
              >
                <div className="text-xl font-bold">{f.sample}</div>
                <div className="text-xs text-muted-foreground mt-1">{f.label}</div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <Label>Text size</Label>
          <div className="grid grid-cols-4 gap-2">
            {SIZES.map((s) => (
              <Button key={s.id} variant={fontSize === s.id ? "default" : "outline"} size="sm" onClick={() => setFontSize(s.id)}>
                {s.label}
              </Button>
            ))}
          </div>
        </section>
      </div>
    </DialogContent>
  );
}
