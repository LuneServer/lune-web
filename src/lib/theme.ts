import { useCallback, useEffect, useState } from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'lune_theme_pref';
const LEGACY_STORAGE_KEY = 'lune_theme';
const THEME_COLORS: Record<ResolvedTheme, string> = {
  dark: '#09090B',
  light: '#F5F5F7',
};
const THEME_EVENT = 'lune-theme-change';

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'dark';
  }
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') {
      return stored;
    }
  } catch {
    // ignore storage access errors
  }
  return 'system';
}

export function resolveTheme(pref: ThemePreference): ResolvedTheme {
  return pref === 'system' ? getSystemTheme() : pref;
}

export function applyThemePreference(pref: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(pref);
  document.documentElement.dataset.theme = resolved;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', THEME_COLORS[resolved]);
  }
  return resolved;
}

function persistThemePreference(pref: ThemePreference) {
  try {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
    if (pref === 'system') {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, pref);
    }
  } catch {
    // ignore storage access errors
  }
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredPreference);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredPreference()),
  );

  useEffect(() => {
    setResolvedTheme(applyThemePreference(preference));
  }, [preference]);

  // React live when OS appearance changes while set to 'system'
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handleChange = () => {
      if (preference === 'system') {
        setResolvedTheme(applyThemePreference('system'));
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, [preference]);

  // Keep multiple ThemeSwitcher instances (and browser tabs) in sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY) return;
      if (e.newValue === 'light' || e.newValue === 'dark' || e.newValue === 'system') {
        setPreferenceState(e.newValue);
      } else {
        setPreferenceState('system');
      }
    };
    const onCustom = (e: Event) => {
      const next = (e as CustomEvent<ThemePreference>).detail;
      if (next === 'system' || next === 'light' || next === 'dark') {
        setPreferenceState(next);
      }
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(THEME_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(THEME_EVENT, onCustom);
    };
  }, []);

  const setTheme = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    persistThemePreference(next);
    setResolvedTheme(applyThemePreference(next));
    window.dispatchEvent(new CustomEvent<ThemePreference>(THEME_EVENT, { detail: next }));
  }, []);

  const cycleTheme = useCallback(() => {
    const order: ThemePreference[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(preference) + 1) % order.length];
    setTheme(next);
  }, [preference, setTheme]);

  return {
    theme: preference,
    resolvedTheme,
    setTheme,
    cycleTheme,
  };
}
