import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, type ClassRow, type Exam, type Question } from '../lib/supabase'
import { THEMES } from '../lib/spec'
import { Alert, Loading, PageHead } from '../components/ui'

const toLocal = (s: string | null) => (s ? new Date(new Date(s).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
const fromLocal = (s: string) => (s ? new Date(s).toISOString() : null)

export default function ExamBuilder() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [qs, setQs] = useState<Question[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [f, setF] = useState({
    title: '', description: '', level: 'A', kind: 'quiz', class_id: '', duration_minutes: '30',
    opens_at: '', closes_at: '', published: false,
  })
  const [filter, setFilter] = useState({ theme: 0, type: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.from('classes').select('*').eq('assessor_id', profile!.id).then(({ data }) => setClasses((data as ClassRow[]) ?? []))
    supabase.from('questions').select('*').order('id').then(({ data }) => setQs((data as Question[]) ?? []))
    if (id) {
      supabase.from('exams').select('*, exam_questions(question_id, position)').eq('id', id).single().then(({ data }) => {
        if (!data) return
        const e = data as Exam & { exam_questions: { question_id: string; position: number }[] }
        setF({
          title: e.title, description: e.description ?? '', level: e.level, kind: e.kind, class_id: e.class_id ?? '',
          duration_minutes: e.duration_minutes ? String(e.duration_minutes) : '', opens_at: toLocal(e.opens_at),
          closes_at: toLocal(e.closes_at), published: e.published,
        })
        setPicked([...e.exam_questions].sort((a, b) => a.position - b.position).map(x => x.question_id))
      })
    }
  }, [id, profile])

  const byId = useMemo(() => new Map((qs ?? []).map(q => [q.id, q])), [qs])
  const visible = (qs ?? []).filter(q => (!filter.theme || q.theme === filter.theme) && (!filter.type || q.type === filter.type))
  const total = picked.reduce((s, x) => s + (byId.get(x)?.marks ?? 0), 0)

  function toggle(qid: string) {
    setPicked(p => (p.includes(qid) ? p.filter(x => x !== qid) : [...p, qid]))
  }

  function autoQuiz() {
    const themes = f.level === 'AS' ? [1, 2] : [1, 2, 3, 4]
    const pool = (qs ?? []).filter(q => q.type === 'mcq' && themes.includes(q.theme))
    const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, 15)
    setPicked(shuffled.map(q => q.id))
  }

  async function save() {
    if (!f.title.trim()) return setError('Give the exam a title.')
    if (!picked.length) return setError('Add at least one question.')
    setBusy(true); setError('')
    const row = {
      title: f.title.trim(), description: f.description || null, level: f.level, kind: f.kind,
      class_id: f.class_id || null, duration_minutes: f.duration_minutes ? Number(f.duration_minutes) : null,
      opens_at: fromLocal(f.opens_at), closes_at: fromLocal(f.closes_at), published: f.published,
    }
    try {
      let examId = id
      if (id) {
        const { error } = await supabase.from('exams').update(row).eq('id', id)
        if (error) throw error
        const { error: de } = await supabase.from('exam_questions').delete().eq('exam_id', id)
        if (de) throw de
      } else {
        const { data, error } = await supabase.from('exams').insert(row).select('id').single()
        if (error) throw error
        examId = data.id
      }
      const { error: qe } = await supabase.from('exam_questions').insert(picked.map((q, i) => ({ exam_id: examId, question_id: q, position: i })))
      if (qe) throw qe
      nav('/exams')
    } catch (e) {
      setError(errMsg(e))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!id || !confirm('Delete this exam and all attempts?')) return
    await supabase.from('exams').delete().eq('id', id)
    nav('/exams')
  }

  if (!qs) return <Loading />
  return (
    <>
      <PageHead title={id ? 'Edit exam' : 'New exam'} sub={`${picked.length} questions · ${total} marks`}>
        {id && <button className="danger" onClick={remove}>Delete</button>}
        <button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save exam'}</button>
      </PageHead>
      <Alert kind="error">{error}</Alert>
      <div className="card form">
        <div className="form cols">
          <label>Title<input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="Theme 1 mock — markets" /></label>
          <label>Type
            <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}>
              <option value="quiz">Quiz</option><option value="homework">Homework</option>
              <option value="mock">Mock exam</option><option value="past_paper">Past paper style</option>
            </select>
          </label>
          <label>Level
            <select value={f.level} onChange={e => setF({ ...f, level: e.target.value })}>
              <option value="AS">AS level</option><option value="A">A level</option>
            </select>
          </label>
          <label>Set for
            <select value={f.class_id} onChange={e => setF({ ...f, class_id: e.target.value })}>
              <option value="">All students (any class)</option>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>Time limit (minutes)<input type="number" min={0} value={f.duration_minutes} onChange={e => setF({ ...f, duration_minutes: e.target.value })} placeholder="No limit" /></label>
          <label>Opens<input type="datetime-local" value={f.opens_at} onChange={e => setF({ ...f, opens_at: e.target.value })} /></label>
          <label>Closes<input type="datetime-local" value={f.closes_at} onChange={e => setF({ ...f, closes_at: e.target.value })} /></label>
        </div>
        <label>Instructions<textarea value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
        <label className="inline"><input type="checkbox" checked={f.published} onChange={e => setF({ ...f, published: e.target.checked })} /> Published (visible to students)</label>
      </div>

      <div className="grid g2 mt" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="spread"><h2>Question bank</h2><button className="secondary sm" onClick={autoQuiz}>Auto-pick 15 MCQs</button></div>
          <div className="row" style={{ marginBottom: 10 }}>
            <select value={filter.theme} onChange={e => setFilter({ ...filter, theme: Number(e.target.value) })} style={{ width: 'auto' }} aria-label="Theme filter">
              <option value={0}>All themes</option>
              {THEMES.map(t => <option key={t.no} value={t.no}>Theme {t.no}</option>)}
            </select>
            <select value={filter.type} onChange={e => setFilter({ ...filter, type: e.target.value })} style={{ width: 'auto' }} aria-label="Type filter">
              <option value="">All types</option><option value="mcq">MCQ</option><option value="short">Short</option>
              <option value="data">Data response</option><option value="essay">Essay</option>
            </select>
          </div>
          <div style={{ maxHeight: 520, overflowY: 'auto' }}>
            {visible.map(q => (
              <label key={q.id} className="plan-item" style={{ fontWeight: 400 }}>
                <input type="checkbox" checked={picked.includes(q.id)} onChange={() => toggle(q.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.9rem' }}>{q.prompt.length > 160 ? q.prompt.slice(0, 160) + '…' : q.prompt}</div>
                  <small>{q.id} · {q.topic_code} · {q.type} · {q.marks} marks</small>
                </div>
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <h2>Selected ({picked.length})</h2>
          {picked.map((qid, i) => {
            const q = byId.get(qid)
            return (
              <div key={qid} className="plan-item">
                <strong>{i + 1}.</strong>
                <div style={{ flex: 1, fontSize: '0.9rem' }}>{q?.prompt.slice(0, 120)}<div><small>{q?.type} · {q?.marks} marks</small></div></div>
                <div className="row">
                  <button className="ghost sm" disabled={i === 0} aria-label="Move up" onClick={() => setPicked(p => { const n = [...p];[n[i - 1], n[i]] = [n[i], n[i - 1]]; return n })}>↑</button>
                  <button className="ghost sm" aria-label="Remove" onClick={() => toggle(qid)}>✕</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
