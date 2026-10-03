"use client";

import { useSyncExternalStore } from "react";
import { THEME_KEY } from "./theme-script";

type Theme = "light" | "dark" | "cs";

const order: Theme[] = ["light", "dark", "cs"];
const names: Record<Theme, string> = { light: "light", dark: "dark", cs: "Counter-Strike" };

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getTheme = () => (document.documentElement.dataset.theme as Theme) ?? "cs";

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {}
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => "cs" as Theme);
}

const iconClass = "absolute size-[15px] transition-[transform,opacity] duration-(--duration-move) ease-out";
const iconStyle = (on: boolean, turn: number) => ({
  opacity: on ? 1 : 0,
  transform: on ? "none" : `rotate(${turn}deg) scale(0.5)`,
});

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const next = order[(order.indexOf(theme) + 1) % order.length];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${names[next]} theme`}
      title={`Switch to ${names[next]} theme`}
      className={`relative inline-grid size-8 place-items-center rounded-md text-muted transition-colors duration-(--duration-exit) hover:bg-panel hover:text-ink hover:duration-(--duration-enter) ${className}`}
    >
      {/* Sun */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        className={iconClass}
        style={iconStyle(theme === "light", -90)}
      >
        <circle cx="8" cy="8" r="2.75" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
      {/* Moon */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        className={iconClass}
        style={iconStyle(theme === "dark", 90)}
      >
        <path
          d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
      {/* Crosshair */}
      <svg aria-hidden viewBox="0 0 16 16" fill="none" className={iconClass} style={iconStyle(theme === "cs", 45)}>
        <path d="M8 1.5v4M8 10.5v4M1.5 8h4M10.5 8h4" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8" cy="8" r="0.9" fill="currentColor" />
      </svg>
    </button>
  );
}
