import type { Level } from './spec'

// Indicative boundaries (percent of total raw marks). Pearson publishes real
// boundaries per series; these mirror public.grade_for() in the database.
export const BOUNDARIES: Record<Level, [string, number][]> = {
  AS: [['A', 65], ['B', 56], ['C', 47], ['D', 38], ['E', 30]],
  A: [['A*', 74], ['A', 63], ['B', 53], ['C', 43], ['D', 34], ['E', 25]],
}

export function gradeFor(level: Level, pct: number | null | undefined): string | null {
  if (pct == null || Number.isNaN(pct)) return null
  for (const [g, min] of BOUNDARIES[level]) if (pct >= min) return g
  return 'U'
}

export const GRADES = ['A*', 'A', 'B', 'C', 'D', 'E', 'U']

export function gradeTone(g?: string | null) {
  if (!g) return 'muted'
  if (g === 'A*' || g === 'A') return 'good'
  if (g === 'B' || g === 'C') return 'ok'
  return 'bad'
}

export const pct = (score?: number | null, max?: number | null) =>
  score != null && max ? Math.round((score * 1000) / max) / 10 : null
