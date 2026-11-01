import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Profile } from '../lib/supabase'
import { loadLessonIndex, loadMocks, loadProgress } from '../lib/course'
import { advise, type Advice } from '../lib/advisor'
import { loadStudentSummary } from '../lib/data'
import { defaultExamDate, localIso, type PlanSettings, type PlanWeek } from '../lib/timetable'
import type { Level } from '../lib/spec'
import { Alert, Bar } from './ui'

const STATUS = {
  ahead: { label: 'Ahead of schedule', cls: 'good' },
  on_track: { label: 'On track', cls: 'good' },
  behind: { label: 'Behind — act now', cls: 'bad' },
  no_plan: { label: 'No timetable yet', cls: 'ok' },
  exam_passed: { label: 'Exam date passed', cls: '' },
}

/** Course-wide guidance for one student: hours needed for a top grade, pace against their plan and what to do next. */
export default function Advisor({ student, compact, onAdvice }: { student: Profile; compact?: boolean; onAdvice?: (a: Advice) => void }) {
  const [advice, setAdvice] = useState<Advice | null>(null)
  const [plan, setPlan] = useState<PlanSettings | null>(null)
  const [error, setError] = useState('')
  const level = (student.year_group ?? 'A') as Level

  useEffect(() => {
    let live = true
    setAdvice(null)
    ;(async () => {
      const [lessons, progress, mocks, sum, sp] = await Promise.all([
        loadLessonIndex(), loadProgress(student.id), loadMocks(student.id), loadStudentSummary(student.id, level),
        supabase.from('study_plans').select('settings, plan, done').eq('student_id', student.id).eq('active', true)
          .order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ])
      const stored = sp.data as { settings: PlanSettings; plan: PlanWeek[]; done: string[] } | null
      const today = localIso()
      const due = stored?.plan.flatMap(w => w.items).filter(x => x.date <= today) ?? []
      const a = advise({
        level, today, lessons, progress, mocks, recentPct: sum.avgPct,
        examDate: stored?.settings.examDate ?? defaultExamDate(student.exam_year ?? new Date().getFullYear() + 1),
        plan: stored && { hoursPerWeek: stored.settings.hoursPerWeek, startDate: stored.settings.startDate,
          dueByNow: due.length, doneByNow: due.filter(x => stored.done.includes(x.id)).length },
      })
      if (live) { setAdvice(a); setPlan(stored?.settings ?? null); onAdvice?.(a) }
    })().catch(e => live && setError(errMsg(e)))
    return () => { live = false }
  }, [student.id, student.exam_year, level]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Alert kind="error">Could not load study advice: {error}</Alert>
  if (!advice) return <div className="card"><p className="muted">Working out your schedule…</p></div>
  const s = STATUS[advice.status]
  const h = advice.hours
  const learnPct = advice.lessonsTotal ? (advice.lessonsDone * 100) / advice.lessonsTotal : 0

  return (
    <div className="card advisor">
      <div className="spread">
        <h2 style={{ margin: 0 }}>{advice.target.grade} readiness plan</h2>
        <span className={`badge ${s.cls}`}>{s.label}</span>
      </div>
      <div className="grid g4 mt">
        <div><div className="label muted">Weeks to first paper</div><div className="big">{advice.weeksLeft}</div></div>
        <div><div className="label muted">Lessons done</div><div className="big">{advice.lessonsDone}<small>/{advice.lessonsTotal}</small></div><Bar value={learnPct} /></div>
        <div>
          <div className="label muted">Recommended study</div>
          <div className="big">{advice.perWeek}<small> h/week</small></div>
          {plan && <small className={plan.hoursPerWeek < advice.perWeek ? 'bad-text' : ''}>Your plan: {plan.hoursPerWeek} h/week</small>}
        </div>
        <div>
          <div className="label muted">Recent average</div>
          <div className="big">{advice.gap == null ? '—' : `${Math.round(advice.target.pct - advice.gap)}%`}</div>
          <small>{advice.target.grade} needs about {advice.target.pct}%</small>
        </div>
      </div>
      {!compact && advice.weeksLeft > 0 && (
        <p className="muted mt" style={{ fontSize: '0.9rem' }}>
          To be {advice.target.grade}-ready you need about <strong>{h.total} more hours</strong>: {h.learn}h learning the remaining lessons,
          {' '}{h.revise}h of spaced revision (three retrieval rounds on every insecure topic) and {h.practice}h of timed papers with marking.
          {advice.perWeek > 15 && ' That is a heavy load: start now, use every study day and prioritise the topics you rated lowest.'}
        </p>
      )}
      {advice.priorities.length > 0 && (
        <div className="stack mt">
          <strong style={{ fontSize: '0.9rem' }}>Do next</strong>
          {advice.priorities.map((p, i) => (
            <Link key={i} to={p.to} className="priority">
              <span className="n">{i + 1}</span>
              <span><strong>{p.label}</strong><br /><small>{p.why}</small></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
