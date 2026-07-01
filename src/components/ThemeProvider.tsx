import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ThemeName = "default" | "fire" | "water" | "forest";
export type ThemeMode = "light" | "dark";
export type FontFamily = "sans" | "serif" | "mono";
export type FontSize = "small" | "medium" | "large" | "xlarge";
export type MessageLength = "short" | "medium" | "long";
export type Behavior = "ai" | "human" | "dramatic" | "normal" | "professional";
export type TtsVoice = "shimmer" | "nova" | "sage" | "coral" | "alloy";

export interface ThemePrefs {
  theme: ThemeName;
  mode: ThemeMode;
  fontFamily: FontFamily;
  fontSize: FontSize;
  aiCanRename: boolean;
  messageLength: MessageLength;
  behavior: Behavior;
  ttsVoice: TtsVoice;
  ttsSpeed: number;
  ttsVolume: number;
}

const DEFAULTS: ThemePrefs = {
  theme: "default",
  mode: "dark",
  fontFamily: "sans",
  fontSize: "medium",
  aiCanRename: true,
  messageLength: "medium",
  behavior: "normal",
  ttsVoice: "shimmer",
  ttsSpeed: 1.0,
  ttsVolume: 1.0,
};

interface Ctx extends ThemePrefs {
  setTheme: (t: ThemeName) => void;
  setMode: (m: ThemeMode) => void;
  setFontFamily: (f: FontFamily) => void;
  setFontSize: (s: FontSize) => void;
  setAiCanRename: (v: boolean) => void;
  setMessageLength: (v: MessageLength) => void;
  setBehavior: (v: Behavior) => void;
  setTtsVoice: (v: TtsVoice) => void;
  setTtsSpeed: (v: number) => void;
  setTtsVolume: (v: number) => void;
  applyPrefs: (p: Partial<ThemePrefs>) => void;
}

const ThemeContext = createContext<Ctx | null>(null);

const STORAGE_KEY = "hola.theme.prefs";

function readStored(): ThemePrefs {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function applyToDom(p: ThemePrefs) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.setAttribute("data-theme", p.theme);
  root.setAttribute("data-font", p.fontFamily);
  root.setAttribute("data-font-size", p.fontSize);
  if (p.mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULTS);
  const hydratedFromDb = useRef(false);

  useEffect(() => {
    const stored = readStored();
    setPrefs(stored);
    applyToDom(stored);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .select("theme, theme_mode, font_family, font_size, ai_can_rename, message_length, behavior, tts_voice, tts_speed, tts_volume" as any)
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const d = data as any;
        const merged: ThemePrefs = {
          theme: (d.theme as ThemeName) ?? DEFAULTS.theme,
          mode: (d.theme_mode as ThemeMode) ?? DEFAULTS.mode,
          fontFamily: (d.font_family as FontFamily) ?? DEFAULTS.fontFamily,
          fontSize: (d.font_size as FontSize) ?? DEFAULTS.fontSize,
          aiCanRename: d.ai_can_rename ?? DEFAULTS.aiCanRename,
          messageLength: (d.message_length as MessageLength) ?? DEFAULTS.messageLength,
          behavior: (d.behavior as Behavior) ?? DEFAULTS.behavior,
          ttsVoice: (d.tts_voice as TtsVoice) ?? DEFAULTS.ttsVoice,
          ttsSpeed: typeof d.tts_speed === "number" ? d.tts_speed : DEFAULTS.ttsSpeed,
          ttsVolume: typeof d.tts_volume === "number" ? d.tts_volume : DEFAULTS.ttsVolume,
        };
        hydratedFromDb.current = true;
        setPrefs(merged);
        applyToDom(merged);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    applyToDom(prefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch { /* noop */ }
    if (user && hydratedFromDb.current) {
      supabase.from("profiles").update({
        theme: prefs.theme,
        theme_mode: prefs.mode,
        font_family: prefs.fontFamily,
        font_size: prefs.fontSize,
        ai_can_rename: prefs.aiCanRename,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        message_length: prefs.messageLength,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        behavior: prefs.behavior,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tts_voice: prefs.ttsVoice,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tts_speed: prefs.ttsSpeed,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        tts_volume: prefs.ttsVolume,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any).eq("id", user.id).then(() => { /* noop */ });
    }
  }, [prefs, user?.id]);

  const value: Ctx = {
    ...prefs,
    setTheme: (theme) => setPrefs((p) => ({ ...p, theme })),
    setMode: (mode) => setPrefs((p) => ({ ...p, mode })),
    setFontFamily: (fontFamily) => setPrefs((p) => ({ ...p, fontFamily })),
    setFontSize: (fontSize) => setPrefs((p) => ({ ...p, fontSize })),
    setAiCanRename: (aiCanRename) => setPrefs((p) => ({ ...p, aiCanRename })),
    setMessageLength: (messageLength) => setPrefs((p) => ({ ...p, messageLength })),
    setBehavior: (behavior) => setPrefs((p) => ({ ...p, behavior })),
    setTtsVoice: (ttsVoice) => setPrefs((p) => ({ ...p, ttsVoice })),
    setTtsSpeed: (ttsSpeed) => setPrefs((p) => ({ ...p, ttsSpeed })),
    setTtsVolume: (ttsVolume) => setPrefs((p) => ({ ...p, ttsVolume })),
    applyPrefs: (patch) => setPrefs((p) => ({ ...p, ...patch })),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
