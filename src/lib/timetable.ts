import { topicsFor, type Level, type Topic } from './spec'

export interface PlanSettings {
  level: Level
  startDate: string // yyyy-mm-dd
  examDate: string // first written paper
  hoursPerWeek: number
  sessionMinutes: number
  days: number[] // 0 = Sunday … 6 = Saturday
}

export type ItemKind = 'learn' | 'revise' | 'practice' | 'paper' | 'review'

export interface PlanItem {
  id: string
  date: string
  minutes: number
  kind: ItemKind
  title: string
  topic_code?: string
}

export interface PlanWeek {
  weekStart: string
  phase: string
  items: PlanItem[]
}

const DAY = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(s + 'T00:00:00Z')

/** Second Monday of May in the given year — a placeholder until Pearson publishes the timetable. */
export function defaultExamDate(year: number) {
  const d = new Date(Date.UTC(year, 4, 1))
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1)
  d.setUTCDate(d.getUTCDate() + 7)
  return iso(d)
}

export const KIND_LABEL: Record<ItemKind, string> = {
  learn: 'Learn',
  revise: 'Revise',
  practice: 'Exam practice',
  paper: 'Past paper',
  review: 'Review',
}

/**
 * Builds a week-by-week plan:
 *  1. Foundation — every topic learnt once, weakest topics first within each theme.
 *  2. Consolidation — spaced revision of weak topics plus timed exam-style practice.
 *  3. Exam phase (final 8 weeks) — past papers ramp up, revision targets lowest confidence.
 */
export function buildPlan(s: PlanSettings, confidence: Record<string, number> = {}): PlanWeek[] {
  const start = parse(s.startDate)
  const exam = parse(s.examDate)
  if (!(exam > start) || s.days.length === 0) return []

  const perWeek = Math.max(1, Math.floor((s.hoursPerWeek * 60) / s.sessionMinutes))
  const conf = (t: Topic) => confidence[t.code] ?? 0
  const topics = [...topicsFor(s.level)].sort((a, b) => a.theme - b.theme || conf(a) - conf(b))
  const learnQueue = topics.filter(t => conf(t) < 4)
  const papers = s.level === 'AS'
    ? ['AS Paper 1 (Theme 1)', 'AS Paper 2 (Theme 2)']
    : ['A level Paper 1 (Themes 1 & 3)', 'A level Paper 2 (Themes 2 & 4)', 'A level Paper 3 (synoptic)']

  // monday of the start week
  const weekStart = new Date(start.getTime() - ((start.getUTCDay() + 6) % 7) * DAY)
  const weeks: PlanWeek[] = []
  const reviseCount: Record<string, number> = {}
  let learnIdx = 0
  let paperIdx = 0
  let n = 0

  for (let w = new Date(weekStart); w < exam; w = new Date(w.getTime() + 7 * DAY)) {
    const weeksLeft = Math.ceil((exam.getTime() - w.getTime()) / (7 * DAY))
    const days = [...s.days]
      .map(d => new Date(w.getTime() + ((d + 6) % 7) * DAY))
      .filter(d => d >= start && d < exam)
      .sort((a, b) => a.getTime() - b.getTime())
    if (days.length === 0) continue

    const examPhase = weeksLeft <= 8
    const phase = examPhase ? 'Exam preparation' : learnIdx < learnQueue.length ? 'Foundation' : 'Consolidation'
    const paperSlots = !examPhase ? 0 : weeksLeft <= 3 ? Math.min(3, perWeek) : weeksLeft <= 5 ? Math.min(2, perWeek) : 1
    const practiceSlots = examPhase || phase === 'Consolidation' ? Math.min(1, perWeek - paperSlots) : perWeek >= 4 ? 1 : 0
    const items: PlanItem[] = []

    for (let i = 0; i < perWeek; i++) {
      const date = iso(days[i % days.length])
      const id = `i${++n}`
      if (weeksLeft === 1 && i === perWeek - 1) {
        items.push({ id, date, minutes: s.sessionMinutes, kind: 'review', title: 'Light review: definitions, diagrams and key formulae' })
      } else if (i < paperSlots) {
        const p = papers[paperIdx++ % papers.length]
        items.push({ id, date, minutes: Math.max(s.sessionMinutes, s.level === 'AS' ? 90 : 120), kind: 'paper', title: `Timed ${p} — then self-mark with the mark scheme` })
      } else if (i < paperSlots + practiceSlots) {
        items.push({ id, date, minutes: s.sessionMinutes, kind: 'practice', title: 'Exam technique: one data-response set or a 25-mark essay plan' })
      } else if (!examPhase && learnIdx < learnQueue.length) {
        const t = learnQueue[learnIdx++]
        items.push({ id, date, minutes: s.sessionMinutes, kind: 'learn', topic_code: t.code, title: `${t.code} ${t.title}` })
      } else {
        // spaced revision — lowest confidence, least-revised first
        const t = [...topics].sort((a, b) =>
          conf(a) + (reviseCount[a.code] ?? 0) - (conf(b) + (reviseCount[b.code] ?? 0)))[0]
        reviseCount[t.code] = (reviseCount[t.code] ?? 0) + 1
        items.push({ id, date, minutes: s.sessionMinutes, kind: 'revise', topic_code: t.code, title: `${t.code} ${t.title}` })
      }
    }
    items.sort((a, b) => a.date.localeCompare(b.date))
    weeks.push({ weekStart: iso(w), phase, items })
  }
  return weeks
}
