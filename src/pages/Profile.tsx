import { useEffect, useState, type FormEvent } from 'react'
import { useAuth, normaliseMobile } from '../lib/auth'
import { supabase, errMsg, type Profile as P } from '../lib/supabase'
import { GRADES } from '../lib/grades'
import { Alert, PageHead } from '../components/ui'

export default function Profile() {
  const { profile, refreshProfile } = useAuth()
  const [f, setF] = useState({
    full_name: profile!.full_name, mobile: profile!.mobile ?? '', school: profile!.school ?? '',
    year_group: profile!.year_group ?? 'A', exam_year: String(profile!.exam_year ?? ''), target_grade: profile!.target_grade ?? '',
  })
  const [msg, setMsg] = useState({ ok: '', err: '' })
  const [code, setCode] = useState('')
  const [children, setChildren] = useState<P[]>([])
  const [parents, setParents] = useState<P[]>([])
  const [invite, setInvite] = useState('')
  const [pw, setPw] = useState('')
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const isStudent = profile!.role === 'student'

  const loadLinks = () => {
    if (profile!.role === 'parent') {
      supabase.from('parent_links').select('profiles!parent_links_student_id_fkey(*)').eq('parent_id', profile!.id)
        .then(({ data }) => setChildren(((data ?? []) as unknown as { profiles: P }[]).map(x => x.profiles)))
    }
    if (isStudent) {
      supabase.from('parent_links').select('profiles!parent_links_parent_id_fkey(*)').eq('student_id', profile!.id)
        .then(({ data }) => setParents(((data ?? []) as unknown as { profiles: P }[]).map(x => x.profiles).filter(Boolean)))
    }
  }
  useEffect(() => {
    loadLinks()
    if (profile!.role === 'assessor' || profile!.role === 'admin') supabase.rpc('assessor_invite_code').then(({ data }) => setInvite((data as string) ?? ''))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: FormEvent) {
    e.preventDefault(); setMsg({ ok: '', err: '' })
    const mobile = normaliseMobile(f.mobile)
    const row: Record<string, unknown> = { full_name: f.full_name, mobile: mobile || null, school: f.school || null }
    if (isStudent) Object.assign(row, { year_group: f.year_group, exam_year: f.exam_year ? Number(f.exam_year) : null, target_grade: f.target_grade || null })
    const { error } = await supabase.from('profiles').update(row).eq('id', profile!.id)
    if (error) return setMsg({ ok: '', err: error.code === '23505' ? 'That mobile number is used by another account.' : errMsg(error) })
    await refreshProfile()
    setMsg({ ok: 'Profile saved.', err: '' })
  }

  async function link(e: FormEvent) {
    e.preventDefault(); setMsg({ ok: '', err: '' })
    const { error } = await supabase.rpc('link_child', { code })
    if (error) return setMsg({ ok: '', err: errMsg(error) })
    setCode(''); setMsg({ ok: 'Student linked.', err: '' }); loadLinks()
  }

  async function unlink(parent_id: string, student_id: string) {
    if (!confirm('Remove this link?')) return
    await supabase.from('parent_links').delete().eq('parent_id', parent_id).eq('student_id', student_id)
    loadLinks()
  }

  async function changePw(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 8) return setMsg({ ok: '', err: 'Use at least 8 characters.' })
    const { error } = await supabase.auth.updateUser({ password: pw })
    if (error) return setMsg({ ok: '', err: errMsg(error) })
    setPw(''); setMsg({ ok: 'Password updated.', err: '' })
  }

  return (
    <>
      <PageHead title="Profile & links" sub={`${profile!.email ?? ''} · ${profile!.role}`} />
      <Alert kind="error">{msg.err}</Alert>
      <Alert kind="success">{msg.ok}</Alert>
      <div className="grid g2 mt" style={{ alignItems: 'start' }}>
        <form className="card form" onSubmit={save}>
          <h2>Your details</h2>
          <label>Full name<input required value={f.full_name} onChange={set('full_name')} /></label>
          <label>Mobile number<input type="tel" value={f.mobile} onChange={set('mobile')} placeholder="07700 900123" /><small>Used for mobile-number sign-in.</small></label>
          <label>School / centre<input value={f.school} onChange={set('school')} /></label>
          {isStudent && (
            <div className="form cols">
              <label>Qualification<select value={f.year_group} onChange={set('year_group')}><option value="AS">AS level</option><option value="A">A level</option></select></label>
              <label>Exam year<input type="number" value={f.exam_year} onChange={set('exam_year')} /></label>
              <label>Target grade<select value={f.target_grade} onChange={set('target_grade')}><option value="">—</option>{GRADES.slice(0, 6).map(g => <option key={g}>{g}</option>)}</select></label>
            </div>
          )}
          <button>Save</button>
        </form>

        <div className="stack">
          {isStudent && (
            <div className="card">
              <h2>Your link code</h2>
              <p style={{ fontSize: '1.8rem', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.15em', margin: '4px 0' }}>{profile!.link_code}</p>
              <p className="muted">Give this to a parent so they can follow your progress, or to an assessor to join their class.</p>
              {parents.length > 0 && (
                <>
                  <h3 className="mt">Linked parents</h3>
                  {parents.map(p => <div key={p.id} className="spread"><span>{p.full_name} <small>{p.email}</small></span><button className="ghost sm" onClick={() => unlink(p.id, profile!.id)}>Remove</button></div>)}
                </>
              )}
            </div>
          )}
          {profile!.role === 'parent' && (
            <div className="card">
              <h2>Link a student</h2>
              <form className="row" onSubmit={link}>
                <input style={{ flex: 1 }} required value={code} onChange={e => setCode(e.target.value)} placeholder="8-character link code" aria-label="Link code" />
                <button>Link</button>
              </form>
              {children.length > 0 && <div className="stack mt">{children.map(c => <div key={c.id} className="spread"><span>{c.full_name} <small>{c.email}</small></span><button className="ghost sm" onClick={() => unlink(profile!.id, c.id)}>Remove</button></div>)}</div>}
            </div>
          )}
          {invite && (
            <div className="card">
              <h2>Assessor invite code</h2>
              <p style={{ fontSize: '1.4rem', fontFamily: 'ui-monospace, monospace', letterSpacing: '0.1em', margin: '4px 0' }}>{invite}</p>
              <p className="muted">Colleagues enter this when creating an assessor account.</p>
            </div>
          )}
          <form className="card form" onSubmit={changePw}>
            <h2>Change password</h2>
            <input type="password" value={pw} onChange={e => setPw(e.target.value)} autoComplete="new-password" aria-label="New password" placeholder="New password" />
            <button>Update password</button>
          </form>
        </div>
      </div>
    </>
  )
}
