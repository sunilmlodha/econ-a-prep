import { BOUNDARIES } from './grades'
import { lessonsFor, PAPER_INFO, type LessonMeta, type MockPaper, type MockState, type TopicProgress } from './course'
import type { Level } from './spec'

export interface AdviceInput {
  level: Level
  today: string // yyyy-mm-dd
  examDate: string
  lessons: LessonMeta[]
  progress: Record<string, TopicProgress>
  mocks: MockState[]
  recentPct: number | null
  plan?: { hoursPerWeek: number; startDate: string; dueByNow: number; doneByNow: number } | null
}

export interface Priority { label: string; why: string; to: string }

export interface Advice {
  weeksLeft: number
  lessonsDone: number
  lessonsTotal: number
  hours: { learn: number; revise: number; practice: number; total: number }
  perWeek: number
  status: 'ahead' | 'on_track' | 'behind' | 'no_plan' | 'exam_passed'
  target: { grade: string; pct: number }
  gap: number | null
  priorities: Priority[]
}

const DAY = 86_400_000
const parse = (s: string) => new Date(s + 'T00:00:00Z').getTime()

/** Full papers an A*-standard student should sit under timed conditions before the exam. */
export const PAPERS_TARGET: Record<Level, number> = { AS: 10, A: 15 }
// paper time plus marking it against the mark scheme and rewriting weak answers
const PAPER_HOURS: Record<Level, number> = { AS: 2.5, A: 3.5 }

export function advise(i: AdviceInput): Advice {
  const lessons = lessonsFor(i.lessons, i.level)
  const done = lessons.filter(l => i.progress[l.topic_code]?.lesson_completed_at)
  const conf = (c: string) => i.progress[c]?.confidence ?? 0
  const weeksLeft = Math.max(0, Math.ceil((parse(i.examDate) - parse(i.today)) / (7 * DAY)))

  // learning: lesson time plus a quarter again for notes and the check questions
  const learn = lessons.filter(l => !i.progress[l.topic_code]?.lesson_completed_at).reduce((s, l) => s + l.minutes, 0) * 1.25 / 60
  // revision: three spaced retrieval rounds for insecure topics, one for exam-ready ones
  const revise = lessons.reduce((s, l) => s + (conf(l.topic_code) >= 4 ? 0.5 : 1.5), 0)
  const mocksSat = i.mocks.filter(m => m.attempt && m.attempt.status !== 'in_progress').length
  const practice = Math.max(0, PAPERS_TARGET[i.level] - mocksSat) * PAPER_HOURS[i.level]
  const total = learn + revise + practice
  // leave the final week for light review
  const perWeek = weeksLeft > 0 ? Math.max(4, Math.ceil(total / Math.max(1, weeksLeft - 1))) : 0

  let status: Advice['status'] = 'no_plan'
  if (weeksLeft === 0) status = 'exam_passed'
  else if (i.plan) {
    const behindPlan = i.plan.dueByNow > 0 && i.plan.doneByNow < i.plan.dueByNow * 0.8
    const underHours = i.plan.hoursPerWeek < perWeek * 0.85
    status = behindPlan || underHours ? 'behind' : i.plan.doneByNow >= i.plan.dueByNow && i.plan.hoursPerWeek >= perWeek ? 'ahead' : 'on_track'
  }

  const [grade, pct] = i.level === 'A' ? BOUNDARIES.A[0] : BOUNDARIES.AS[0]
  const gap = i.recentPct != null ? Math.round((pct - i.recentPct) * 10) / 10 : null

  const priorities: Priority[] = []
  if (!i.plan && weeksLeft > 0) priorities.push({ label: 'Build your study timetable', why: `About ${perWeek} hours a week will get you through the whole course with time for papers.`, to: '/timetable' })
  const toMark = i.mocks.find(m => m.attempt?.status === 'submitted')
  if (toMark) priorities.push({ label: `Mark your ${toMark.title}`, why: 'Marking against the level descriptors is where most of the learning from a mock happens.', to: `/attempts/${toMark.attempt!.id}` })
  const next = lessons.find(l => !i.progress[l.topic_code]?.lesson_completed_at)
  if (next) priorities.push({ label: `Next lesson: ${next.topic_code} ${next.title}`, why: `${done.length} of ${lessons.length} lessons done — about ${Math.round(learn)} hours of new content left.`, to: `/course/${next.topic_code}` })
  const weak = done.filter(l => conf(l.topic_code) <= 2).sort((a, b) => conf(a.topic_code) - conf(b.topic_code))[0]
  if (weak) priorities.push({ label: `Revisit ${weak.topic_code} ${weak.title}`, why: `You rated it ${conf(weak.topic_code)}/5. Redo the check questions and rewrite the model answer from memory.`, to: `/course/${weak.topic_code}` })
  const ready = (paper: MockPaper) => {
    const ls = lessons.filter(l => PAPER_INFO[paper].themes.includes(l.theme))
    return ls.length > 0 && ls.filter(l => i.progress[l.topic_code]?.lesson_completed_at).length / ls.length >= 0.75
  }
  const mock = i.mocks.find(m => !m.attempt && PAPER_INFO[m.paper].level === i.level && ready(m.paper))
  if (mock) priorities.push({ label: `Sit ${mock.title}`, why: 'You have covered enough of its themes — do it timed, in one sitting, then self-mark.', to: '/mocks' })
  if (gap != null && gap > 0) priorities.push({ label: `Close a ${gap}-point gap to ${grade}`, why: 'Top marks come from evaluation: weigh up magnitude, time period and who is affected, then reach a justified judgement.', to: '/practice' })

  return {
    weeksLeft, lessonsDone: done.length, lessonsTotal: lessons.length,
    hours: { learn: Math.round(learn), revise: Math.round(revise), practice: Math.round(practice), total: Math.round(total) },
    perWeek, status, target: { grade, pct }, gap, priorities: priorities.slice(0, 5),
  }
}
