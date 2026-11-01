import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, type ClassRow } from '../lib/supabase'
import { Alert, Empty, Loading, PageHead } from '../components/ui'

type ClassWithCount = ClassRow & { class_members: { count: number }[]; profiles: { full_name: string } | null }

export default function Classes() {
  const { profile } = useAuth()
  const [rows, setRows] = useState<ClassWithCount[] | null>(null)
  const [creating, setCreating] = useState(false)
  const staff = profile?.role === 'assessor' || profile?.role === 'admin'

  const load = () => supabase.from('classes').select('*, class_members(count), profiles(full_name)').order('created_at')
    .then(({ data }) => setRows((data as ClassWithCount[]) ?? []))
  useEffect(() => { load() }, [])

  if (!rows) return <Loading />
  return (
    <>
      <PageHead title="Classes & tuition" sub={staff ? 'Run classroom groups and 1:1 or small-group tuition' : 'Your classroom groups and tuition sessions'}>
        {staff && !creating && <button onClick={() => setCreating(true)}>New class or tuition group</button>}
      </PageHead>
      {creating && <NewClass onDone={() => { setCreating(false); load() }} />}
      {rows.length === 0 ? (
        <Empty>{staff ? 'Create your first class or tuition group.' : 'You are not in any classes yet. Your assessor adds you using your email, mobile or link code.'}</Empty>
      ) : (
        <div className="grid g3">
          {rows.map(c => (
            <Link key={c.id} to={`/classes/${c.id}`} className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="spread">
                <span className={`badge ${c.kind === 'tuition' ? 'ok' : 'brand'}`}>{c.kind === 'tuition' ? 'Tuition' : 'Classroom'}</span>
                <span className="badge">{c.level === 'both' ? 'AS & A' : c.level === 'AS' ? 'AS level' : 'A level'}</span>
              </div>
              <h3 className="mt">{c.name}</h3>
              {c.description && <p className="muted" style={{ fontSize: '0.9rem' }}>{c.description}</p>}
              <small>{c.class_members?.[0]?.count ?? 0} students · {c.profiles?.full_name ?? 'Assessor'}{c.weekly_schedule ? ` · ${c.weekly_schedule}` : ''}</small>
            </Link>
          ))}
        </div>
      )}
    </>
  )
}

function NewClass({ onDone }: { onDone: () => void }) {
  const [f, setF] = useState({ name: '', kind: 'classroom', level: 'A', description: '', weekly_schedule: '', meeting_url: '' })
  const [error, setError] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function submit(e: FormEvent) {
    e.preventDefault()
    const { error } = await supabase.from('classes').insert({
      ...f, description: f.description || null, weekly_schedule: f.weekly_schedule || null, meeting_url: f.meeting_url || null,
    })
    if (error) return setError(errMsg(error))
    onDone()
  }

  return (
    <form className="card form" onSubmit={submit} style={{ marginBottom: 16 }}>
      <h2>New class or tuition group</h2>
      <div className="form cols">
        <label>Name<input required value={f.name} onChange={set('name')} placeholder="Year 13 Economics – Set 1" /></label>
        <label>Type
          <select value={f.kind} onChange={set('kind')}>
            <option value="classroom">Classroom</option>
            <option value="tuition">Tuition (1:1 or small group)</option>
          </select>
        </label>
        <label>Level
          <select value={f.level} onChange={set('level')}>
            <option value="AS">AS level</option>
            <option value="A">A level</option>
            <option value="both">AS & A level</option>
          </select>
        </label>
        <label>Usual schedule<input value={f.weekly_schedule} onChange={set('weekly_schedule')} placeholder="Tue & Thu 14:00" /></label>
        <label>Online meeting link<input type="url" value={f.meeting_url} onChange={set('meeting_url')} placeholder="https://…" /></label>
      </div>
      <label>Description<textarea value={f.description} onChange={set('description')} /></label>
      <Alert kind="error">{error}</Alert>
      <div className="row"><button>Create</button><button type="button" className="secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}
