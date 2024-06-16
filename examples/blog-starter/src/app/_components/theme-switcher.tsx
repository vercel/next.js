"use client";

import { useEffect, useState } from "react";
import { Switch } from "./switch";

export type ColorSchemePreference = "system" | "dark" | "light";
export type ResolvedScheme = "dark" | "light";
export interface ThemeState {
  mode: ColorSchemePreference;
  systemMode: ResolvedScheme;
}

export const DARK = "dark";
export const LIGHT = "light";
export const SYSTEM = "system";

declare global {
  var u: (mode: ColorSchemePreference, systemMode: ResolvedScheme) => void;
  var m: MediaQueryList;
}

/** function to be injected in script tag for avoiding FOUC */
export const s = (storageKey: string) => {
  const [SYSTEM, DARK, LIGHT] = ["system", "dark", "light"] as const;
  window.u = (mode: ColorSchemePreference, systemMode: ResolvedScheme) => {
    const resolvedMode = mode === SYSTEM ? systemMode : mode;
    const el = document.documentElement;
    if (resolvedMode === DARK) el.classList.add(DARK);
    else el.classList.remove(DARK);
    [
      ["sm", systemMode],
      ["rm", resolvedMode],
      ["m", mode],
    ].forEach(([dataLabel, value]) =>
      el.setAttribute(`data-${dataLabel}`, value),
    );
    // System mode is decided by current system state and need not be stored in localStorage
    localStorage.setItem(storageKey, mode);
  };
  window.m = matchMedia(`(prefers-color-scheme: ${DARK})`);
  u(
    (localStorage.getItem(storageKey) ?? SYSTEM) as ColorSchemePreference,
    m.matches ? DARK : LIGHT,
  );
};

let media: MediaQueryList,
  updateDOM: (mode: ColorSchemePreference, systemMode: ResolvedScheme) => void;

export interface ThemeSwitcherProps {
  /** themeTransition: force apply CSS transition property to all the elements during theme switching. E.g., `all .3s`
   * @defaultValue 'none'
   */
  t?: string;
  /** The nonce value for your Content Security Policy. @defaultValue '' */
  nonce?: string;
  /** storageKey @defaultValue 'o' */
  k?: string;
}

/** Modify transition globally to avoid patched transitions */
const modifyTransition = (themeTransition = "none", nonce = "") => {
  const css = document.createElement("style");
  /** split by ';' to prevent CSS injection */
  css.textContent = `*,*:after,*:before{transition:${
    themeTransition.split(";")[0]
  } !important;}`;
  nonce && css.setAttribute("nonce", nonce);
  document.head.appendChild(css);

  return () => {
    // Force restyle
    getComputedStyle(document.body);
    // Wait for next tick before removing
    setTimeout(() => document.head.removeChild(css), 1);
  };
};

/**
 * This component wich applies classes and transitions.
 */
export const ThemeSwitcher = ({ t, nonce, k = "o" }: ThemeSwitcherProps) => {
  const [themeState, setThemeState] = useState<ThemeState>(() => {
    if (typeof document === "undefined")
      return { mode: SYSTEM, systemMode: DARK as ResolvedScheme };
    const el = document.documentElement;
    return {
      mode: (el.getAttribute("data-m") ?? SYSTEM) as ColorSchemePreference,
      systemMode: el.getAttribute("data-sm") as ResolvedScheme,
    };
  });

  useEffect(() => {
    // store global functions to local variables to avoid any interference
    [media, updateDOM] = [m, u];
    /** Updating media: prefers-color-scheme*/
    media.addEventListener("change", () =>
      setThemeState(
        (state) =>
          ({ ...state, s: media.matches ? DARK : LIGHT }) as ThemeState,
      ),
    );
    /** Sync the tabs */
    addEventListener("storage", (e: StorageEvent): void => {
      e.key === k &&
        setThemeState((state) => ({
          ...state,
          m: e.newValue as ColorSchemePreference,
        }));
    });
  }, [k]);

  useEffect(() => {
    const restoreTransitions = modifyTransition(t, nonce);
    updateDOM(themeState.mode, themeState.systemMode);
    restoreTransitions();
  }, [themeState, t, nonce]);

  return (
    <>
      <script
        dangerouslySetInnerHTML={{ __html: `(${s.toString()})('${k}')` }}
        nonce={nonce}
      />
      <Switch {...{ themeState, setThemeState }} />
    </>
  );
};
