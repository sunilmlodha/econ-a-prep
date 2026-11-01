import { useEffect, useMemo, useState } from 'react'
import { supabase, errMsg, type Question, type QuestionKey } from '../lib/supabase'
import { THEMES, topicByCode } from '../lib/spec'
import { Alert, Empty, Loading, PageHead } from '../components/ui'

const TYPE_LABEL = { mcq: 'Multiple choice', short: 'Short answer', data: 'Data response', essay: '25-mark essay' }

export default function Practice() {
  const [qs, setQs] = useState<Question[] | null>(null)
  const [theme, setTheme] = useState(0)
  const [type, setType] = useState<string>('mcq')
  const [i, setI] = useState(0)

  useEffect(() => {
    supabase.from('questions').select('*').order('id').then(({ data }) => setQs((data as Question[]) ?? []))
  }, [])

  const list = useMemo(() => (qs ?? []).filter(q => (!theme || q.theme === theme) && (!type || q.type === type)), [qs, theme, type])
  useEffect(() => setI(0), [theme, type])

  if (!qs) return <Loading />
  const q = list[i]
  return (
    <>
      <PageHead title="Practice bank" sub={`${qs.length} original exam-style questions mapped to the specification`}>
        <select value={theme} onChange={e => setTheme(Number(e.target.value))} style={{ width: 'auto' }} aria-label="Theme">
          <option value={0}>All themes</option>
          {THEMES.map(t => <option key={t.no} value={t.no}>Theme {t.no}</option>)}
        </select>
        <select value={type} onChange={e => setType(e.target.value)} style={{ width: 'auto' }} aria-label="Question type">
          <option value="">All types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </PageHead>
      {!q ? <Empty>No questions match these filters.</Empty> : (
        <>
          <div className="spread" style={{ marginBottom: 12 }}>
            <small>Question {i + 1} of {list.length}</small>
            <div className="row">
              <button className="secondary sm" disabled={i === 0} onClick={() => setI(i - 1)}>← Previous</button>
              <button className="secondary sm" onClick={() => setI(Math.floor(Math.random() * list.length))}>Random</button>
              <button className="secondary sm" disabled={i >= list.length - 1} onClick={() => setI(i + 1)}>Next →</button>
            </div>
          </div>
          <PracticeCard key={q.id} q={q} />
        </>
      )}
    </>
  )
}

function PracticeCard({ q }: { q: Question }) {
  const [pick, setPick] = useState('')
  const [text, setText] = useState('')
  const [key, setKey] = useState<QuestionKey | null>(null)
  const [error, setError] = useState('')
  const topic = topicByCode(q.topic_code)

  async function reveal() {
    const { data, error } = await supabase.rpc('reveal_key', { qid: q.id })
    if (error) return setError(errMsg(error))
    setKey((data as QuestionKey[])[0] ?? { answer: null, explanation: null, mark_scheme: 'No mark scheme recorded.' })
  }

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <span className="badge brand">Theme {q.theme}</span>
        <span className="badge">{q.topic_code} {topic?.title}</span>
        <span className="badge">{TYPE_LABEL[q.type]}</span>
        <span className="badge ok">{q.marks} mark{q.marks > 1 ? 's' : ''}</span>
      </div>
      {q.context && <div className="context" style={{ marginBottom: 12 }}>{q.context}</div>}
      <p className="question"><strong>{q.prompt}</strong></p>
      {q.type === 'mcq' && q.options ? (
        <div className="stack">
          {q.options.map(o => {
            const letter = o.trim()[0]
            const cls = key ? (letter === key.answer ? 'right' : letter === pick ? 'wrong' : '') : pick === letter ? 'picked' : ''
            return (
              <label key={o} className={`option ${cls}`}>
                <input type="radio" name={q.id} checked={pick === letter} disabled={!!key} onChange={() => setPick(letter)} />{o}
              </label>
            )
          })}
        </div>
      ) : (
        <textarea value={text} onChange={e => setText(e.target.value)} style={{ minHeight: q.marks >= 12 ? 240 : 120 }}
          placeholder="Plan or write your answer, then compare it with the mark scheme." aria-label="Your answer" />
      )}
      <Alert kind="error">{error}</Alert>
      {!key ? (
        <button className="mt" onClick={reveal} disabled={q.type === 'mcq' && !pick}>{q.type === 'mcq' ? 'Check answer' : 'Show mark scheme'}</button>
      ) : (
        <div className="mt stack">
          {q.type === 'mcq' && (
            <Alert kind={pick === key.answer ? 'success' : 'error'}>
              {pick === key.answer ? 'Correct!' : `Not quite — the answer is ${key.answer}.`} {key.explanation}
            </Alert>
          )}
          {key.mark_scheme && <div className="scheme"><strong>Mark scheme / indicative content</strong>{'\n'}{key.mark_scheme}</div>}
        </div>
      )}
    </div>
  )
}
