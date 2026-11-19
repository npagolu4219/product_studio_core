/** Shared project identity visuals (gradient + initials) used by the Projects page, Home and the chat list. */
const GRADIENT_POOL = [
  'linear-gradient(135deg,#7C3AED,#2563EB)',
  'linear-gradient(135deg,#059669,#0284C7)',
  'linear-gradient(135deg,#D97706,#DC2626)',
  'linear-gradient(135deg,#E25292,#7C3AED)',
  'linear-gradient(135deg,#2563EB,#059669)',
  'linear-gradient(135deg,#0284C7,#7C3AED)',
  'linear-gradient(135deg,#DC2626,#E25292)'
];

const FIXED: Record<string, number> = { p1: 0, p2: 1, p3: 2, p4: 3, p5: 4 };

/** Stable gradient per project: seeded projects keep their colour; new ones cycle through the pool. */
export function projectGradient(id: string, _index = 0): string {
  const fixed = FIXED[id];
  if (fixed !== undefined) return GRADIENT_POOL[fixed];
  // Hash the id so a project has the same colour everywhere (cards, chips, chat list).
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GRADIENT_POOL[h % GRADIENT_POOL.length];
}

export function initials(name: string): string {
  return name.replace(/^Dr\.\s*/, '').split(/\s+/).map(n => n[0]).join('').toUpperCase().slice(0, 2);
}
