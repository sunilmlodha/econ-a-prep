import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, type Exam, type Profile } from '../lib/supabase'
import { loadStudentSummary, upcomingSessions, type StudentSummary } from '../lib/data'
import { topicsFor, topicByCode, type Level } from '../lib/spec'
import { KIND_LABEL, localIso, type PlanWeek } from '../lib/timetable'
import { Alert, Empty, Grade, Loading, PageHead, Stat, fmtDate, fmtDateTime, useViewableStudents } from '../components/ui'

export default function Dashboard() {
  const { profile } = useAuth()
  if (!profile) return null
  if (profile.role === 'parent') return <ParentHome />
  if (profile.role === 'assessor' || profile.role === 'admin') return <AssessorHome />
  return <StudentHome student={profile} />
}

function Sessions({ sessions }: { sessions: Awaited<ReturnType<typeof upcomingSessions>> }) {
  if (!sessions.length) return <Empty>No upcoming sessions.</Empty>
  return (
    <div className="stack">
      {sessions.map(s => (
        <div key={s.id} className="spread">
          <div>
            <strong>{s.title}</strong>
            <div className="muted" style={{ fontSize: '0.85rem' }}>
              {s.classes?.name} · {fmtDateTime(s.starts_at)}{s.topic_code ? ` · ${s.topic_code} ${topicByCode(s.topic_code)?.title ?? ''}` : ''}
            </div>
          </div>
          <span className={`badge ${s.classes?.kind === 'tuition' ? 'ok' : 'brand'}`}>{s.classes?.kind === 'tuition' ? 'Tuition' : 'Class'}</span>
        </div>
      ))}
    </div>
  )
}

function StudentHome({ student }: { student: Profile }) {
  const level = (student.year_group ?? 'A') as Level
  const [sum, setSum] = useState<StudentSummary | null>(null)
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof upcomingSessions>>>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [plan, setPlan] = useState<{ plan: PlanWeek[]; done: string[] } | null>(null)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    loadStudentSummary(student.id, level).then(setSum).catch(e => setLoadError(errMsg(e)))
    upcomingSessions().then(setSessions)
    supabase.from('exams').select('*').eq('published', true).order('created_at', { ascending: false }).limit(20)
      .then(({ data }) => setExams((data as Exam[]) ?? []))
    supabase.from('study_plans').select('plan, done').eq('student_id', student.id).eq('active', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle()
      .then(({ data }) => setPlan(data as { plan: PlanWeek[]; done: string[] } | null))
  }, [student.id, level])

  if (loadError) return <Alert kind="error">Could not load your progress: {loadError}. Refresh to try again.</Alert>
  if (!sum) return <Loading />
  const sat = new Set(sum.attempts.filter(a => a.status !== 'in_progress').map(a => a.exam_id))
  const openExams = exams.filter(e => !sat.has(e.id) && (!e.closes_at || new Date(e.closes_at) > new Date()))
  const topics = topicsFor(level)
  const covered = topics.filter(t => (sum.progress[t.code] ?? 0) >= 3).length
  const weak = topics.filter(t => (sum.progress[t.code] ?? 0) <= 2).slice(0, 5)
  const today = localIso()
  const upcoming = plan?.plan.flatMap(w => w.items).filter(i => i.date >= today && !plan.done.includes(i.id)).slice(0, 5) ?? []

  return (
    <>
      <PageHead title={`Hello, ${student.full_name.split(' ')[0] || 'there'}`} sub={`${level === 'AS' ? 'AS level (8EC0)' : 'A level (9EC0)'} Economics A${student.exam_year ? ` · exams ${student.exam_year}` : ''}`} />
      <div className="grid g4">
        <Stat label="Predicted grade" value={<Grade g={sum.predicted} />} sub={sum.avgPct != null ? `${sum.avgPct}% average of recent papers` : 'Log a past paper to see this'} />
        <Stat label="Target" value={student.target_grade ?? '—'} sub={<Link to="/profile">Set target</Link>} />
        <Stat label="Topics secure" value={`${covered}/${topics.length}`} sub="Confidence 3+ out of 5" />
        <Stat label="Attendance" value={sum.attendancePct != null ? `${sum.attendancePct}%` : '—'} sub={`${sum.attendance.length} sessions recorded`} />
      </div>
      <div className="grid g2 mt">
        <div className="card">
          <div className="spread"><h2>Next on your timetable</h2><Link to="/timetable">Open</Link></div>
          {upcoming.length ? (
            <div className="stack">
              {upcoming.map(i => (
                <div key={i.id} className="spread">
                  <div><span className={`badge kind-${i.kind}`}>{KIND_LABEL[i.kind]}</span> {i.title}</div>
                  <small>{fmtDate(i.date)}</small>
                </div>
              ))}
            </div>
          ) : <Empty>No study plan yet. <Link to="/timetable">Build your timetable</Link>.</Empty>}
        </div>
        <div className="card">
          <div className="spread"><h2>Classes & tuition</h2><Link to="/classes">All</Link></div>
          <Sessions sessions={sessions} />
        </div>
        <div className="card">
          <div className="spread"><h2>Exams to sit</h2><Link to="/exams">All</Link></div>
          {openExams.length ? (
            <div className="stack">
              {openExams.slice(0, 5).map(e => (
                <div key={e.id} className="spread">
                  <div><strong>{e.title}</strong><div className="muted" style={{ fontSize: '0.85rem' }}>{e.kind}{e.duration_minutes ? ` · ${e.duration_minutes} min` : ''}{e.closes_at ? ` · closes ${fmtDateTime(e.closes_at)}` : ''}</div></div>
                  <Link className="btn sm" to={`/exams/${e.id}/take`}>Start</Link>
                </div>
              ))}
            </div>
          ) : <Empty>Nothing due. Try the <Link to="/practice">practice bank</Link>.</Empty>}
        </div>
        <div className="card">
          <div className="spread"><h2>Focus topics</h2><Link to="/syllabus">Tracker</Link></div>
          {weak.length ? (
            <div className="stack">
              {weak.map(t => (
                <div key={t.code} className="spread"><span><code>{t.code}</code> {t.title}</span><span className="badge bad">{sum.progress[t.code] ?? 0}/5</span></div>
              ))}
            </div>
          ) : <Empty>All topics rated 3+. Great work.</Empty>}
        </div>
      </div>
    </>
  )
}

function ParentHome() {
  const { students, loading } = useViewableStudents()
  const [sums, setSums] = useState<Record<string, StudentSummary>>({})
  const [loadError, setLoadError] = useState('')
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof upcomingSessions>>>([])

  useEffect(() => {
    students.forEach(s => loadStudentSummary(s.id, (s.year_group ?? 'A') as Level)
      .then(x => setSums(m => ({ ...m, [s.id]: x })))
      .catch(e => setLoadError(errMsg(e))))
    upcomingSessions(6).then(setSessions)
  }, [students])

  if (loading) return <Loading />
  return (
    <>
      <PageHead title="Parent dashboard" sub="Progress, attendance and reports for your linked students" />
      <Alert kind="error">{loadError && `Could not load progress: ${loadError}`}</Alert>
      {students.length === 0 ? (
        <Empty>No students linked yet. Ask your child for their <strong>link code</strong> (on their Profile page), then add it on <Link to="/profile">Profile & links</Link>.</Empty>
      ) : students.map(s => {
        const x = sums[s.id]
        const last = x?.reports[0]
        return (
          <div className="card" key={s.id}>
            <div className="spread"><h2>{s.full_name}</h2><Link to={`/reports?student=${s.id}`}>Full report</Link></div>
            {!x ? <Loading /> : (
              <>
                <div className="grid g4">
                  <Stat label="Predicted" value={<Grade g={x.predicted} />} sub={x.avgPct != null ? `${x.avgPct}% recent average` : 'No scored papers yet'} />
                  <Stat label="Assessor prediction" value={<Grade g={last?.predicted_grade} />} sub={last ? `${last.period} report` : 'No report yet'} />
                  <Stat label="Attendance" value={x.attendancePct != null ? `${x.attendancePct}%` : '—'} />
                  <Stat label="Papers & exams" value={x.results.length + x.attempts.filter(a => a.status !== 'in_progress').length} sub="completed" />
                </div>
                {last?.comments && <p className="mt"><strong>Latest comment:</strong> {last.comments}</p>}
              </>
            )}
          </div>
        )
      })}
      <div className="card"><h2>Upcoming classes & tuition</h2><Sessions sessions={sessions} /></div>
    </>
  )
}

function AssessorHome() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ classes: 0, students: 0 })
  const [toMark, setToMark] = useState<{ id: string; submitted_at: string; exams: { title: string }; profiles: { full_name: string } }[]>([])
  const [sessions, setSessions] = useState<Awaited<ReturnType<typeof upcomingSessions>>>([])

  useEffect(() => {
    if (!profile) return
    supabase.from('classes').select('id, class_members(student_id)').eq('assessor_id', profile.id).then(({ data }) => {
      const ids = new Set((data ?? []).flatMap(c => (c.class_members as { student_id: string }[]).map(m => m.student_id)))
      setStats({ classes: data?.length ?? 0, students: ids.size })
    })
    supabase.from('attempts').select('id, submitted_at, exams!inner(title, created_by), profiles!attempts_student_id_fkey(full_name)')
      .eq('status', 'submitted').eq('exams.created_by', profile.id).order('submitted_at')
      .then(({ data }) => setToMark((data as unknown as typeof toMark) ?? []))
    upcomingSessions(8).then(setSessions)
  }, [profile])

  return (
    <>
      <PageHead title="Assessor dashboard" sub="Classes, marking and student progress">
        <Link className="btn" to="/exams/new">New exam</Link>
        <Link className="btn secondary" to="/classes">Manage classes</Link>
      </PageHead>
      <div className="grid g4">
        <Stat label="Classes & groups" value={stats.classes} />
        <Stat label="Students" value={stats.students} />
        <Stat label="Awaiting marking" value={toMark.length} />
        <Stat label="Upcoming sessions" value={sessions.length} />
      </div>
      <div className="grid g2 mt">
        <div className="card">
          <h2>Marking queue</h2>
          {toMark.length ? (
            <div className="stack">
              {toMark.map(a => (
                <div key={a.id} className="spread">
                  <div><strong>{a.profiles?.full_name}</strong><div className="muted" style={{ fontSize: '0.85rem' }}>{a.exams?.title} · {fmtDateTime(a.submitted_at)}</div></div>
                  <Link className="btn sm" to={`/attempts/${a.id}`}>Mark</Link>
                </div>
              ))}
            </div>
          ) : <Empty>Nothing to mark.</Empty>}
        </div>
        <div className="card"><h2>Upcoming sessions</h2><Sessions sessions={sessions} /></div>
      </div>
    </>
  )
}
