import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg } from '../lib/supabase'
import { themeTitle, topicByCode } from '../lib/spec'
import { loadLessonIndex, progressStatus, type Lesson as LessonRow, type LessonMeta, type TopicProgress } from '../lib/course'
import Diagram from '../components/Diagram'
import RichText from '../components/RichText'
import { MaterialList } from './Materials'
import { Alert, Loading, PageHead, fmtDate } from '../components/ui'

const LABELS = ['Not started', 'Aware', 'Learning', 'Getting there', 'Confident', 'Exam-ready']

export default function Lesson() {
  const { code } = useParams()
  const { profile } = useAuth()
  const [lesson, setLesson] = useState<LessonRow | null>(null)
  const [index, setIndex] = useState<LessonMeta[]>([])
  const [prog, setProg] = useState<TopicProgress | null>(null)
  const [error, setError] = useState('')
  const isStudent = profile?.role === 'student'

  useEffect(() => {
    setLesson(null); setError('')
    supabase.from('lessons').select('*').eq('topic_code', code!).maybeSingle().then(({ data, error }) => {
      if (error) return setError(errMsg(error))
      if (!data) return setError('This lesson is not available yet.')
      setLesson(data as LessonRow)
      window.scrollTo(0, 0)
    })
    if (isStudent) {
      supabase.from('topic_progress').select('topic_code, confidence, lesson_completed_at').eq('student_id', profile!.id).eq('topic_code', code!).maybeSingle()
        .then(({ data }) => setProg(data as TopicProgress | null))
    }
  }, [code, isStudent, profile])
  useEffect(() => { loadLessonIndex().then(setIndex).catch(() => {}) }, [])

  if (error) return <><PageHead title="Lesson" /><Alert kind="error">{error}</Alert><Link to="/course">Back to the course</Link></>
  if (!lesson) return <Loading />
  const c = lesson.content
  const i = index.findIndex(l => l.topic_code === lesson.topic_code)
  const prev = index[i - 1], next = index[i + 1]
  const topic = topicByCode(lesson.topic_code)

  return (
    <article className="lesson">
      <PageHead title={`${lesson.topic_code} ${lesson.title}`} sub={`Theme ${lesson.theme}: ${themeTitle(lesson.theme)} · ${topic?.section ?? ''} · ${lesson.minutes} min · ${lesson.level === 'AS' ? 'AS and A level' : 'A level only'}`}>
        <Link className="btn secondary" to="/course">All lessons</Link>
      </PageHead>

      <div className="card">
        <p className="lead">{c.overview}</p>
        <h3>By the end of this lesson you can</h3>
        <ul>{c.objectives.map((o, k) => <li key={k}>{o}</li>)}</ul>
      </div>

      {c.sections.map((s, k) => (
        <section className="card" key={k}>
          <h2>{s.heading}</h2>
          <RichText text={s.body} />
        </section>
      ))}

      {!!c.diagrams?.length && (
        <section className="card">
          <h2>Diagrams to master</h2>
          <p className="muted" style={{ fontSize: '0.9rem' }}>Practise drawing each one from memory: label both axes, every curve and the equilibrium points.</p>
          <div className="grid g2">{c.diagrams.map((d, k) => <Diagram key={k} d={d} />)}</div>
        </section>
      )}

      {!!c.formulae?.length && (
        <section className="card">
          <h2>Formulae and calculations</h2>
          <div className="stack">
            {c.formulae.map((f, k) => (
              <div key={k} className="formula"><strong>{f.name}</strong><div className="f">{f.formula}</div>{f.example && <small>{f.example}</small>}</div>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <h2>Key terms</h2>
        <dl className="terms">
          {c.key_terms.map((k, n) => <div key={n}><dt>{k.term}</dt><dd>{k.definition}</dd></div>)}
        </dl>
      </section>

      <div className="grid g2">
        <section className="card"><h2>Real-world applications</h2><ul>{c.applications.map((a, k) => <li key={k}>{a}</li>)}</ul></section>
        <section className="card"><h2>Evaluation for top marks</h2><ul>{c.evaluation.map((a, k) => <li key={k}>{a}</li>)}</ul></section>
        <section className="card"><h2>Common mistakes</h2><ul>{c.misconceptions.map((a, k) => <li key={k}>{a}</li>)}</ul></section>
        <section className="card"><h2>Exam tips</h2><ul>{c.exam_tips.map((a, k) => <li key={k}>{a}</li>)}</ul></section>
      </div>

      <section className="card">
        <h2>Model answer</h2>
        <p className="question">{c.model_answer.question} <span className="badge ok">{c.model_answer.marks} marks</span></p>
        <p className="muted" style={{ fontSize: '0.9rem' }}>Plan your own answer first, then compare.</p>
        <details><summary>Show the top-band answer</summary><div className="mt"><RichText text={c.model_answer.answer} /></div>
          <div className="scheme mt"><strong>Why it reaches the top level:</strong> {c.model_answer.commentary}</div></details>
      </section>

      <CheckQuiz check={c.check} key={lesson.topic_code} />

      <section className="card">
        <div className="spread"><h2 style={{ margin: 0 }}>Study materials from your assessors</h2><Link to={`/materials?topic=${lesson.topic_code}`}>All materials</Link></div>
        <MaterialList topic={lesson.topic_code} />
      </section>

      {!!c.synoptic?.length && (
        <section className="card">
          <h2>Synoptic links</h2>
          <div className="row">{c.synoptic.map(s => <Link key={s} className="badge brand" to={`/course/${s}`}>{s} {topicByCode(s)?.title}</Link>)}</div>
        </section>
      )}

      {isStudent && <Complete code={lesson.topic_code} prog={prog} onSaved={setProg} />}

      <div className="spread mt">
        {prev ? <Link className="btn secondary" to={`/course/${prev.topic_code}`}>← {prev.topic_code} {prev.title}</Link> : <span />}
        {next && <Link className="btn" to={`/course/${next.topic_code}`}>{next.topic_code} {next.title} →</Link>}
      </div>
    </article>
  )
}

function CheckQuiz({ check }: { check: LessonRow['content']['check'] }) {
  const [picked, setPicked] = useState<Record<number, string>>({})
  const answered = Object.keys(picked).length
  const right = check.filter((q, i) => picked[i] === q.answer).length
  return (
    <section className="card">
      <div className="spread"><h2 style={{ margin: 0 }}>Check your understanding</h2>{answered === check.length && <span className={`badge ${right === check.length ? 'good' : 'ok'}`}>{right}/{check.length} correct</span>}</div>
      {check.map((q, i) => (
        <div key={i} className="mt">
          <p className="question">{i + 1}. {q.q}</p>
          <div className="stack">
            {q.options.map((o, k) => {
              const letter = 'ABCD'[k]
              const cls = picked[i] == null ? '' : letter === q.answer ? 'right' : picked[i] === letter ? 'wrong' : ''
              return (
                <button key={k} type="button" className={`option ${cls}`} disabled={picked[i] != null} onClick={() => setPicked({ ...picked, [i]: letter })}>
                  <strong>{letter}</strong> {o}
                </button>
              )
            })}
          </div>
          {picked[i] != null && <small>{q.explanation}</small>}
        </div>
      ))}
    </section>
  )
}

function Complete({ code, prog, onSaved }: { code: string; prog: TopicProgress | null; onSaved: (p: TopicProgress) => void }) {
  const { profile } = useAuth()
  const [conf, setConf] = useState(prog?.confidence || 3)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { if (prog?.confidence) setConf(prog.confidence) }, [prog?.confidence])

  async function save(done: boolean) {
    setBusy(true); setError('')
    const row = { student_id: profile!.id, topic_code: code, confidence: done ? conf : prog?.confidence ?? 0,
      status: progressStatus(done ? conf : prog?.confidence ?? 0), lesson_completed_at: done ? new Date().toISOString() : null, updated_at: new Date().toISOString() }
    const { error } = await supabase.from('topic_progress').upsert(row)
    setBusy(false)
    if (error) return setError(errMsg(error))
    onSaved(row)
  }

  return (
    <section className="card complete">
      {prog?.lesson_completed_at ? (
        <div className="spread">
          <div><strong>✓ Lesson complete</strong> <small>on {fmtDate(prog.lesson_completed_at)} · confidence {prog.confidence}/5</small></div>
          <button className="ghost sm" onClick={() => save(false)} disabled={busy}>Mark as not done</button>
        </div>
      ) : (
        <>
          <h2>Finished this lesson?</h2>
          <p className="muted" style={{ fontSize: '0.9rem' }}>Rate how confident you are. Your timetable and advisor use this to schedule revision of weaker topics.</p>
          <div className="conf" role="radiogroup" aria-label="Confidence">
            {[1, 2, 3, 4, 5].map(v => (
              <button key={v} type="button" title={LABELS[v]} aria-label={`${v} – ${LABELS[v]}`} className={conf >= v ? 'on' : ''} onClick={() => setConf(v)}>{v}</button>
            ))}
            <small style={{ marginLeft: 8 }}>{LABELS[conf]}</small>
          </div>
          <button className="mt" onClick={() => save(true)} disabled={busy}>{busy ? 'Saving…' : 'Mark lesson complete'}</button>
        </>
      )}
      <Alert kind="error">{error}</Alert>
    </section>
  )
}
