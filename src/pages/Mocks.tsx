import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { errMsg, type Profile } from '../lib/supabase'
import { loadLessonIndex, loadMocks, loadProgress, PAPER_INFO, type LessonMeta, type MockPaper, type MockState, type TopicProgress } from '../lib/course'
import { EXAM_STRUCTURE, type Level } from '../lib/spec'
import { Alert, Bar, Empty, Grade, Loading, PageHead, StudentPicker, useViewableStudents } from '../components/ui'

const PAPERS: Record<Level, MockPaper[]> = { AS: ['AS1', 'AS2'], A: ['A1', 'A2', 'A3'] }

export default function Mocks() {
  const { profile } = useAuth()
  const { students, loading } = useViewableStudents()
  const [sid, setSid] = useState('')
  const [mocks, setMocks] = useState<MockState[] | null>(null)
  const [lessons, setLessons] = useState<LessonMeta[]>([])
  const [progress, setProgress] = useState<Record<string, TopicProgress>>({})
  const [level, setLevel] = useState<Level>((profile?.year_group ?? 'A') as Level)
  const [error, setError] = useState('')
  const nav = useNavigate()
  const isStudent = profile?.role === 'student'
  const isStaff = profile?.role === 'assessor' || profile?.role === 'admin'
  // staff open on their own try-out view and can switch to any student's results
  const self = isStaff && (sid === '' || sid === 'me')
  const student: Profile | undefined = self ? undefined : students.find(s => s.id === sid) ?? students[0]
  const canSit = isStudent || self

  useEffect(() => { loadLessonIndex().then(setLessons).catch(() => {}) }, [])
  useEffect(() => {
    if (loading) return
    setMocks(null)
    if (student) setLevel((student.year_group ?? 'A') as Level)
    Promise.all([loadMocks(self ? profile!.id : student?.id ?? null), student ? loadProgress(student.id) : Promise.resolve({})])
      .then(([m, p]) => { setMocks(m); setProgress(p) })
      .catch(e => setError(errMsg(e)))
  }, [student, self, loading]) // eslint-disable-line react-hooks/exhaustive-deps

  function start(m: MockState) {
    if (self && !confirm(`${m.title}\n\nStaff try-out: this does not count towards any student's results${m.attempt ? ' and replaces your previous try' : ''}.`)) return
    if (!self && !confirm(`${m.title}\n\nThis is a timed paper: ${m.duration_minutes} minutes from the moment you start. Sit it in one go, without notes, as in the real exam. Start now?`)) return
    nav(`/exams/${m.id}/take`)
  }

  if (loading || !mocks) return error ? <Alert kind="error">{error}</Alert> : <Loading />
  const coverage = (paper: MockPaper) => {
    const ls = lessons.filter(l => PAPER_INFO[paper].themes.includes(l.theme))
    return ls.length ? Math.round((ls.filter(l => progress[l.topic_code]?.lesson_completed_at).length * 100) / ls.length) : 0
  }
  const sat = mocks.filter(m => PAPER_INFO[m.paper].level === level && m.attempt && m.attempt.status !== 'in_progress')
  const marked = sat.filter(m => m.attempt!.percent != null)
  const avg = marked.length ? Math.round(marked.reduce((s, m) => s + Number(m.attempt!.percent), 0) / marked.length) : null

  return (
    <>
      <PageHead title="Mock exams" sub="Full-length, timed papers in the Edexcel format, with mark schemes and level descriptors">
        {isStaff ? (
          <select value={self ? 'me' : student?.id} onChange={e => setSid(e.target.value)} style={{ width: 'auto', minWidth: 220 }} aria-label="Whose mocks">
            <option value="me">Myself — sit a paper</option>
            {students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
          </select>
        ) : !isStudent && student && <StudentPicker students={students} value={student.id} onChange={setSid} />}
        <select value={level} onChange={e => setLevel(e.target.value as Level)} style={{ width: 'auto' }} aria-label="Qualification">
          <option value="AS">AS level (8EC0)</option>
          <option value="A">A level (9EC0)</option>
        </select>
      </PageHead>
      <Alert kind="error">{error}</Alert>

      <div className="grid g3">
        <div className="card stat"><div className="label">Papers sat</div><div className="value">{sat.length}<small>/{mocks.filter(m => PAPER_INFO[m.paper].level === level).length}</small></div><div className="sub">{self ? 'Your try-outs (not counted)' : student && !isStudent ? student.full_name : 'Mocks in this library'}</div></div>
        <div className="card stat"><div className="label">Average</div><div className="value">{avg != null ? `${avg}%` : '—'}</div><div className="sub">Marked papers</div></div>
        <div className="card">
          <div className="label muted" style={{ fontSize: '0.8rem' }}>How to use mocks</div>
          <small>Sit each paper once you have finished the lessons for its themes. Use real exam timing, then mark it against the mark scheme straight away and rewrite your weakest answer.</small>
        </div>
      </div>

      {PAPERS[level].map(paper => {
        const list = mocks.filter(m => m.paper === paper)
        const struct = EXAM_STRUCTURE[level].find(p => p.code.endsWith(`/0${paper.slice(-1)}`))
        const cov = coverage(paper)
        return (
          <div className="card" key={paper}>
            <div className="spread">
              <div>
                <h2 style={{ marginBottom: 2 }}>{PAPER_INFO[paper].name}</h2>
                <small>{struct ? `${struct.time} · ${struct.marks} marks · ${struct.sections}` : ''}</small>
              </div>
              {student && <div style={{ width: 260 }}><Bar value={cov} /><small>{cov}% of its lessons done{cov < 75 ? ' — finish more first' : ''}</small></div>}
            </div>
            {list.length === 0 ? <Empty>No papers yet.</Empty> : (
              <div className="stack mt">
                {list.map(m => {
                  const a = m.attempt
                  return (
                    <div key={m.id} className="spread mock-row">
                      <div>
                        <strong>{m.title}</strong>
                        {m.description && <div className="muted" style={{ fontSize: '0.85rem' }}>{m.description}</div>}
                      </div>
                      <div className="row">
                        {a?.status === 'marked' && <><span>{a.percent}%</span><Grade g={a.grade} /><span className="badge">{a.self_marked ? 'Self-marked' : 'Assessor marked'}</span></>}
                        {a?.status === 'submitted' && <span className="badge ok">Awaiting marking</span>}
                        {canSit && !a && <button className="sm" onClick={() => start(m)}>Start ({m.duration_minutes} min)</button>}
                        {canSit && a?.status === 'in_progress' && <Link className="btn sm" to={`/exams/${m.id}/take`}>Continue</Link>}
                        {a && a.status !== 'in_progress' && <Link className="btn secondary sm" to={`/attempts/${a.id}`}>{a.status === 'submitted' && profile?.role !== 'parent' ? 'Mark it' : 'Review'}</Link>}
                        {self && a && a.status !== 'in_progress' && <button className="secondary sm" onClick={() => start(m)}>Sit again</button>}
                        {!canSit && !a && <span className="muted" style={{ fontSize: '0.85rem' }}>Not sat</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </>
  )
}
