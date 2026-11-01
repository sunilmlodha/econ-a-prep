import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, type Attempt, type Question } from '../lib/supabase'
import { Alert, Grade, Loading, PageHead, fmtDateTime } from '../components/ui'

interface Ans { question_id: string; response: string | null; awarded_marks: number | null; comment: string | null }
interface Key { question_id: string; answer: string | null; explanation: string | null; mark_scheme: string | null }

export default function AttemptView() {
  const { id } = useParams()
  const { profile } = useAuth()
  const [a, setA] = useState<(Attempt & { exams: { title: string; created_by: string; level: string }; profiles: { full_name: string } }) | null>(null)
  const [qs, setQs] = useState<Question[]>([])
  const [ans, setAns] = useState<Record<string, Ans>>({})
  const [keys, setKeys] = useState<Record<string, Key>>({})
  const [marks, setMarks] = useState<Record<string, { m: string; c: string }>>({})
  const [feedback, setFeedback] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('attempts').select('*, exams(title, created_by, level), profiles!attempts_student_id_fkey(full_name)').eq('id', id!).single()
    if (!data) return setError('Attempt not found.')
    setA(data as typeof a)
    setFeedback(data.feedback ?? '')
    const [{ data: eq }, { data: an }] = await Promise.all([
      supabase.from('exam_questions').select('position, questions(*)').eq('exam_id', data.exam_id).order('position'),
      supabase.from('attempt_answers').select('*').eq('attempt_id', id!),
    ])
    const list = ((eq ?? []) as unknown as { questions: Question }[]).map(x => x.questions)
    setQs(list)
    const am: Record<string, Ans> = {}
    const mm: Record<string, { m: string; c: string }> = {}
    for (const r of (an ?? []) as Ans[]) {
      am[r.question_id] = r
      mm[r.question_id] = { m: r.awarded_marks != null ? String(r.awarded_marks) : '', c: r.comment ?? '' }
    }
    setAns(am); setMarks(mm)
    const { data: k } = await supabase.from('question_keys').select('*').in('question_id', list.map(q => q.id))
    const km: Record<string, Key> = {}
    for (const r of (k ?? []) as Key[]) km[r.question_id] = r
    setKeys(km)
  }, [id])
  useEffect(() => { load() }, [load])

  const canMark = profile && (profile.role === 'assessor' || profile.role === 'admin') && a?.status !== 'in_progress'

  async function saveMarks() {
    setBusy(true); setError(''); setOk('')
    const payload = qs.filter(q => q.type !== 'mcq' && marks[q.id]?.m !== '' && marks[q.id]?.m != null)
      .map(q => ({ question_id: q.id, awarded_marks: Number(marks[q.id].m), comment: marks[q.id].c || null }))
    const { error } = await supabase.rpc('mark_attempt', { aid: id, marks: payload, overall_feedback: feedback || null })
    setBusy(false)
    if (error) return setError(errMsg(error))
    setOk('Marks saved.'); load()
  }

  if (error && !a) return <Alert kind="error">{error}</Alert>
  if (!a) return <Loading />
  let lastContext = ''

  return (
    <>
      <PageHead title={a.exams.title} sub={`${a.profiles?.full_name ?? ''} · submitted ${fmtDateTime(a.submitted_at)}`}>
        <Link className="btn secondary" to="/exams">Back to exams</Link>
      </PageHead>
      <div className="grid g4">
        <div className="card stat"><div className="label">Status</div><div className="value" style={{ fontSize: '1.2rem' }}>{a.status === 'marked' ? 'Marked' : a.status === 'submitted' ? 'Awaiting marking' : 'In progress'}</div></div>
        <div className="card stat"><div className="label">Score</div><div className="value">{a.score ?? '—'}<small>/{a.max_score}</small></div></div>
        <div className="card stat"><div className="label">Percentage</div><div className="value">{a.percent != null ? `${a.percent}%` : '—'}</div></div>
        <div className="card stat"><div className="label">Indicative grade</div><div className="value"><Grade g={a.grade} /></div></div>
      </div>
      {a.feedback && !canMark && <div className="card mt"><h2>Assessor feedback</h2><p style={{ whiteSpace: 'pre-wrap' }}>{a.feedback}</p></div>}
      <Alert kind="error">{error}</Alert>
      <Alert kind="success">{ok}</Alert>

      {qs.map((q, i) => {
        const r = ans[q.id]
        const k = keys[q.id]
        const showContext = q.context && q.context !== lastContext
        if (q.context) lastContext = q.context
        return (
          <div className="card mt" key={q.id}>
            {showContext && <details><summary className="muted">Extract</summary><div className="context mt">{q.context}</div></details>}
            <div className="spread mt">
              <strong>Question {i + 1}</strong>
              <span className={`badge ${r?.awarded_marks == null ? 'ok' : r.awarded_marks === q.marks ? 'good' : r.awarded_marks === 0 ? 'bad' : 'ok'}`}>
                {r?.awarded_marks ?? '?'}/{q.marks}
              </span>
            </div>
            <p className="question">{q.prompt}</p>
            {q.type === 'mcq' && q.options ? (
              <div className="stack">
                {q.options.map(o => {
                  const letter = o.trim()[0]
                  const cls = k?.answer === letter ? 'right' : r?.response === letter ? 'wrong' : ''
                  return <div key={o} className={`option ${cls}`}>{r?.response === letter ? '● ' : '○ '}{o}</div>
                })}
                {k?.explanation && <small>{k.explanation}</small>}
              </div>
            ) : (
              <>
                <div className="scheme" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>{r?.response || <span className="muted">No answer</span>}</div>
                {canMark ? (
                  <div className="form cols mt">
                    <label>Marks (0–{q.marks})<input type="number" min={0} max={q.marks} step={0.5} value={marks[q.id]?.m ?? ''}
                      onChange={e => setMarks({ ...marks, [q.id]: { ...(marks[q.id] ?? { c: '' }), m: e.target.value } })} /></label>
                    <label style={{ gridColumn: 'span 2' }}>Comment<input value={marks[q.id]?.c ?? ''}
                      onChange={e => setMarks({ ...marks, [q.id]: { ...(marks[q.id] ?? { m: '' }), c: e.target.value } })} placeholder="KAA/E feedback" /></label>
                  </div>
                ) : r?.comment && <p className="mt"><strong>Comment:</strong> {r.comment}</p>}
                {k?.mark_scheme && <details className="mt"><summary>Mark scheme</summary><div className="scheme mt">{k.mark_scheme}</div></details>}
              </>
            )}
          </div>
        )
      })}

      {canMark && (
        <div className="card mt">
          <h2>Overall feedback</h2>
          <textarea value={feedback} onChange={e => setFeedback(e.target.value)} placeholder="Strengths, targets, next steps" />
          <button className="mt" onClick={saveMarks} disabled={busy}>{busy ? 'Saving…' : 'Save marks & feedback'}</button>
        </div>
      )}
    </>
  )
}
