import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Rgb, channels, contrast, ensureContrast, hexToRgb, mix, rgbToHex } from '../utils/color';

/** User preference. 'system' is the live mode: it follows the OS setting and updates instantly when it changes. */
export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'psc.theme';
/** User-picked brand colours ({ primary, secondary } hex) — absent means the default violet/blue. */
export const THEME_COLORS_KEY = 'psc.theme.colors';
/** Pre-computed CSS variables per theme, read by index.html before boot (no flash of default colours). */
export const THEME_VARS_KEY = 'psc.theme.vars';

export interface ThemeColors {
  primary: string;
  secondary: string;
}

export interface ThemePreset extends ThemeColors {
  id: string;
  label: string;
}

export const DEFAULT_COLORS: ThemeColors = { primary: '#7C3AED', secondary: '#2563EB' };

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'violet', label: 'Violet', ...DEFAULT_COLORS },
  { id: 'ocean', label: 'Ocean', primary: '#0284C7', secondary: '#4F46E5' },
  { id: 'emerald', label: 'Emerald', primary: '#059669', secondary: '#0891B2' },
  { id: 'sunset', label: 'Sunset', primary: '#EA580C', secondary: '#DB2777' },
  { id: 'rose', label: 'Rose', primary: '#E11D48', secondary: '#9333EA' },
  { id: 'graphite', label: 'Graphite', primary: '#475569', secondary: '#0EA5E9' }
];

const WHITE: Rgb = [255, 255, 255];
const DARK_SURFACE: Rgb = [26, 25, 48];   // --psc-surface (dark)

/** CSS variables overridden on <html> when custom colours are active. */
const CUSTOM_VARS = [
  '--psc-primary', '--psc-primary-rgb', '--psc-primary-strong', '--psc-primary-light', '--psc-primary-dark',
  '--psc-primary-text', '--psc-tint-violet', '--psc-on-tint-violet', '--psc-secondary', '--psc-secondary-rgb'
];
const DARK_QUERY = '(prefers-color-scheme: dark)';

export const THEME_OPTIONS: { id: ThemeMode; label: string; icon: string }[] = [
  { id: 'light', label: 'Light', icon: 'sun' },
  { id: 'dark', label: 'Dark', icon: 'moon' },
  { id: 'system', label: 'System', icon: 'monitor' }
];

/**
 * Applies the theme by setting `data-theme` on <html>; all colours come from CSS custom properties
 * defined for both themes in psc-global.scss. index.html applies the stored theme before Angular boots
 * so there is no flash of the wrong theme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly media = window.matchMedia(DARK_QUERY);
  private readonly systemDark = signal(this.media.matches);
  private switchTimer = 0;

  readonly mode = signal<ThemeMode>(this.readMode());
  readonly resolved = computed<ResolvedTheme>(() => {
    const mode = this.mode();
    return mode === 'system' ? (this.systemDark() ? 'dark' : 'light') : mode;
  });
  readonly isDark = computed(() => this.resolved() === 'dark');

  /** null = default brand colours. */
  readonly colors = signal<ThemeColors | null>(this.readColors());
  readonly activeColors = computed<ThemeColors>(() => this.colors() ?? DEFAULT_COLORS);
  readonly presetId = computed(() => {
    const c = this.activeColors();
    return THEME_PRESETS.find(p => p.primary === c.primary && p.secondary === c.secondary)?.id ?? 'custom';
  });

  /** True when a picked colour had to be adjusted to stay readable (shown as a hint in the UI). */
  readonly adjusted = computed(() => {
    const c = this.activeColors();
    const vars = this.derive(c, 'light');
    return vars['--psc-primary'] !== c.primary.toUpperCase() || vars['--psc-secondary'] !== c.secondary.toUpperCase();
  });

  constructor() {
    const onSystemChange = (e: MediaQueryListEvent) => {
      this.systemDark.set(e.matches);
      if (this.mode() === 'system') this.apply(true);
    };
    this.media.addEventListener('change', onSystemChange);
    inject(DestroyRef).onDestroy(() => this.media.removeEventListener('change', onSystemChange));

    // Keep tabs in sync: changing the theme in one tab updates the others live.
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_STORAGE_KEY && e.newValue && e.newValue !== this.mode()) {
        this.mode.set(this.normalize(e.newValue));
        this.apply(true);
      }
      if (e.key === THEME_COLORS_KEY) {
        this.colors.set(this.readColors());
        this.apply(true);
      }
    };
    window.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => window.removeEventListener('storage', onStorage));

    this.apply(false);
  }

  setMode(mode: ThemeMode): void {
    if (mode === this.mode()) return;
    this.mode.set(mode);
    try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* ignore */ }
    this.apply(true);
  }

  /** Live: every element re-colours immediately (all brand colours are CSS variables). */
  setColors(colors: ThemeColors | null): void {
    const next = colors && hexToRgb(colors.primary) && hexToRgb(colors.secondary)
      ? { primary: rgbToHex(hexToRgb(colors.primary)!), secondary: rgbToHex(hexToRgb(colors.secondary)!) }
      : null;
    const isDefault = !next || (next.primary === DEFAULT_COLORS.primary && next.secondary === DEFAULT_COLORS.secondary);
    this.colors.set(isDefault ? null : next);
    try {
      if (isDefault) {
        localStorage.removeItem(THEME_COLORS_KEY);
        localStorage.removeItem(THEME_VARS_KEY);
      } else {
        localStorage.setItem(THEME_COLORS_KEY, JSON.stringify(next));
        localStorage.setItem(THEME_VARS_KEY, JSON.stringify({ light: this.derive(next!, 'light'), dark: this.derive(next!, 'dark') }));
      }
    } catch { /* ignore */ }
    this.apply(false);
  }

  resetColors(): void {
    this.setColors(null);
  }

  /**
   * Builds the brand variables for one theme from the picked colours, nudging each so it stays
   * readable: fills keep ≥3.2:1 against white button text, accent text keeps ≥4.5:1 on its surface.
   */
  derive(colors: ThemeColors, theme: ResolvedTheme): Record<string, string> {
    const p = hexToRgb(colors.primary) ?? hexToRgb(DEFAULT_COLORS.primary)!;
    const s = hexToRgb(colors.secondary) ?? hexToRgb(DEFAULT_COLORS.secondary)!;
    const fill = ensureContrast(p, WHITE, 3.2, 'darken');
    const fill2 = ensureContrast(s, WHITE, 3.2, 'darken');
    const vars: Record<string, string> = {
      '--psc-primary': rgbToHex(fill),
      '--psc-primary-rgb': channels(fill),
      '--psc-primary-strong': rgbToHex(mix(fill, [0, 0, 0], 0.15)),
      '--psc-secondary': rgbToHex(fill2),
      '--psc-secondary-rgb': channels(fill2)
    };
    if (theme === 'light') {
      const tint = mix(p, WHITE, 0.88);
      vars['--psc-primary-light'] = rgbToHex(mix(fill, WHITE, 0.25));
      vars['--psc-primary-dark'] = rgbToHex(ensureContrast(p, WHITE, 5.5, 'darken'));
      vars['--psc-primary-text'] = rgbToHex(ensureContrast(p, WHITE, 4.5, 'darken'));
      vars['--psc-tint-violet'] = rgbToHex(tint);
      vars['--psc-on-tint-violet'] = rgbToHex(ensureContrast(p, tint, 5, 'darken'));
    } else {
      const light = ensureContrast(p, DARK_SURFACE, 4.8, 'lighten');
      vars['--psc-primary-light'] = rgbToHex(mix(light, WHITE, 0.1));
      vars['--psc-primary-dark'] = rgbToHex(ensureContrast(p, DARK_SURFACE, 5.5, 'lighten'));
      vars['--psc-primary-text'] = rgbToHex(light);
      vars['--psc-on-tint-violet'] = rgbToHex(ensureContrast(p, mix(DARK_SURFACE, p, 0.2), 5, 'lighten'));
    }
    return vars;
  }

  /** Contrast of a picked colour against white (shown in the customiser). */
  contrastOnWhite(hex: string): number {
    const c = hexToRgb(hex);
    return c ? contrast(c, WHITE) : 0;
  }

  /** Cycles light → dark → system (used by the collapsed-nav button). */
  cycle(): void {
    const order: ThemeMode[] = ['light', 'dark', 'system'];
    this.setMode(order[(order.indexOf(this.mode()) + 1) % order.length]);
  }

  private apply(animate: boolean): void {
    const root = document.documentElement;
    const theme = this.resolved();
    if (animate && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.classList.add('psc-theme-switching');
      window.clearTimeout(this.switchTimer);
      this.switchTimer = window.setTimeout(() => root.classList.remove('psc-theme-switching'), 400);
    }
    root.setAttribute('data-theme', theme);
    root.style.colorScheme = theme;
    // Brand colours: inline variables on <html> override both theme blocks, recomputed per theme.
    for (const name of CUSTOM_VARS) root.style.removeProperty(name);
    const custom = this.colors();
    if (custom) {
      for (const [name, value] of Object.entries(this.derive(custom, theme))) root.style.setProperty(name, value);
    }
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0E0D18' : '#F8F7FF');
  }

  private readColors(): ThemeColors | null {
    try {
      const raw = JSON.parse(localStorage.getItem(THEME_COLORS_KEY) || 'null');
      return raw && hexToRgb(raw.primary) && hexToRgb(raw.secondary) ? { primary: raw.primary, secondary: raw.secondary } : null;
    } catch {
      return null;
    }
  }

  private readMode(): ThemeMode {
    try { return this.normalize(localStorage.getItem(THEME_STORAGE_KEY)); } catch { return 'system'; }
  }

  private normalize(value: string | null): ThemeMode {
    return value === 'light' || value === 'dark' || value === 'system' ? value : 'system';
  }
}
