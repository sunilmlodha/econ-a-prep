import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth, normaliseMobile } from '../lib/auth'
import { supabase, errMsg, type ClassRow, type Profile, type SessionRow } from '../lib/supabase'
import { TOPICS, topicByCode } from '../lib/spec'
import { Alert, Empty, Loading, PageHead, fmtDateTime } from '../components/ui'

type Status = 'present' | 'late' | 'absent' | 'excused'
interface Att { session_id: string; student_id: string; status: Status }

export default function ClassDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const [cls, setCls] = useState<ClassRow | null>(null)
  const [members, setMembers] = useState<Profile[]>([])
  const [sessions, setSessions] = useState<SessionRow[]>([])
  const [att, setAtt] = useState<Att[]>([])
  const [error, setError] = useState('')
  const [ok, setOk] = useState('')
  const [addId, setAddId] = useState('')
  const [openSession, setOpenSession] = useState<string | null>(null)
  const owner = cls && (cls.assessor_id === profile?.id || profile?.role === 'admin')

  const load = useCallback(async () => {
    const { data: c } = await supabase.from('classes').select('*').eq('id', id!).maybeSingle()
    setCls(c as ClassRow | null)
    const { data: m } = await supabase.from('class_members').select('student_id, profiles(*)').eq('class_id', id!)
    setMembers(((m ?? []) as unknown as { profiles: Profile }[]).map(x => x.profiles).filter(Boolean))
    const { data: s } = await supabase.from('class_sessions').select('*').eq('class_id', id!).order('starts_at')
    setSessions((s as SessionRow[]) ?? [])
    const ids = (s ?? []).map(x => x.id)
    if (ids.length) {
      const { data: a } = await supabase.from('attendance').select('session_id, student_id, status').in('session_id', ids)
      setAtt((a as Att[]) ?? [])
    }
  }, [id])
  useEffect(() => { load() }, [load])

  async function addMember(e: FormEvent) {
    e.preventDefault(); setError(''); setOk('')
    const ident = addId.includes('@') || /^[0-9a-f]{12}$/i.test(addId.trim()) ? addId.trim() : normaliseMobile(addId)
    const { error } = await supabase.rpc('add_student_to_class', { cid: id, identifier: ident })
    if (error) return setError(errMsg(error))
    setAddId(''); setOk('Student added.'); load()
  }

  async function removeMember(sid: string) {
    if (!confirm('Remove this student from the class?')) return
    const { error } = await supabase.from('class_members').delete().eq('class_id', id!).eq('student_id', sid)
    if (error) return setError(errMsg(error))
    load()
  }

  async function mark(session_id: string, student_id: string, status: Status) {
    setAtt(a => [...a.filter(x => !(x.session_id === session_id && x.student_id === student_id)), { session_id, student_id, status }])
    const { error } = await supabase.from('attendance').upsert({ session_id, student_id, status, updated_at: new Date().toISOString() })
    if (error) setError(errMsg(error))
  }

  async function deleteSession(sid: string) {
    if (!confirm('Delete this session and its attendance?')) return
    const { error } = await supabase.from('class_sessions').delete().eq('id', sid)
    if (error) return setError(errMsg(error))
    load()
  }

  async function deleteClass() {
    if (!confirm('Delete this class, its sessions and attendance records? Exams set for it are kept (unpublished) with all student results.')) return
    const { error } = await supabase.from('classes').delete().eq('id', id!)
    if (error) return setError(errMsg(error))
    nav('/classes')
  }

  if (!cls) return <Loading />
  const now = new Date().toISOString()
  const upcoming = sessions.filter(s => s.ends_at >= now)
  const past = sessions.filter(s => s.ends_at < now).reverse()
  const myAtt = (sid: string, stu: string) => att.find(a => a.session_id === sid && a.student_id === stu)?.status

  const SessionCard = ({ s }: { s: SessionRow }) => (
    <div className="card">
      <div className="spread">
        <div>
          <strong>{s.title}</strong>
          <div className="muted" style={{ fontSize: '0.85rem' }}>
            {fmtDateTime(s.starts_at)} – {new Date(s.ends_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            {s.location ? ` · ${s.location}` : ''}
          </div>
        </div>
        <div className="row">
          {s.topic_code && <span className="badge brand">{s.topic_code} {topicByCode(s.topic_code)?.title}</span>}
          {!owner && profile?.role === 'student' && myAtt(s.id, profile.id) && <span className="badge">{myAtt(s.id, profile.id)}</span>}
        </div>
      </div>
      {s.notes && <p className="mt" style={{ whiteSpace: 'pre-wrap' }}>{s.notes}</p>}
      {s.homework && <p><strong>Homework:</strong> {s.homework}</p>}
      {owner && (
        <div className="row mt">
          <button className="secondary sm" onClick={() => setOpenSession(openSession === s.id ? null : s.id)}>
            {openSession === s.id ? 'Hide register' : 'Take register'}
          </button>
          <button className="danger sm" onClick={() => deleteSession(s.id)}>Delete</button>
        </div>
      )}
      {owner && openSession === s.id && (
        members.length === 0 ? <p className="muted mt">Add students first.</p> : (
          <div className="table-wrap mt">
            <table>
              <tbody>
                {members.map(m => (
                  <tr key={m.id}>
                    <td>{m.full_name}</td>
                    <td>
                      <div className="row">
                        {(['present', 'late', 'absent', 'excused'] as Status[]).map(st => (
                          <button key={st} className={`sm ${myAtt(s.id, m.id) === st ? '' : 'secondary'}`} onClick={() => mark(s.id, m.id, st)}>{st}</button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  )

  return (
    <>
      <PageHead title={cls.name} sub={`${cls.kind === 'tuition' ? 'Tuition group' : 'Classroom'}${cls.weekly_schedule ? ` · ${cls.weekly_schedule}` : ''}`}>
        {cls.meeting_url && <a className="btn secondary" href={cls.meeting_url} target="_blank" rel="noreferrer">Join online</a>}
        {owner && <button className="danger" onClick={deleteClass}>Delete class</button>}
      </PageHead>
      {cls.description && <p>{cls.description}</p>}
      <Alert kind="error">{error}</Alert>
      <Alert kind="success">{ok}</Alert>

      <div className="grid g2 mt" style={{ alignItems: 'start' }}>
        <div>
          <h2>Upcoming sessions</h2>
          {owner && <NewSession classId={cls.id} onDone={load} />}
          <div className="mt">{upcoming.length ? upcoming.map(s => <SessionCard key={s.id} s={s} />) : <Empty>No upcoming sessions.</Empty>}</div>
          {past.length > 0 && <><h2 className="mt">Past sessions</h2>{past.map(s => <SessionCard key={s.id} s={s} />)}</>}
        </div>
        <div className="card">
          <h2>Students ({members.length})</h2>
          {owner && (
            <form className="row" onSubmit={addMember} style={{ marginBottom: 12 }}>
              <input style={{ flex: 1, minWidth: 180 }} required value={addId} onChange={e => setAddId(e.target.value)} placeholder="Student email, mobile or link code" aria-label="Student email, mobile or link code" />
              <button>Add</button>
            </form>
          )}
          {members.length ? (
            <table>
              <thead><tr><th>Name</th><th>Attendance</th>{owner && <th />}</tr></thead>
              <tbody>
                {members.map(m => {
                  const mine = att.filter(a => a.student_id === m.id && a.status !== 'excused')
                  const pct = mine.length ? Math.round((mine.filter(a => a.status !== 'absent').length * 100) / mine.length) : null
                  return (
                    <tr key={m.id}>
                      <td>{m.full_name}<div className="muted" style={{ fontSize: '0.8rem' }}>{m.email}</div></td>
                      <td>{pct != null ? `${pct}%` : '—'}</td>
                      {owner && <td><button className="ghost sm" onClick={() => removeMember(m.id)}>Remove</button></td>}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          ) : <Empty>No students yet.</Empty>}
        </div>
      </div>
    </>
  )
}

function NewSession({ classId, onDone }: { classId: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', date: '', start: '16:00', end: '17:00', topic_code: '', location: '', notes: '', homework: '', repeat: '1' })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const rows = Array.from({ length: Number(f.repeat) }, (_, i) => {
      const s = new Date(`${f.date}T${f.start}`); s.setDate(s.getDate() + 7 * i)
      const en = new Date(`${f.date}T${f.end}`); en.setDate(en.getDate() + 7 * i)
      return {
        class_id: classId, title: f.title, topic_code: f.topic_code || null, location: f.location || null,
        notes: f.notes || null, homework: f.homework || null, starts_at: s.toISOString(), ends_at: en.toISOString(),
      }
    })
    const { error } = await supabase.from('class_sessions').insert(rows)
    if (error) return setError(errMsg(error))
    setOpen(false); setF({ ...f, title: '', notes: '', homework: '' }); onDone()
  }

  if (!open) return <button className="secondary" onClick={() => setOpen(true)}>Schedule session</button>
  return (
    <form className="card form" onSubmit={submit}>
      <label>Title<input required value={f.title} onChange={set('title')} placeholder="Elasticities workshop" /></label>
      <div className="form cols">
        <label>Date<input type="date" required value={f.date} onChange={set('date')} /></label>
        <label>Start<input type="time" required value={f.start} onChange={set('start')} /></label>
        <label>End<input type="time" required value={f.end} onChange={set('end')} /></label>
        <label>Repeat weekly
          <select value={f.repeat} onChange={set('repeat')}>
            {[1, 2, 4, 6, 8, 10, 12].map(n => <option key={n} value={n}>{n === 1 ? 'Once' : `${n} weeks`}</option>)}
          </select>
        </label>
      </div>
      <div className="form cols">
        <label>Spec topic
          <select value={f.topic_code} onChange={set('topic_code')}>
            <option value="">—</option>
            {TOPICS.map(t => <option key={t.code} value={t.code}>{t.code} {t.title}</option>)}
          </select>
        </label>
        <label>Location<input value={f.location} onChange={set('location')} placeholder="Room 12 / Online" /></label>
      </div>
      <label>Notes<textarea value={f.notes} onChange={set('notes')} /></label>
      <label>Homework<input value={f.homework} onChange={set('homework')} /></label>
      <Alert kind="error">{error}</Alert>
      <div className="row"><button>Save</button><button type="button" className="secondary" onClick={() => setOpen(false)}>Cancel</button></div>
    </form>
  )
}
