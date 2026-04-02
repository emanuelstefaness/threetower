"use client";

import { useCallback, useLayoutEffect, useState } from "react";

const STORAGE_KEY = "towerAlfa-minimal-ui";

function readStored(): boolean {
  try {
    return typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function applyClass(light: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("tower-minimal", light);
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/** Alternância tema escuro ↔ claro; ícone fixo no canto (sol = ativar claro, lua = ativar escuro). */
export function MinimalUiToggle() {
  const [light, setLight] = useState(false);

  useLayoutEffect(() => {
    const on = readStored();
    setLight(on);
    applyClass(on);
  }, []);

  const toggle = useCallback(() => {
    setLight((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      applyClass(next);
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      className="theme-corner-toggle"
      onClick={toggle}
      title={light ? "Tema escuro" : "Tema claro"}
      aria-label={light ? "Ativar tema escuro" : "Ativar tema claro"}
      aria-pressed={light}
    >
      {light ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
