import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { buildPlan, defaultExamDate, KIND_LABEL, type PlanSettings, type PlanWeek } from '../lib/timetable'
import { PEARSON_LINKS, type Level } from '../lib/spec'
import { Alert, Bar, Empty, Loading, PageHead, StudentPicker, fmtDate, useViewableStudents } from '../components/ui'

interface StoredPlan { id: string; settings: PlanSettings; plan: PlanWeek[]; done: string[]; created_at: string }

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const todayIso = () => new Date().toISOString().slice(0, 10)

export default function Timetable() {
  const { profile } = useAuth()
  const { students, loading } = useViewableStudents()
  const [sid, setSid] = useState('')
  const [stored, setStored] = useState<StoredPlan | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [error, setError] = useState('')

  const student = students.find(s => s.id === sid) ?? students[0]
  const isOwner = profile?.role === 'student'
  useEffect(() => { if (!sid && students[0]) setSid(students[0].id) }, [students, sid])

  useEffect(() => {
    if (!student) return
    setStored(undefined)
    supabase.from('study_plans').select('*').eq('student_id', student.id).eq('active', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setStored(data as StoredPlan | null))
  }, [student])

  async function toggle(id: string) {
    if (!stored || !isOwner) return
    const done = stored.done.includes(id) ? stored.done.filter(x => x !== id) : [...stored.done, id]
    setStored({ ...stored, done })
    const { error } = await supabase.from('study_plans').update({ done }).eq('id', stored.id)
    if (error) setError(errMsg(error))
  }

  if (loading || (student && stored === undefined)) return <Loading />
  if (!student) return <><PageHead title="Study timetable" /><Empty>No linked students yet.</Empty></>

  const items = stored?.plan.flatMap(w => w.items) ?? []
  const pctDone = items.length ? Math.round((stored!.done.length * 100) / items.length) : 0
  const thisWeek = new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10)
  const weeks = (stored?.plan ?? []).filter(w => showAll || w.weekStart >= thisWeek)

  return (
    <>
      <PageHead title="Study timetable" sub="A week-by-week plan from today to your first exam, weighted to your weakest topics">
        <StudentPicker students={students} value={student.id} onChange={setSid} />
        {isOwner && stored && !editing && <button className="secondary" onClick={() => setEditing(true)}>Rebuild plan</button>}
      </PageHead>
      <Alert kind="error">{error}</Alert>

      {isOwner && (editing || !stored) ? (
        <PlanForm level={(profile!.year_group ?? 'A') as Level} examYear={profile!.exam_year ?? new Date().getFullYear() + 1}
          initial={stored?.settings} onCancel={stored ? () => setEditing(false) : undefined}
          onSaved={p => { setStored(p); setEditing(false) }} />
      ) : !stored ? (
        <Empty>{student.full_name} has not built a study plan yet.</Empty>
      ) : null}

      {stored && !editing && (
        <>
          <div className="card">
            <div className="spread">
              <div>
                <strong>{stored.settings.level === 'AS' ? 'AS level' : 'A level'}</strong> · {stored.settings.hoursPerWeek}h/week ·
                {' '}{stored.settings.days.map(d => DAYS[d]).join(', ')} · first exam {fmtDate(stored.settings.examDate)}
              </div>
              <label className="inline"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show past weeks</label>
            </div>
            <div className="row mt"><div style={{ flex: 1 }}><Bar value={pctDone} /></div><small>{stored.done.length}/{items.length} sessions done ({pctDone}%)</small></div>
          </div>
          <div className="grid g2 mt">
            {weeks.map(w => (
              <div className="card week" key={w.weekStart}>
                <div className="spread"><h3>Week of {fmtDate(w.weekStart)}</h3><span className="badge">{w.phase}</span></div>
                {w.items.map(i => (
                  <label key={i.id} className={`plan-item ${stored.done.includes(i.id) ? 'done' : ''}`} style={{ fontWeight: 400 }}>
                    <input type="checkbox" checked={stored.done.includes(i.id)} disabled={!isOwner} onChange={() => toggle(i.id)} />
                    <div style={{ flex: 1 }}>
                      <div className="t">{i.title}</div>
                      <small>{new Date(i.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {i.minutes} min</small>
                    </div>
                    <span className={`badge kind-${i.kind}`}>{KIND_LABEL[i.kind]}</span>
                  </label>
                ))}
              </div>
            ))}
          </div>
          {weeks.length === 0 && <Empty>The plan has finished — good luck in the exams!</Empty>}
        </>
      )}
    </>
  )
}

function PlanForm({ level, examYear, initial, onSaved, onCancel }: {
  level: Level; examYear: number; initial?: PlanSettings
  onSaved: (p: StoredPlan) => void; onCancel?: () => void
}) {
  const { profile } = useAuth()
  const [s, setS] = useState<PlanSettings>(initial ? { ...initial, startDate: todayIso() } : {
    level, startDate: todayIso(), examDate: defaultExamDate(examYear), hoursPerWeek: 6, sessionMinutes: 60, days: [1, 2, 3, 4, 6],
  })
  const [conf, setConf] = useState<Record<string, number>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('topic_progress').select('topic_code, confidence').eq('student_id', profile!.id).then(({ data }) => {
      const m: Record<string, number> = {}
      for (const r of data ?? []) m[r.topic_code] = r.confidence
      setConf(m)
    })
  }, [profile])

  const preview = useMemo(() => buildPlan(s, conf), [s, conf])

  async function save() {
    if (!preview.length) return setError('Pick at least one study day and an exam date in the future.')
    setBusy(true); setError('')
    await supabase.from('study_plans').update({ active: false }).eq('student_id', profile!.id).eq('active', true)
    const { data, error } = await supabase.from('study_plans').insert({ settings: s, plan: preview, done: [] }).select().single()
    setBusy(false)
    if (error) return setError(errMsg(error))
    onSaved(data as StoredPlan)
  }

  const sessions = preview.reduce((n, w) => n + w.items.length, 0)
  return (
    <div className="card">
      <h2>Build your plan</h2>
      <div className="form cols">
        <label>Qualification
          <select value={s.level} onChange={e => setS({ ...s, level: e.target.value as Level })}>
            <option value="AS">AS level (Themes 1–2)</option>
            <option value="A">A level (Themes 1–4)</option>
          </select>
        </label>
        <label>Start date<input type="date" value={s.startDate} onChange={e => setS({ ...s, startDate: e.target.value })} /></label>
        <label>First exam date<input type="date" value={s.examDate} onChange={e => setS({ ...s, examDate: e.target.value })} /></label>
        <label>Hours per week<input type="number" min={1} max={30} value={s.hoursPerWeek} onChange={e => setS({ ...s, hoursPerWeek: Number(e.target.value) || 1 })} /></label>
        <label>Session length
          <select value={s.sessionMinutes} onChange={e => setS({ ...s, sessionMinutes: Number(e.target.value) })}>
            {[30, 45, 60, 90].map(m => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </label>
      </div>
      <div className="row mt" role="group" aria-label="Study days">
        <strong style={{ fontSize: '0.85rem' }}>Study days:</strong>
        {[1, 2, 3, 4, 5, 6, 0].map(d => (
          <label key={d} className="inline">
            <input type="checkbox" checked={s.days.includes(d)}
              onChange={e => setS({ ...s, days: e.target.checked ? [...s.days, d] : s.days.filter(x => x !== d) })} />{DAYS[d]}
          </label>
        ))}
      </div>
      <p className="muted mt" style={{ fontSize: '0.85rem' }}>
        The default exam date is an estimate. Check the official <a href={PEARSON_LINKS.timetables} target="_blank" rel="noreferrer">Pearson exam timetable</a> and adjust.
        Topics you rate as weak in the <a href="#/syllabus">syllabus tracker</a> are scheduled first and revisited more often.
      </p>
      <Alert kind="error">{error}</Alert>
      <div className="spread mt">
        <small>{preview.length} weeks · {sessions} sessions · {preview.filter(w => w.phase === 'Exam preparation').length} weeks of exam preparation</small>
        <div className="row">
          {onCancel && <button className="secondary" onClick={onCancel}>Cancel</button>}
          <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save timetable'}</button>
        </div>
      </div>
    </div>
  )
}
