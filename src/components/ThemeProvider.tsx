import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export type ThemeName = "default" | "fire" | "water" | "forest";
export type ThemeMode = "light" | "dark";
export type FontFamily = "sans" | "serif" | "mono";
export type FontSize = "small" | "medium" | "large" | "xlarge";

export interface ThemePrefs {
  theme: ThemeName;
  mode: ThemeMode;
  fontFamily: FontFamily;
  fontSize: FontSize;
  aiCanRename: boolean;
}

const DEFAULTS: ThemePrefs = {
  theme: "default",
  mode: "dark",
  fontFamily: "sans",
  fontSize: "medium",
  aiCanRename: true,
};

interface Ctx extends ThemePrefs {
  setTheme: (t: ThemeName) => void;
  setMode: (m: ThemeMode) => void;
  setFontFamily: (f: FontFamily) => void;
  setFontSize: (s: FontSize) => void;
  setAiCanRename: (v: boolean) => void;
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

  // Load from profile (roams across devices)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("theme, theme_mode, font_family, font_size, ai_can_rename")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return;
        const merged: ThemePrefs = {
          theme: (data.theme as ThemeName) ?? DEFAULTS.theme,
          mode: (data.theme_mode as ThemeMode) ?? DEFAULTS.mode,
          fontFamily: (data.font_family as FontFamily) ?? DEFAULTS.fontFamily,
          fontSize: (data.font_size as FontSize) ?? DEFAULTS.fontSize,
          aiCanRename: data.ai_can_rename ?? DEFAULTS.aiCanRename,
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
      }).eq("id", user.id).then(() => { /* noop */ });
    }
  }, [prefs, user?.id]);

  const value: Ctx = {
    ...prefs,
    setTheme: (theme) => setPrefs((p) => ({ ...p, theme })),
    setMode: (mode) => setPrefs((p) => ({ ...p, mode })),
    setFontFamily: (fontFamily) => setPrefs((p) => ({ ...p, fontFamily })),
    setFontSize: (fontSize) => setPrefs((p) => ({ ...p, fontSize })),
    setAiCanRename: (aiCanRename) => setPrefs((p) => ({ ...p, aiCanRename })),
    applyPrefs: (patch) => setPrefs((p) => ({ ...p, ...patch })),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
