import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  useTheme,
  type ThemeName,
  type FontFamily,
  type FontSize,
  type MessageLength,
  type Behavior,
  type TtsVoice,
} from "@/components/ThemeProvider";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

const LENGTHS: { id: MessageLength; label: string }[] = [
  { id: "short", label: "Short & simple" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long & detailed" },
];

const BEHAVIORS: { id: Behavior; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "human", label: "More like human" },
  { id: "dramatic", label: "Dramatic" },
  { id: "normal", label: "Normal" },
  { id: "professional", label: "Professional" },
];

const VOICES: { id: TtsVoice; label: string; hint: string }[] = [
  { id: "shimmer", label: "Shimmer", hint: "Gentle, warm" },
  { id: "nova", label: "Nova", hint: "Bright young woman" },
  { id: "sage", label: "Sage", hint: "Soft, calm" },
  { id: "coral", label: "Coral", hint: "Friendly, expressive" },
  { id: "alloy", label: "Alloy", hint: "Neutral" },
];

export function SettingsButton() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Settings">
          <Settings className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <SettingsContent />
    </Dialog>
  );
}

function SettingsContent() {
  const {
    theme, mode, fontFamily, fontSize, aiCanRename,
    messageLength, behavior, ttsVoice, ttsSpeed, ttsVolume,
    setTheme, setMode, setFontFamily, setFontSize, setAiCanRename,
    setMessageLength, setBehavior, setTtsVoice, setTtsSpeed, setTtsVolume,
  } = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        const n = data?.display_name ?? user.user_metadata?.full_name ?? "";
        setName(n);
        setSavedName(n);
      });
  }, [user]);

  const saveName = async () => {
    if (!user) return;
    const trimmed = name.trim().slice(0, 60);
    if (!trimmed || trimmed === savedName) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({ id: user.id, display_name: trimmed }, { onConflict: "id" });
    setSaving(false);
    if (error) toast.error("Could not save name");
    else {
      setSavedName(trimmed);
      window.dispatchEvent(new CustomEvent("hola:profile-changed"));
      toast.success("Name updated");
    }
  };

  return (
    <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Settings</DialogTitle>
        <DialogDescription>Profile and appearance.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5 mt-2">
        <section className="space-y-2">
          <Label htmlFor="display-name">Display name</Label>
          <div className="flex gap-2">
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              maxLength={60}
            />
            <Button onClick={saveName} disabled={saving || name.trim() === savedName || !name.trim()}>
              Save
            </Button>
          </div>
        </section>

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

        <section className="space-y-2">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="ai-rename">Let Hola rename chats</Label>
              <p className="text-xs text-muted-foreground">Hola can update conversation titles as the topic evolves.</p>
            </div>
            <Switch id="ai-rename" checked={aiCanRename} onCheckedChange={setAiCanRename} />
          </div>
        </section>
      </div>
    </DialogContent>
  );
}
