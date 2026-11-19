/** Local-date helpers (YYYY-MM-DD in the user's timezone — not UTC, so "today" is really today). */

export function isoDay(offsetDays = 0, from = new Date()): string {
  const x = new Date(from.getFullYear(), from.getMonth(), from.getDate() + offsetDays);
  const m = String(x.getMonth() + 1).padStart(2, '0');
  const d = String(x.getDate()).padStart(2, '0');
  return `${x.getFullYear()}-${m}-${d}`;
}

export const today = (): string => isoDay(0);

/** Whole days from today to `iso` (negative = past). */
export function daysFromToday(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - base) / 86_400_000);
}

/** "Today", "Tomorrow", "Yesterday", "In 3 days", "2 days ago", or "Mon, Nov 17". */
export function relativeDay(iso?: string): string {
  if (!iso) return 'No date';
  const n = daysFromToday(iso);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n <= 6) return `In ${n} days`;
  if (n < -1 && n >= -13) return `${-n} days ago`;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function nowIso(): string {
  return new Date().toISOString();
}
