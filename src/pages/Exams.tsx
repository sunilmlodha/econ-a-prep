import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, type Attempt, type Exam } from '../lib/supabase'
import { Empty, Grade, Loading, PageHead, fmtDateTime, useViewableStudents, StudentPicker } from '../components/ui'

type ExamRow = Exam & { classes: { name: string } | null; exam_questions: { count: number }[] }
type AttemptRow = Attempt & { profiles: { full_name: string } | null; exams: { title: string; level: string } | null }

const KIND = { quiz: 'Quiz', homework: 'Homework', mock: 'Mock exam', past_paper: 'Past paper' }

export default function Exams() {
  const { profile } = useAuth()
  if (profile?.role === 'assessor' || profile?.role === 'admin') return <StaffExams />
  if (profile?.role === 'parent') return <ParentExams />
  return <StudentExams />
}

function StaffExams() {
  const { profile } = useAuth()
  const [exams, setExams] = useState<ExamRow[] | null>(null)
  const [attempts, setAttempts] = useState<AttemptRow[]>([])
  const [open, setOpen] = useState<string | null>(null)

  useEffect(() => {
    supabase.from('exams').select('*, classes(name), exam_questions(count)').eq('created_by', profile!.id).order('created_at', { ascending: false })
      .then(({ data }) => setExams((data as ExamRow[]) ?? []))
    supabase.from('attempts').select('*, profiles!attempts_student_id_fkey(full_name), exams!inner(title, level, created_by)')
      .eq('exams.created_by', profile!.id).neq('status', 'in_progress').order('submitted_at', { ascending: false })
      .then(({ data }) => setAttempts((data as AttemptRow[]) ?? []))
  }, [profile])

  if (!exams) return <Loading />
  return (
    <>
      <PageHead title="Exams & marking" sub="Set quizzes, homework and timed mocks; MCQs are auto-marked, written answers come to you">
        <Link className="btn" to="/exams/new">New exam</Link>
      </PageHead>
      {exams.length === 0 ? <Empty>No exams yet. Build one from the question bank.</Empty> : (
        <div className="card table-wrap">
          <table>
            <thead><tr><th>Exam</th><th>For</th><th>Questions</th><th>Window</th><th>Submissions</th><th /></tr></thead>
            <tbody>
              {exams.map(e => {
                const subs = attempts.filter(a => a.exam_id === e.id)
                const toMark = subs.filter(a => a.status === 'submitted').length
                return (
                  <tr key={e.id}>
                    <td><strong>{e.title}</strong><div className="row" style={{ marginTop: 4 }}><span className="badge">{KIND[e.kind]}</span><span className="badge">{e.level === 'AS' ? 'AS' : 'A level'}</span>{e.published ? <span className="badge good">Published</span> : <span className="badge ok">Draft</span>}</div></td>
                    <td>{e.classes?.name ?? 'All my students'}</td>
                    <td>{e.exam_questions?.[0]?.count ?? 0}{e.duration_minutes ? <div className="muted">{e.duration_minutes} min</div> : null}</td>
                    <td style={{ fontSize: '0.85rem' }}>{e.opens_at ? fmtDateTime(e.opens_at) : 'Now'} → {e.closes_at ? fmtDateTime(e.closes_at) : 'open'}</td>
                    <td>{subs.length}{toMark > 0 && <span className="badge bad" style={{ marginLeft: 6 }}>{toMark} to mark</span>}</td>
                    <td><div className="row">
                      <Link className="btn secondary sm" to={`/exams/${e.id}/edit`}>Edit</Link>
                      {subs.length > 0 && <button className="sm secondary" onClick={() => setOpen(open === e.id ? null : e.id)}>Results</button>}
                    </div></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {open && (
        <div className="card">
          <h2>Results — {exams.find(e => e.id === open)?.title}</h2>
          <AttemptTable rows={attempts.filter(a => a.exam_id === open)} showStudent />
        </div>
      )}
    </>
  )
}

function AttemptTable({ rows, showStudent }: { rows: AttemptRow[]; showStudent?: boolean }) {
  if (!rows.length) return <Empty>No attempts yet.</Empty>
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{showStudent ? <th>Student</th> : <th>Exam</th>}<th>Submitted</th><th>Status</th><th>Score</th><th>Grade</th><th /></tr></thead>
        <tbody>
          {rows.map(a => (
            <tr key={a.id}>
              <td>{showStudent ? a.profiles?.full_name : a.exams?.title}</td>
              <td>{fmtDateTime(a.submitted_at)}</td>
              <td><span className={`badge ${a.status === 'marked' ? 'good' : 'ok'}`}>{a.status === 'marked' ? 'Marked' : 'Awaiting marking'}</span></td>
              <td>{a.score ?? '—'}/{a.max_score}{a.percent != null && <span className="muted"> ({a.percent}%)</span>}</td>
              <td><Grade g={a.grade} /></td>
              <td><Link className="btn secondary sm" to={`/attempts/${a.id}`}>Open</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function StudentExams() {
  const { profile } = useAuth()
  const [exams, setExams] = useState<ExamRow[] | null>(null)
  const [attempts, setAttempts] = useState<AttemptRow[]>([])

  useEffect(() => {
    supabase.from('exams').select('*, classes(name), exam_questions(count)').eq('published', true).order('created_at', { ascending: false })
      .then(({ data }) => setExams((data as ExamRow[]) ?? []))
    supabase.from('attempts').select('*, exams(title, level)').eq('student_id', profile!.id).order('started_at', { ascending: false })
      .then(({ data }) => setAttempts((data as AttemptRow[]) ?? []))
  }, [profile])

  if (!exams) return <Loading />
  const now = new Date().toISOString()
  return (
    <>
      <PageHead title="Exams" sub="Quizzes, homework and timed mocks set by your assessors" />
      <div className="card">
        <h2>Available</h2>
        {exams.length === 0 ? <Empty>No exams have been set for you yet.</Empty> : (
          <div className="stack">
            {exams.map(e => {
              const mine = attempts.find(a => a.exam_id === e.id)
              const closed = (e.closes_at && e.closes_at < now) || (e.opens_at && e.opens_at > now)
              return (
                <div key={e.id} className="spread" style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                  <div>
                    <strong>{e.title}</strong>
                    <div className="muted" style={{ fontSize: '0.85rem' }}>
                      {KIND[e.kind]} · {e.exam_questions?.[0]?.count ?? 0} questions{e.duration_minutes ? ` · ${e.duration_minutes} min timed` : ''}
                      {e.classes?.name ? ` · ${e.classes.name}` : ''}{e.closes_at ? ` · closes ${fmtDateTime(e.closes_at)}` : ''}
                    </div>
                    {e.description && <div style={{ fontSize: '0.9rem' }}>{e.description}</div>}
                  </div>
                  {mine && mine.status !== 'in_progress' ? <Link className="btn secondary sm" to={`/attempts/${mine.id}`}>View result</Link>
                    : closed ? <span className="badge">{e.opens_at && e.opens_at > now ? `Opens ${fmtDateTime(e.opens_at)}` : 'Closed'}</span>
                      : <Link className="btn sm" to={`/exams/${e.id}/take`}>{mine ? 'Continue' : 'Start'}</Link>}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <div className="card"><h2>My results</h2><AttemptTable rows={attempts.filter(a => a.status !== 'in_progress')} /></div>
    </>
  )
}

function ParentExams() {
  const { students, loading } = useViewableStudents()
  const [sid, setSid] = useState('')
  const [rows, setRows] = useState<AttemptRow[]>([])
  const student = students.find(s => s.id === sid) ?? students[0]
  useEffect(() => {
    if (!student) return
    supabase.from('attempts').select('*, exams(title, level)').eq('student_id', student.id).neq('status', 'in_progress')
      .order('submitted_at', { ascending: false }).then(({ data }) => setRows((data as AttemptRow[]) ?? []))
  }, [student])
  if (loading) return <Loading />
  return (
    <>
      <PageHead title="Exam results">{student && <StudentPicker students={students} value={student.id} onChange={setSid} />}</PageHead>
      {!student ? <Empty>No linked students.</Empty> : <div className="card"><AttemptTable rows={rows} /></div>}
    </>
  )
}
