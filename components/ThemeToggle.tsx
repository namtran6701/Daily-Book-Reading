"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "./icons";

type Theme = "light" | "dark";

const STORE_KEY = "sb-theme";
const LABEL: Record<Theme, string> = { light: "Light", dark: "Dark" };
const listeners = new Set<() => void>();

// Until a choice is stored the app follows the device, so the button shows
// whichever look is currently on screen and the first tap flips it.
function readTheme(): Theme {
  try {
    const value = localStorage.getItem(STORE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // Without storage the device setting decides.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  const media = matchMedia("(prefers-color-scheme: dark)");
  media.addEventListener("change", callback);
  return () => {
    listeners.delete(callback);
    media.removeEventListener("change", callback);
  };
}

// The inline script in the layout applies the stored choice before first
// paint; this keeps the attribute and storage in step afterwards.
function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORE_KEY, theme);
  } catch {
    // Without storage the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => "light" as Theme);
  const next: Theme = theme === "light" ? "dark" : "light";
  const Icon = theme === "light" ? SunIcon : MoonIcon;
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
