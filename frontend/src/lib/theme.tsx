import { createContext } from "preact";
import { useContext, useEffect, useState } from "preact/hooks";
import { ComponentChildren } from "preact";

// Theme types
type ThemeMode = "light" | "dark";
type ThemeStyle = "classic" | "glow" | "vibrant";
type DarkBackground = "neutral" | "warm" | "cool" | "oled" | "slate" | "forest";
type LightBackground = "neutral" | "warm" | "cool";
type ThemeAccent = "green" | "teal" | "blue" | "orange" | "purple" | "red";

interface ThemeContextValue {
  mode: ThemeMode;
  // Dark mode settings
  darkStyle: ThemeStyle;
  darkBackground: DarkBackground;
  darkAccent: ThemeAccent;
  // Light mode settings
  lightStyle: ThemeStyle;
  lightBackground: LightBackground;
  lightAccent: ThemeAccent;
  // Actions
  toggleMode: () => void;
  setMode: (mode: ThemeMode) => void;
  setDarkStyle: (style: ThemeStyle) => void;
  setDarkBackground: (background: DarkBackground) => void;
  setDarkAccent: (accent: ThemeAccent) => void;
  setLightStyle: (style: ThemeStyle) => void;
  setLightBackground: (background: LightBackground) => void;
  setLightAccent: (accent: ThemeAccent) => void;
  // Legacy compatibility
  theme: ThemeMode;
  toggleTheme: () => void;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Storage keys
const STORAGE_PREFIX = "spoolbuddy-";
const getStorageKey = (key: string) => `${STORAGE_PREFIX}${key}`;

// Get initial values from localStorage with fallbacks
function getStoredValue<T extends string>(key: string, defaultValue: T): T {
  const stored = localStorage.getItem(getStorageKey(key));
  return (stored as T) || defaultValue;
}

function getInitialMode(): ThemeMode {
  // Check new key first, then legacy key
  const stored = localStorage.getItem(getStorageKey("mode"));
  const legacy = localStorage.getItem(getStorageKey("theme"));
  if (stored === "light" || stored === "dark") return stored;
  if (legacy === "light" || legacy === "dark") return legacy;
  // Fall back to system preference
  if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function ThemeProvider({ children }: { children: ComponentChildren }) {
  // Mode
  const [mode, setModeState] = useState<ThemeMode>(getInitialMode);

  // Dark mode settings
  const [darkStyle, setDarkStyleState] = useState<ThemeStyle>(() =>
    getStoredValue("dark-style", "classic")
  );
  const [darkBackground, setDarkBackgroundState] = useState<DarkBackground>(() =>
    getStoredValue("dark-background", "neutral")
  );
  const [darkAccent, setDarkAccentState] = useState<ThemeAccent>(() =>
    getStoredValue("dark-accent", "green")
  );

  // Light mode settings
  const [lightStyle, setLightStyleState] = useState<ThemeStyle>(() =>
    getStoredValue("light-style", "classic")
  );
  const [lightBackground, setLightBackgroundState] = useState<LightBackground>(() =>
    getStoredValue("light-background", "neutral")
  );
  const [lightAccent, setLightAccentState] = useState<ThemeAccent>(() =>
    getStoredValue("light-accent", "green")
  );

  // Apply theme classes based on current mode
  useEffect(() => {
    const root = document.documentElement;

    // Remove all theme classes
    root.classList.remove(
      "dark",
      "style-classic", "style-glow", "style-vibrant",
      "bg-neutral", "bg-warm", "bg-cool", "bg-oled", "bg-slate", "bg-forest",
      "accent-green", "accent-teal", "accent-blue", "accent-orange", "accent-purple", "accent-red"
    );

    // Apply based on current mode
    if (mode === "dark") {
      root.classList.add("dark");
      root.classList.add(`style-${darkStyle}`);
      root.classList.add(`bg-${darkBackground}`);
      root.classList.add(`accent-${darkAccent}`);
    } else {
      root.classList.add(`style-${lightStyle}`);
      root.classList.add(`bg-${lightBackground}`);
      root.classList.add(`accent-${lightAccent}`);
    }

    // Persist mode
    localStorage.setItem(getStorageKey("mode"), mode);
    // Clean up legacy key
    localStorage.removeItem(getStorageKey("theme"));
  }, [mode, darkStyle, darkBackground, darkAccent, lightStyle, lightBackground, lightAccent]);

  // Listen for system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      // Only auto-switch if user hasn't manually set a preference
      const stored = localStorage.getItem(getStorageKey("mode"));
      if (!stored) {
        setModeState(e.matches ? "dark" : "light");
      }
    };
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Mode actions
  const toggleMode = () => setModeState((prev) => (prev === "dark" ? "light" : "dark"));
  const setMode = (m: ThemeMode) => setModeState(m);

  // Dark mode setters
  const setDarkStyle = (v: ThemeStyle) => {
    setDarkStyleState(v);
    localStorage.setItem(getStorageKey("dark-style"), v);
  };
  const setDarkBackground = (v: DarkBackground) => {
    setDarkBackgroundState(v);
    localStorage.setItem(getStorageKey("dark-background"), v);
  };
  const setDarkAccent = (v: ThemeAccent) => {
    setDarkAccentState(v);
    localStorage.setItem(getStorageKey("dark-accent"), v);
  };

  // Light mode setters
  const setLightStyle = (v: ThemeStyle) => {
    setLightStyleState(v);
    localStorage.setItem(getStorageKey("light-style"), v);
  };
  const setLightBackground = (v: LightBackground) => {
    setLightBackgroundState(v);
    localStorage.setItem(getStorageKey("light-background"), v);
  };
  const setLightAccent = (v: ThemeAccent) => {
    setLightAccentState(v);
    localStorage.setItem(getStorageKey("light-accent"), v);
  };

  return (
    <ThemeContext.Provider
      value={{
        mode,
        darkStyle,
        darkBackground,
        darkAccent,
        lightStyle,
        lightBackground,
        lightAccent,
        toggleMode,
        setMode,
        setDarkStyle,
        setDarkBackground,
        setDarkAccent,
        setLightStyle,
        setLightBackground,
        setLightAccent,
        // Legacy compatibility
        theme: mode,
        toggleTheme: toggleMode,
        setTheme: setMode,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}

// Export types for use in other components
export type { ThemeMode, ThemeStyle, DarkBackground, LightBackground, ThemeAccent };
