"use client";

import { useSyncExternalStore } from "react";
import { ContrastIcon, MoonIcon, SunIcon } from "./icons";

type Theme = "system" | "light" | "dark";

const STORE_KEY = "sb-theme";
const ORDER: Theme[] = ["system", "light", "dark"];
const LABEL: Record<Theme, string> = { system: "Match system", light: "Light", dark: "Dark" };
const listeners = new Set<() => void>();

function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORE_KEY);
    return value === "light" || value === "dark" ? value : "system";
  } catch {
    return "system";
  }
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// The inline script in the layout applies the stored choice before first
// paint; this keeps the attribute and storage in step afterwards.
function applyTheme(theme: Theme): void {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  try {
    if (theme === "system") localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, theme);
  } catch {
    // Without storage the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "system" as Theme);
  const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
  const Icon = theme === "light" ? SunIcon : theme === "dark" ? MoonIcon : ContrastIcon;
  return (
    <button
      className="theme-toggle pressable"
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[next].toLowerCase()}`}
      title={`Theme: ${LABEL[theme]}`}
    >
      <Icon size={15} />
    </button>
  );
}
