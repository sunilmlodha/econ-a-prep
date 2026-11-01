import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { EXAM_STRUCTURE, THEMES, TOPICS, PEARSON_LINKS, type Level } from '../lib/spec'
import { Alert, Bar, Loading, PageHead, StudentPicker, useViewableStudents } from '../components/ui'

const LABELS = ['Not started', 'Aware', 'Learning', 'Getting there', 'Confident', 'Exam-ready']

export default function Syllabus() {
  const { profile } = useAuth()
  const { students, loading } = useViewableStudents()
  const [sid, setSid] = useState('')
  const [conf, setConf] = useState<Record<string, number> | null>(null)
  const [error, setError] = useState('')
  const student = students.find(s => s.id === sid) ?? students[0]
  const editable = profile?.role === 'student'
  const level = (student?.year_group ?? 'A') as Level

  useEffect(() => {
    if (!student) return
    supabase.from('topic_progress').select('topic_code, confidence').eq('student_id', student.id).then(({ data }) => {
      const m: Record<string, number> = {}
      for (const r of data ?? []) m[r.topic_code] = r.confidence
      setConf(m)
    })
  }, [student])

  async function rate(code: string, value: number) {
    setConf(c => ({ ...c, [code]: value }))
    const status = value === 0 ? 'not_started' : value <= 2 ? 'learning' : value <= 4 ? 'revised' : 'mastered'
    const { error } = await supabase.from('topic_progress')
      .upsert({ student_id: profile!.id, topic_code: code, confidence: value, status, updated_at: new Date().toISOString() })
    if (error) setError(errMsg(error))
  }

  if (loading || (student && !conf)) return <Loading />
  const themes = THEMES.filter(t => level === 'A' || t.level === 'AS')

  return (
    <>
      <PageHead title="Syllabus tracker" sub={`Edexcel Economics A specification — ${level === 'AS' ? 'AS (8EC0): Themes 1–2' : 'A level (9EC0): Themes 1–4'}`}>
        {students.length > 0 && <StudentPicker students={students} value={student!.id} onChange={setSid} />}
        <a className="btn secondary" href={PEARSON_LINKS.qualification} target="_blank" rel="noreferrer">Official specification</a>
      </PageHead>
      <Alert kind="error">{error}</Alert>

      <div className="card">
        <h2>Exam structure</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Paper</th><th>Title</th><th>Time</th><th>Marks</th><th>Weight</th><th>Format</th></tr></thead>
            <tbody>
              {EXAM_STRUCTURE[level].map(p => (
                <tr key={p.code}><td><strong>{p.paper}</strong><div className="muted">{p.code}</div></td><td>{p.title}</td><td>{p.time}</td><td>{p.marks}</td><td>{p.weight}</td><td style={{ fontSize: '0.85rem' }}>{p.sections}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {themes.map(th => {
        const topics = TOPICS.filter(t => t.theme === th.no)
        const avg = topics.reduce((s, t) => s + (conf?.[t.code] ?? 0), 0) / topics.length
        const sections = [...new Set(topics.map(t => t.section))]
        return (
          <div className="card" key={th.no}>
            <div className="spread">
              <div><h2 style={{ marginBottom: 2 }}>Theme {th.no}: {th.title}</h2><small>{th.papers}</small></div>
              <div style={{ width: 200 }}><Bar value={(avg / 5) * 100} /><small>{Math.round((avg / 5) * 100)}% confidence</small></div>
            </div>
            {sections.map(sec => (
              <div key={sec} className="mt">
                <h3>{sec}</h3>
                <div className="table-wrap">
                  <table>
                    <tbody>
                      {topics.filter(t => t.section === sec).map(t => (
                        <tr key={t.code}>
                          <td style={{ width: 64 }}><code>{t.code}</code></td>
                          <td><strong>{t.title}</strong><div className="muted" style={{ fontSize: '0.85rem' }}>{t.points}</div></td>
                          <td style={{ width: 190 }}>
                            <div className="conf" role="radiogroup" aria-label={`Confidence for ${t.title}`}>
                              {[0, 1, 2, 3, 4, 5].map(v => (
                                <button key={v} type="button" disabled={!editable} title={LABELS[v]} aria-label={`${v} – ${LABELS[v]}`}
                                  className={(conf?.[t.code] ?? 0) >= v && v > 0 ? 'on' : ''} onClick={() => rate(t.code, v)}>{v}</button>
                              ))}
                            </div>
                            <div><small>{LABELS[conf?.[t.code] ?? 0]}</small></div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      })}
    </>
  )
}
