import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { loadStudentSummary, type StudentSummary } from '../lib/data'
import { GRADES } from '../lib/grades'
import { THEMES, TOPICS, type Level } from '../lib/spec'
import { Alert, Bar, Empty, Grade, LineChart, Loading, PageHead, Stat, StudentPicker, fmtDate, useViewableStudents } from '../components/ui'

export default function Reports() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const { students, loading } = useViewableStudents()
  const [sum, setSum] = useState<StudentSummary | null>(null)
  const [writing, setWriting] = useState(false)
  const student = students.find(s => s.id === params.get('student')) ?? students[0]
  const level = (student?.year_group ?? 'A') as Level
  const staff = profile?.role === 'assessor' || profile?.role === 'admin'

  const load = () => student && loadStudentSummary(student.id, level).then(setSum)
  useEffect(() => { setSum(null); load() }, [student?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) return <Loading />
  if (!student) return <><PageHead title="Reports" /><Empty>{profile?.role === 'parent' ? 'Link a student on your Profile page to see their reports.' : 'No students in your classes yet.'}</Empty></>

  const points = sum ? [
    ...sum.results.map(r => ({ d: r.sat_on, label: new Date(r.sat_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: Number(r.percent) })),
    ...sum.attempts.filter(a => a.status === 'marked' && a.percent != null)
      .map(a => ({ d: (a.submitted_at ?? a.started_at).slice(0, 10), label: new Date(a.submitted_at ?? a.started_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), value: Number(a.percent) })),
  ].sort((x, y) => x.d.localeCompare(y.d)) : []
  const targetPct = student.target_grade ? { 'A*': 74, A: 63, B: 53, C: 43, D: 34, E: 25 }[student.target_grade] : undefined

  return (
    <>
      <PageHead title="Progress report" sub={`${student.full_name} · ${level === 'AS' ? 'AS level' : 'A level'} Economics A`}>
        <StudentPicker students={students} value={student.id} onChange={id => setParams({ student: id })} />
        {staff && <button onClick={() => setWriting(true)}>Write report</button>}
        <button className="secondary" onClick={() => window.print()}>Print / PDF</button>
      </PageHead>
      {!sum ? <Loading /> : (
        <>
          <div className="grid g4">
            <Stat label="Data-driven prediction" value={<Grade g={sum.predicted} />} sub={sum.avgPct != null ? `${sum.avgPct}% across recent papers & mocks` : 'Needs scored work'} />
            <Stat label="Assessor prediction" value={<Grade g={sum.reports[0]?.predicted_grade} />} sub={sum.reports[0] ? sum.reports[0].period : 'No report yet'} />
            <Stat label="Target grade" value={student.target_grade ?? '—'} />
            <Stat label="Attendance" value={sum.attendancePct != null ? `${sum.attendancePct}%` : '—'} sub={`${sum.attendance.filter(a => a.status === 'late').length} late · ${sum.attendance.filter(a => a.status === 'absent').length} absent`} />
          </div>

          {writing && <WriteReport studentId={student.id} defaults={{ predicted: sum.predicted, target: student.target_grade, attendance: sum.attendancePct }} onDone={() => { setWriting(false); load() }} />}

          <div className="grid g2 mt">
            <div className="card">
              <h2>Scores over time</h2>
              <LineChart points={points} target={targetPct} />
              {targetPct && <small>Dashed line: target grade boundary (indicative)</small>}
            </div>
            <div className="card">
              <h2>Topic confidence by theme</h2>
              <div className="stack">
                {THEMES.filter(t => level === 'A' || t.level === 'AS').map(th => {
                  const ts = TOPICS.filter(t => t.theme === th.no)
                  const v = ts.reduce((s, t) => s + (sum.progress[t.code] ?? 0), 0) / (ts.length * 5) * 100
                  return <div key={th.no}><div className="spread"><small><strong>Theme {th.no}</strong> {th.title}</small><small>{Math.round(v)}%</small></div><Bar value={v} /></div>
                })}
              </div>
            </div>
          </div>

          <div className="card">
            <h2>Assessor reports</h2>
            {sum.reports.length === 0 ? <Empty>No written reports yet.</Empty> : sum.reports.map(r => (
              <div key={r.id} style={{ borderBottom: '1px solid var(--border)', padding: '12px 0' }}>
                <div className="spread">
                  <strong>{r.period}</strong>
                  <div className="row">
                    <small>Working at</small><Grade g={r.working_grade} />
                    <small>Predicted</small><Grade g={r.predicted_grade} />
                    {r.effort && <span className="badge">Effort {r.effort}/5</span>}
                    <small>{fmtDate(r.created_at)}</small>
                  </div>
                </div>
                {r.strengths && <p className="mt"><strong>Strengths:</strong> {r.strengths}</p>}
                {r.next_steps && <p><strong>Next steps:</strong> {r.next_steps}</p>}
                {r.comments && <p style={{ whiteSpace: 'pre-wrap' }}>{r.comments}</p>}
              </div>
            ))}
          </div>

          <div className="grid g2">
            <div className="card">
              <h2>Past papers</h2>
              {sum.results.length === 0 ? <Empty>None logged.</Empty> : (
                <table><tbody>{[...sum.results].reverse().map(r => (
                  <tr key={r.id}><td>{r.past_papers?.series} P{r.past_papers?.paper_no}</td><td>{r.marks}/{r.max_marks}</td><td><Grade g={r.grade} /></td><td><small>{fmtDate(r.sat_on)}</small></td></tr>
                ))}</tbody></table>
              )}
            </div>
            <div className="card">
              <h2>Exams & quizzes</h2>
              {sum.attempts.filter(a => a.status !== 'in_progress').length === 0 ? <Empty>None completed.</Empty> : (
                <table><tbody>{sum.attempts.filter(a => a.status !== 'in_progress').reverse().map(a => (
                  <tr key={a.id}><td>{a.exams?.title}</td><td>{a.score ?? '—'}/{a.max_score}</td><td>{a.status === 'marked' ? <Grade g={a.grade} /> : <span className="badge ok">Marking</span>}</td><td><small>{fmtDate(a.submitted_at)}</small></td></tr>
                ))}</tbody></table>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function WriteReport({ studentId, defaults, onDone }: { studentId: string; defaults: { predicted: string | null; target: string | null; attendance: number | null }; onDone: () => void }) {
  const month = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const [f, setF] = useState({
    period: month, working_grade: defaults.predicted ?? '', predicted_grade: defaults.predicted ?? '', target_grade: defaults.target ?? '',
    effort: '4', strengths: '', next_steps: '', comments: '',
  })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const gradeSelect = (k: 'working_grade' | 'predicted_grade' | 'target_grade') => (
    <select value={f[k]} onChange={set(k)}><option value="">—</option>{GRADES.map(g => <option key={g}>{g}</option>)}</select>
  )

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('reports').insert({
      student_id: studentId, period: f.period, working_grade: f.working_grade || null, predicted_grade: f.predicted_grade || null,
      target_grade: f.target_grade || null, effort: Number(f.effort), attendance_pct: defaults.attendance,
      strengths: f.strengths || null, next_steps: f.next_steps || null, comments: f.comments || null,
    })
    if (error) return setError(errMsg(error))
    onDone()
  }

  return (
    <form className="card form mt" onSubmit={submit}>
      <h2>New report</h2>
      <div className="form cols">
        <label>Period<input required value={f.period} onChange={set('period')} /></label>
        <label>Working at{gradeSelect('working_grade')}</label>
        <label>Predicted{gradeSelect('predicted_grade')}</label>
        <label>Target{gradeSelect('target_grade')}</label>
        <label>Effort (1–5)<select value={f.effort} onChange={set('effort')}>{[1, 2, 3, 4, 5].map(n => <option key={n}>{n}</option>)}</select></label>
      </div>
      <label>Strengths<textarea value={f.strengths} onChange={set('strengths')} /></label>
      <label>Next steps<textarea value={f.next_steps} onChange={set('next_steps')} /></label>
      <label>Comments for student and parents<textarea value={f.comments} onChange={set('comments')} /></label>
      <Alert kind="error">{error}</Alert>
      <div className="row"><button>Publish report</button><button type="button" className="secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}
