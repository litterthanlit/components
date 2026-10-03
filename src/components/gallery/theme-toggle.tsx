"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark";

function subscribe(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const getTheme = () => (document.documentElement.dataset.theme as Theme) ?? "light";

export function setTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => "light" as Theme);
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const theme = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      className={`relative inline-grid size-8 place-items-center rounded-key text-muted transition-colors duration-(--duration-exit) hover:bg-panel hover:text-ink hover:duration-(--duration-enter) ${className}`}
    >
      {/* Sun */}
      <svg
        aria-hidden
        viewBox="0 0 16 16"
        fill="none"
        className="absolute size-[15px] transition-[transform,opacity] duration-(--duration-move) ease-out"
        style={{ opacity: theme === "light" ? 1 : 0, transform: theme === "light" ? "none" : "rotate(-90deg) scale(0.5)" }}
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
        className="absolute size-[15px] transition-[transform,opacity] duration-(--duration-move) ease-out"
        style={{ opacity: theme === "dark" ? 1 : 0, transform: theme === "dark" ? "none" : "rotate(90deg) scale(0.5)" }}
      >
        <path
          d="M13.5 9.6A5.75 5.75 0 0 1 6.4 2.5a5.75 5.75 0 1 0 7.1 7.1Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
