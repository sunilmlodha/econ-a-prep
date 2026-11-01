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
export function buildPlan(s: PlanSettings, confidence: Record<string, number> = {}, learned: Set<string> = new Set()): PlanWeek[] {
  const start = parse(s.startDate)
  const exam = parse(s.examDate)
  if (!(exam > start) || s.days.length === 0) return []

  const perWeek = Math.max(1, Math.floor((s.hoursPerWeek * 60) / s.sessionMinutes))
  const conf = (t: Topic) => confidence[t.code] ?? 0
  const topics = [...topicsFor(s.level)].sort((a, b) => a.theme - b.theme || conf(a) - conf(b))
  // topics whose course lesson is done move straight to revision
  const learnQueue = topics.filter(t => conf(t) < 4 && !learned.has(t.code))
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

    // a partial week (first or last) gets a proportional share of sessions, not a full week crammed in
    const cap = Math.max(1, Math.round((perWeek * days.length) / s.days.length))
    const examPhase = weeksLeft <= 8
    const phase = examPhase ? 'Exam preparation' : learnIdx < learnQueue.length ? 'Foundation' : 'Consolidation'
    const paperSlots = !examPhase ? 0 : Math.min(cap - 1, weeksLeft <= 3 ? 3 : weeksLeft <= 5 ? 2 : 1)
    const practiceSlots = examPhase || phase === 'Consolidation' ? Math.min(1, cap - paperSlots - 1) : cap >= 4 ? 1 : 0
    // date slots in calendar order; content is queued learn → revise → practice → papers
    const slots = Array.from({ length: cap }, (_, i) => days[i % days.length]).sort((a, b) => a.getTime() - b.getTime())
    const content: Omit<PlanItem, 'id' | 'date'>[] = []
    const studySlots = Math.max(0, cap - paperSlots - practiceSlots - (weeksLeft === 1 ? 1 : 0))
    for (let i = 0; i < studySlots; i++) {
      // unlearnt topics always come first, even in the exam phase, so no theme is skipped
      if (learnIdx < learnQueue.length) {
        const t = learnQueue[learnIdx++]
        reviseCount[t.code] = (reviseCount[t.code] ?? 0) + 1
        content.push({ minutes: s.sessionMinutes, kind: 'learn', topic_code: t.code, title: `Lesson ${t.code} ${t.title}` })
      } else {
        // spaced revision — lowest confidence, least-revised first
        const t = [...topics].sort((a, b) =>
          conf(a) + (reviseCount[a.code] ?? 0) - (conf(b) + (reviseCount[b.code] ?? 0)))[0]
        reviseCount[t.code] = (reviseCount[t.code] ?? 0) + 1
        content.push({ minutes: s.sessionMinutes, kind: 'revise', topic_code: t.code, title: `${t.code} ${t.title}` })
      }
    }
    for (let i = 0; i < practiceSlots; i++) {
      content.push({ minutes: s.sessionMinutes, kind: 'practice', title: 'Exam technique: one data-response set or a 25-mark essay plan' })
    }
    for (let i = 0; i < paperSlots; i++) {
      const p = papers[paperIdx++ % papers.length]
      content.push({ minutes: Math.max(s.sessionMinutes, s.level === 'AS' ? 90 : 120), kind: 'paper', title: `Timed ${p} (mock or past paper) — then mark it against the mark scheme` })
    }
    if (weeksLeft === 1) content.push({ minutes: s.sessionMinutes, kind: 'review', title: 'Light review: definitions, diagrams and key formulae' })
    const items: PlanItem[] = content.slice(0, cap).map((c, i) => ({ ...c, id: `i${++n}`, date: iso(slots[i]) }))
    weeks.push({ weekStart: iso(w), phase, items })
  }
  return weeks
}

/** How many spec topics the plan schedules at least once (learn or revise). */
export function planCoverage(weeks: PlanWeek[], level: Level) {
  const seen = new Set(weeks.flatMap(w => w.items.map(i => i.topic_code)).filter(Boolean))
  const all = topicsFor(level)
  return { covered: all.filter(t => seen.has(t.code)).length, total: all.length }
}

/** Today's date in the user's own time zone, as yyyy-mm-dd. */
export function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Formats a plan date (yyyy-mm-dd) without shifting it by the viewer's time zone. */
export const fmtPlanDate = (s: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
  new Date(s + 'T00:00:00Z').toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })
