import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, type PastPaper, type PaperResult } from '../lib/supabase'
import { gradeFor } from '../lib/grades'
import { localIso } from '../lib/timetable'
import { PEARSON_LINKS, type Level } from '../lib/spec'
import { Alert, Empty, Grade, Loading, PageHead, StudentPicker, Stat, fmtDate, useViewableStudents } from '../components/ui'

const AVAIL = {
  public: { label: 'Published', cls: 'good' },
  secure: { label: 'Teacher access', cls: 'ok' },
  no_exam: { label: 'No exam (COVID)', cls: '' },
}

export default function PastPapers() {
  const { profile } = useAuth()
  const staff = profile?.role === 'assessor' || profile?.role === 'admin'
  const { students } = useViewableStudents()
  const [papers, setPapers] = useState<PastPaper[] | null>(null)
  const [results, setResults] = useState<PaperResult[]>([])
  const [qual, setQual] = useState<Level>((profile?.year_group ?? 'A') as Level)
  const [sid, setSid] = useState('')
  const [logFor, setLogFor] = useState<PastPaper | null>(null)
  const [uploadFor, setUploadFor] = useState<PastPaper | null>(null)
  const student = students.find(s => s.id === sid) ?? students[0]

  const loadPapers = () => supabase.from('past_papers').select('*').order('year', { ascending: false }).order('month', { ascending: false }).order('paper_no')
    .then(({ data }) => setPapers((data as PastPaper[]) ?? []))
  const loadResults = () => student && supabase.from('past_paper_results').select('*').eq('student_id', student.id).order('sat_on', { ascending: false })
    .then(({ data }) => setResults((data as PaperResult[]) ?? []))
  useEffect(() => { loadPapers() }, [])
  useEffect(() => { loadResults() }, [student]) // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => (papers ?? []).filter(p => p.qualification === qual), [papers, qual])
  const series = useMemo(() => [...new Set(list.map(p => p.series))], [list])

  async function open(path: string) {
    const { data, error } = await supabase.storage.from('papers').createSignedUrl(path, 600)
    if (error) return alert(errMsg(error))
    window.open(data.signedUrl, '_blank', 'noopener')
  }

  if (!papers) return <Loading />
  const mine = results.filter(r => list.some(p => p.id === r.past_paper_id))
  const avg = mine.length ? Math.round(mine.reduce((s, r) => s + Number(r.percent), 0) / mine.length) : null
  const sittable = list.filter(p => p.availability !== 'no_exam').length

  return (
    <>
      <PageHead title="Past papers" sub="Every Pearson Edexcel Economics A series from 2016 to 2026 — track attempts, marks and grades">
        <select value={qual} onChange={e => setQual(e.target.value as Level)} style={{ width: 'auto' }} aria-label="Qualification">
          <option value="AS">AS level (8EC0)</option>
          <option value="A">A level (9EC0)</option>
        </select>
        {student && students.length > 1 && <StudentPicker students={students} value={student.id} onChange={setSid} />}
      </PageHead>

      <div className="grid g4">
        <Stat label="Papers attempted" value={`${new Set(mine.map(r => r.past_paper_id)).size}/${sittable}`} sub={student?.full_name} />
        <Stat label="Average score" value={avg != null ? `${avg}%` : '—'} />
        <Stat label="Indicative grade" value={<Grade g={gradeFor(qual, avg)} />} sub="From average of logged papers" />
        <div className="card stat">
          <div className="label">Official sources</div>
          <div className="stack" style={{ marginTop: 6, gap: 4, fontSize: '0.9rem' }}>
            <a href={PEARSON_LINKS.materials} target="_blank" rel="noreferrer">Pearson exam materials ↗</a>
            <a href={PEARSON_LINKS.boundaries} target="_blank" rel="noreferrer">Grade boundaries ↗</a>
          </div>
        </div>
      </div>

      <Alert>
        Question papers, mark schemes and examiner reports are © Pearson Education and are linked from Pearson's website rather than copied here.
        Recent and autumn series are usually released to teachers only — assessors can attach the PDFs their centre is licensed to use.
      </Alert>

      {logFor && student && <LogResult paper={logFor} studentId={student.id} staff={staff} onDone={() => { setLogFor(null); loadResults() }} />}
      {uploadFor && <Upload paper={uploadFor} onDone={() => { setUploadFor(null); loadPapers() }} />}

      {series.map(s => (
        <div className="card" key={s}>
          <h2>{s}</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {list.filter(p => p.series === s).map(p => {
                  const rs = results.filter(r => r.past_paper_id === p.id)
                  const best = rs.reduce<PaperResult | null>((b, r) => (!b || r.percent > b.percent ? r : b), null)
                  return (
                    <tr key={p.id}>
                      <td style={{ minWidth: 220 }}><strong>Paper {p.paper_no}: {p.title}</strong><div className="muted" style={{ fontSize: '0.82rem' }}>{p.spec_code} · {p.themes} · {p.duration_minutes} min · {p.total_marks} marks</div></td>
                      <td><span className={`badge ${AVAIL[p.availability].cls}`}>{AVAIL[p.availability].label}</span></td>
                      <td style={{ fontSize: '0.88rem' }}>
                        <div className="row" style={{ gap: 8 }}>
                          {p.qp_path && <button className="ghost sm" onClick={() => open(p.qp_path!)}>Question paper</button>}
                          {p.ms_path && <button className="ghost sm" onClick={() => open(p.ms_path!)}>Mark scheme</button>}
                          {p.er_path && <button className="ghost sm" onClick={() => open(p.er_path!)}>Examiner report</button>}
                          {p.qp_url && <a href={p.qp_url} target="_blank" rel="noreferrer">Find on Pearson ↗</a>}
                        </div>
                      </td>
                      <td>{best ? <span>{best.marks}/{best.max_marks} <Grade g={best.grade} /><div className="muted" style={{ fontSize: '0.8rem' }}>{rs.length} attempt{rs.length > 1 ? 's' : ''} · {fmtDate(best.sat_on)}</div></span> : <span className="muted">—</span>}</td>
                      <td>
                        <div className="row">
                          {p.availability !== 'no_exam' && student && (profile?.role === 'student' || staff) && <button className="secondary sm" onClick={() => setLogFor(p)}>Log result</button>}
                          {staff && p.availability !== 'no_exam' && <button className="ghost sm" onClick={() => setUploadFor(p)}>Attach PDFs</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {series.length === 0 && <Empty>No papers in the catalogue.</Empty>}
    </>
  )
}

function LogResult({ paper, studentId, staff, onDone }: { paper: PastPaper; studentId: string; staff: boolean; onDone: () => void }) {
  const [marks, setMarks] = useState('')
  const [date, setDate] = useState(localIso())
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const pct = marks ? (Number(marks) * 100) / paper.total_marks : null

  async function submit(e: FormEvent) {
    e.preventDefault()
    const m = Number(marks)
    if (!(m >= 0 && m <= paper.total_marks)) return setError(`Enter marks between 0 and ${paper.total_marks}.`)
    const { error } = await supabase.from('past_paper_results').insert({
      student_id: studentId, past_paper_id: paper.id, marks: m, max_marks: paper.total_marks,
      grade: gradeFor(paper.qualification, pct), source: staff ? 'assessor' : 'self', sat_on: date, notes: notes || null,
    })
    if (error) return setError(errMsg(error))
    onDone()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Log result — {paper.series} Paper {paper.paper_no}</h2>
      <div className="form cols">
        <label>Marks (out of {paper.total_marks})<input type="number" min={0} max={paper.total_marks} step={0.5} required value={marks} onChange={e => setMarks(e.target.value)} /></label>
        <label>Date sat<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
        <div className="stat"><div className="label">Indicative grade</div><div className="value"><Grade g={gradeFor(paper.qualification, pct)} /></div></div>
      </div>
      <label>Notes<input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Timed? Which questions went badly?" /></label>
      <Alert kind="error">{error}</Alert>
      <div className="row"><button>Save result</button><button type="button" className="secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}

function Upload({ paper, onDone }: { paper: PastPaper; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function upload(kind: 'qp' | 'ms' | 'er', file: File | undefined) {
    if (!file) return
    if (file.type !== 'application/pdf') return setError('Please choose a PDF file.')
    setBusy(true); setError('')
    const path = `${paper.id}/${kind}.pdf`
    const { error } = await supabase.storage.from('papers').upload(path, file, { upsert: true, contentType: 'application/pdf' })
    if (!error) {
      const { error: ue } = await supabase.from('past_papers').update({ [`${kind}_path`]: path }).eq('id', paper.id)
      if (ue) setError(errMsg(ue))
    } else setError(errMsg(error))
    setBusy(false)
  }

  return (
    <div className="card form">
      <h2>Attach PDFs — {paper.series} {paper.spec_code}</h2>
      <p className="muted">Only upload materials your centre is licensed to share with its students. Files are private to signed-in users.</p>
      <div className="form cols">
        {(['qp', 'ms', 'er'] as const).map(k => (
          <label key={k}>{k === 'qp' ? 'Question paper' : k === 'ms' ? 'Mark scheme' : 'Examiner report'}
            <input type="file" accept="application/pdf" disabled={busy} onChange={e => upload(k, e.target.files?.[0])} />
            {paper[`${k}_path`] && <small>✓ attached</small>}
          </label>
        ))}
      </div>
      <Alert kind="error">{error}</Alert>
      <div className="row"><button onClick={onDone} disabled={busy}>{busy ? 'Uploading…' : 'Done'}</button></div>
    </div>
  )
}
