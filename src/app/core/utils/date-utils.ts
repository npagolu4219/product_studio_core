/** ISO date string (YYYY-MM-DD) for N days ago from today. */
export function d(daysAgo: number): string {
  const x = new Date();
  x.setDate(x.getDate() - daysAgo);
  return x.toISOString().split('T')[0];
}

/** ISO datetime string for N days ago + H hours ago from now. */
export function dt(daysAgo: number, hoursAgo = 0): string {
  const x = new Date();
  x.setDate(x.getDate() - daysAgo);
  x.setHours(x.getHours() - hoursAgo);
  return x.toISOString();
}

/** ISO date string for N days in the future. */
export function dFuture(daysFromNow: number): string {
  const x = new Date();
  x.setDate(x.getDate() + daysFromNow);
  return x.toISOString().split('T')[0];
}
