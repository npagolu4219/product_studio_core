/** Small colour helpers used to derive an accessible theme palette from user-picked brand colours. */

export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split('').map(c => c + c).join('') : m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function isHex(value: string): boolean {
  return hexToRgb(value) !== null;
}

/** Linear blend: t = 0 → a, t = 1 → b. */
export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Moves `color` toward black ('darken') or white ('lighten') in small steps until it reaches
 * `target` contrast against `bg`. Returns the original colour if it already passes.
 */
export function ensureContrast(color: Rgb, bg: Rgb, target: number, direction: 'darken' | 'lighten'): Rgb {
  const toward: Rgb = direction === 'darken' ? [0, 0, 0] : [255, 255, 255];
  let c = color;
  for (let i = 0; i < 40 && contrast(c, bg) < target; i++) c = mix(c, toward, 0.06);
  return c;
}

export const channels = ([r, g, b]: Rgb): string => `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
