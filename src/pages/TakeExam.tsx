import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, type Exam, type Question } from '../lib/supabase'
import { Alert, Loading, PageHead } from '../components/ui'

export default function TakeExam() {
  const { id } = useParams()
  const nav = useNavigate()
  const [exam, setExam] = useState<Exam | null>(null)
  const [qs, setQs] = useState<Question[]>([])
  const [aid, setAid] = useState('')
  const [startedAt, setStartedAt] = useState<number>(0)
  const [skew, setSkew] = useState(0) // server clock minus device clock, ms
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState('')
  const [left, setLeft] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const timers = useRef<Record<string, number>>({})
  const submitted = useRef(false)
  const answersRef = useRef(answers)
  answersRef.current = answers

  const inflight = useRef(new Set<Promise<boolean>>())

  useEffect(() => {
    (async () => {
      const { data: attemptId, error } = await supabase.rpc('start_attempt', { eid: id })
      if (error) return setError(errMsg(error))
      const t0 = Date.now()
      const [e, eq, a, ans, now] = await Promise.all([
        supabase.from('exams').select('*').eq('id', id!).single(),
        supabase.from('exam_questions').select('position, questions(*)').eq('exam_id', id!).order('position'),
        supabase.from('attempts').select('started_at').eq('id', attemptId as string).single(),
        supabase.from('attempt_answers').select('question_id, response').eq('attempt_id', attemptId as string),
        supabase.rpc('server_now'),
      ])
      const failed = [e, eq, a, ans].find(r => r.error)
      if (failed?.error) return setError(`Could not load the exam: ${errMsg(failed.error)}. Refresh to try again.`)
      const m: Record<string, string> = {}
      for (const r of ans.data ?? []) m[r.question_id] = r.response ?? ''
      // set everything together so the student never types into a half-loaded page
      setAid(attemptId as string)
      setAnswers(m)
      setQs(((eq.data ?? []) as unknown as { questions: Question }[]).map(x => x.questions))
      setStartedAt(new Date(a.data!.started_at).getTime())
      if (now.data) setSkew(new Date(now.data as string).getTime() - (t0 + Date.now()) / 2)
      setExam(e.data as Exam)
    })()
  }, [id])

  const save = useCallback((qid: string, value: string) => {
    const p = (async () => {
      const { error } = await supabase.rpc('save_answer', { aid, qid, resp: value })
      if (error) { setError(errMsg(error)); return false }
      return true
    })()
    inflight.current.add(p)
    p.finally(() => inflight.current.delete(p))
    return p
  }, [aid])

  const submit = useCallback(async (auto = false) => {
    if (submitted.current) return
    if (!auto && !confirm('Submit your answers? You cannot change them afterwards.')) return
    submitted.current = true
    setSubmitting(true)
    // flush debounced saves, then wait for every save still on the wire
    for (const [qid, t] of Object.entries(timers.current)) {
      clearTimeout(t)
      delete timers.current[qid]
      save(qid, answersRef.current[qid] ?? '')
    }
    const results = await Promise.all([...inflight.current])
    if (!auto && results.includes(false)) {
      submitted.current = false
      setSubmitting(false)
      return setError('Some answers could not be saved. Check your connection and press Submit again.')
    }
    const { error } = await supabase.rpc('submit_attempt', { aid })
    if (error && !/already submitted/i.test(error.message)) {
      // an automatic submit is not retried every second; the student can press Submit
      if (!auto) submitted.current = false
      setSubmitting(false)
      return setError(errMsg(error))
    }
    nav(`/attempts/${aid}`, { replace: true })
  }, [aid, nav, save])

  // countdown to whichever comes first: the time limit or the closing time
  useEffect(() => {
    if (!exam || !startedAt) return
    const ends = [
      exam.duration_minutes ? startedAt + exam.duration_minutes * 60_000 : Infinity,
      exam.closes_at ? new Date(exam.closes_at).getTime() : Infinity,
    ]
    const end = Math.min(...ends)
    if (end === Infinity) return
    const tick = () => {
      const s = Math.max(0, Math.round((end - (Date.now() + skew)) / 1000))
      setLeft(s)
      if (s === 0) submit(true)
    }
    tick()
    const h = setInterval(tick, 1000)
    return () => clearInterval(h)
  }, [exam, startedAt, skew, submit])

  function answer(qid: string, value: string) {
    setAnswers(a => ({ ...a, [qid]: value }))
    setSaved('saving')
    clearTimeout(timers.current[qid])
    timers.current[qid] = window.setTimeout(async () => {
      delete timers.current[qid]
      if (await save(qid, value)) setSaved('saved')
    }, 700)
  }

  if (error && !exam) return <><PageHead title="Exam" /><Alert kind="error">{error}</Alert></>
  if (!exam) return <Loading />
  const answered = qs.filter(q => (answers[q.id] ?? '').trim()).length
  const total = qs.reduce((s, q) => s + q.marks, 0)
  const mm = left != null ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : null
  let lastContext = ''

  return (
    <>
      <div className="card" style={{ position: 'sticky', top: 0, zIndex: 10, marginBottom: 16 }}>
        <div className="spread">
          <div><strong>{exam.title}</strong><div className="muted" style={{ fontSize: '0.85rem' }}>{qs.length} questions · {total} marks · {answered} answered · {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'All changes saved' : ''}</div></div>
          <div className="row">
            {mm && <span className={`timer ${left! < 300 ? 'low' : ''}`} aria-live="polite">⏱ {mm}</span>}
            <button onClick={() => submit(false)} disabled={submitting}>{submitting ? 'Submitting…' : 'Submit'}</button>
          </div>
        </div>
      </div>
      {exam.description && <Alert>{exam.description}</Alert>}
      <Alert kind="error">{error}</Alert>
      {qs.map((q, i) => {
        const showContext = q.context && q.context !== lastContext
        if (q.context) lastContext = q.context
        return (
          <div className="card" key={q.id}>
            {showContext && <div className="context" style={{ marginBottom: 12 }}>{q.context}</div>}
            <div className="spread"><strong>Question {i + 1}</strong><span className="badge ok">{q.marks} mark{q.marks > 1 ? 's' : ''}</span></div>
            <p className="question mt">{q.prompt}</p>
            {q.type === 'mcq' && q.options ? (
              <div className="stack">
                {q.options.map(o => {
                  const letter = o.trim()[0]
                  return (
                    <label key={o} className={`option ${answers[q.id] === letter ? 'picked' : ''}`}>
                      <input type="radio" name={q.id} checked={answers[q.id] === letter} onChange={() => answer(q.id, letter)} />{o}
                    </label>
                  )
                })}
              </div>
            ) : (
              <textarea value={answers[q.id] ?? ''} onChange={e => answer(q.id, e.target.value)} style={{ minHeight: q.marks >= 12 ? 260 : 130 }} aria-label={`Answer to question ${i + 1}`} />
            )}
          </div>
        )
      })}
    </>
  )
}
