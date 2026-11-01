import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { errMsg } from '../lib/supabase'
import { THEMES, TOPICS, type Level } from '../lib/spec'
import { lessonsFor, loadLessonIndex, loadProgress, type LessonMeta, type TopicProgress } from '../lib/course'
import { Alert, Bar, Empty, Loading, PageHead, StudentPicker, useViewableStudents } from '../components/ui'

export default function Course() {
  const { profile } = useAuth()
  const { students, loading } = useViewableStudents()
  const [sid, setSid] = useState('')
  const [lessons, setLessons] = useState<LessonMeta[] | null>(null)
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({})
  const [level, setLevel] = useState<Level>((profile?.year_group ?? 'A') as Level)
  const [error, setError] = useState('')
  const student = students.find(s => s.id === sid) ?? students[0]

  useEffect(() => { loadLessonIndex().then(setLessons).catch(e => setError(errMsg(e))) }, [])
  useEffect(() => {
    if (!student) return
    setLevel((student.year_group ?? 'A') as Level)
    loadProgress(student.id).then(setProgress).catch(e => setError(errMsg(e)))
  }, [student])

  if (loading || !lessons) return error ? <Alert kind="error">{error}</Alert> : <Loading />
  if (!lessons.length) return <><PageHead title="Course" /><Empty>The course content has not been loaded yet.</Empty></>

  const list = lessonsFor(lessons, level)
  const done = list.filter(l => progress[l.topic_code]?.lesson_completed_at)
  const next = list.find(l => !progress[l.topic_code]?.lesson_completed_at)
  const hoursLeft = Math.round(list.filter(l => !progress[l.topic_code]?.lesson_completed_at).reduce((s, l) => s + l.minutes, 0) / 60)

  return (
    <>
      <PageHead title="Course" sub={`The full Edexcel Economics A course, one lesson per specification topic — ${level === 'AS' ? 'AS: Themes 1–2' : 'A level: Themes 1–4'}`}>
        {student && <StudentPicker students={students} value={student.id} onChange={setSid} />}
        <select value={level} onChange={e => setLevel(e.target.value as Level)} style={{ width: 'auto' }} aria-label="Qualification">
          <option value="AS">AS level</option>
          <option value="A">A level</option>
        </select>
      </PageHead>
      <Alert kind="error">{error}</Alert>

      <div className="card">
        <div className="spread">
          <div>
            <strong>{done.length} of {list.length} lessons complete</strong>
            <div className="muted" style={{ fontSize: '0.85rem' }}>About {hoursLeft} hours of lessons left{student && profile?.role !== 'student' ? ` for ${student.full_name}` : ''}</div>
          </div>
          {next && <Link className="btn" to={`/course/${next.topic_code}`}>{done.length ? 'Continue' : 'Start'}: {next.topic_code} {next.title}</Link>}
        </div>
        <div className="mt"><Bar value={list.length ? (done.length * 100) / list.length : 0} /></div>
      </div>

      {THEMES.filter(t => level === 'A' || t.level === 'AS').map(th => {
        const ls = list.filter(l => l.theme === th.no)
        const d = ls.filter(l => progress[l.topic_code]?.lesson_completed_at).length
        const sections = [...new Set(TOPICS.filter(t => t.theme === th.no).map(t => t.section))]
        return (
          <div className="card" key={th.no}>
            <div className="spread">
              <div><h2 style={{ marginBottom: 2 }}>Theme {th.no}: {th.title}</h2><small>{th.papers}</small></div>
              <div style={{ width: 200 }}><Bar value={ls.length ? (d * 100) / ls.length : 0} /><small>{d}/{ls.length} lessons</small></div>
            </div>
            {sections.map(sec => (
              <div key={sec} className="mt">
                <h3>{sec}</h3>
                <div className="lesson-list">
                  {TOPICS.filter(t => t.section === sec).map(t => {
                    const l = ls.find(x => x.topic_code === t.code)
                    const p = progress[t.code]
                    return l ? (
                      <Link key={t.code} to={`/course/${t.code}`} className={`lesson-row ${p?.lesson_completed_at ? 'done' : ''}`}>
                        <span className="tick" aria-label={p?.lesson_completed_at ? 'Complete' : 'Not started'}>{p?.lesson_completed_at ? '✓' : ''}</span>
                        <code>{t.code}</code>
                        <span className="t">{t.title}</span>
                        <small>{l.minutes} min</small>
                        {p?.confidence ? <span className={`badge ${p.confidence >= 4 ? 'good' : p.confidence >= 3 ? 'ok' : 'bad'}`}>{p.confidence}/5</span> : <span />}
                      </Link>
                    ) : (
                      <div key={t.code} className="lesson-row muted"><span className="tick" /><code>{t.code}</code><span className="t">{t.title}</span><small>Coming soon</small><span /></div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
