import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type ThemeName = "default" | "fire" | "water" | "forest";
export type ThemeMode = "light" | "dark";
export type FontFamily = "sans" | "serif" | "mono";
export type FontSize = "small" | "medium" | "large" | "xlarge";

export interface ThemePrefs {
  theme: ThemeName;
  mode: ThemeMode;
  fontFamily: FontFamily;
  fontSize: FontSize;
}

const DEFAULTS: ThemePrefs = {
  theme: "default",
  mode: "dark",
  fontFamily: "sans",
  fontSize: "medium",
};

interface Ctx extends ThemePrefs {
  setTheme: (t: ThemeName) => void;
  setMode: (m: ThemeMode) => void;
  setFontFamily: (f: FontFamily) => void;
  setFontSize: (s: FontSize) => void;
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
  const [prefs, setPrefs] = useState<ThemePrefs>(DEFAULTS);

  useEffect(() => {
    const stored = readStored();
    setPrefs(stored);
    applyToDom(stored);
  }, []);

  useEffect(() => {
    applyToDom(prefs);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* noop */
    }
  }, [prefs]);

  const value: Ctx = {
    ...prefs,
    setTheme: (theme) => setPrefs((p) => ({ ...p, theme })),
    setMode: (mode) => setPrefs((p) => ({ ...p, mode })),
    setFontFamily: (fontFamily) => setPrefs((p) => ({ ...p, fontFamily })),
    setFontSize: (fontSize) => setPrefs((p) => ({ ...p, fontSize })),
    applyPrefs: (patch) => setPrefs((p) => ({ ...p, ...patch })),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
