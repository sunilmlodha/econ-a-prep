import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { supabase, errMsg, type ClassRow } from '../lib/supabase'
import { THEMES, TOPICS, topicByCode } from '../lib/spec'
import RichText from '../components/RichText'
import { Alert, Empty, Loading, PageHead, fmtDate } from '../components/ui'

interface Material {
  id: string
  topic_code: string | null
  theme: number | null
  title: string
  kind: 'file' | 'link' | 'note'
  url: string | null
  storage_path: string | null
  body: string | null
  class_id: string | null
  created_by: string
  created_at: string
  classes: { name: string } | null
  profiles: { full_name: string } | null
}

const KIND = { file: 'File', link: 'Link', note: 'Note' }
const select = '*, classes(name), profiles!study_materials_created_by_fkey(full_name)'

async function openFile(path: string) {
  const { data, error } = await supabase.storage.from('materials').createSignedUrl(path, 600)
  if (error) return alert(errMsg(error))
  window.open(data.signedUrl, '_blank', 'noopener')
}

function MaterialRow({ m, onDelete }: { m: Material; onDelete?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="material">
      <div className="spread">
        <div>
          <span className="badge">{KIND[m.kind]}</span>{' '}
          <strong>{m.title}</strong>
          <div className="muted" style={{ fontSize: '0.82rem' }}>
            {m.topic_code ? <Link to={`/course/${m.topic_code}`}>{m.topic_code} {topicByCode(m.topic_code)?.title}</Link> : m.theme ? `Theme ${m.theme}` : 'General'}
            {' · '}{m.classes?.name ?? 'All students'} · {m.profiles?.full_name ?? 'Assessor'} · {fmtDate(m.created_at)}
          </div>
        </div>
        <div className="row">
          {m.kind === 'link' && <a className="btn secondary sm" href={m.url!} target="_blank" rel="noreferrer noopener">Open ↗</a>}
          {m.kind === 'file' && <button className="secondary sm" onClick={() => openFile(m.storage_path!)}>Download</button>}
          {m.kind === 'note' && <button className="secondary sm" onClick={() => setOpen(o => !o)}>{open ? 'Hide' : 'Read'}</button>}
          {onDelete && <button className="ghost sm" onClick={onDelete}>Delete</button>}
        </div>
      </div>
      {open && m.body && <div className="mt"><RichText text={m.body} /></div>}
    </div>
  )
}

/** Materials for one topic, used on the lesson page. */
export function MaterialList({ topic }: { topic: string }) {
  const [rows, setRows] = useState<Material[] | null>(null)
  useEffect(() => {
    supabase.from('study_materials').select(select).eq('topic_code', topic).order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as unknown as Material[]) ?? []))
  }, [topic])
  if (!rows) return <Loading />
  if (!rows.length) return <p className="muted" style={{ fontSize: '0.9rem' }}>No extra materials for this topic yet.</p>
  return <div className="stack mt">{rows.map(m => <MaterialRow key={m.id} m={m} />)}</div>
}

export default function Materials() {
  const { profile } = useAuth()
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState<Material[] | null>(null)
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const staff = profile?.role === 'assessor' || profile?.role === 'admin'
  const theme = Number(params.get('theme') ?? 0)
  const topic = params.get('topic') ?? ''

  const load = () => supabase.from('study_materials').select(select).order('created_at', { ascending: false })
    .then(({ data, error }) => { if (error) setError(errMsg(error)); setRows((data as unknown as Material[]) ?? []) })
  useEffect(() => { load() }, [])

  async function remove(m: Material) {
    if (!confirm(`Delete "${m.title}"?`)) return
    const { error } = await supabase.from('study_materials').delete().eq('id', m.id)
    if (error) return setError(errMsg(error))
    if (m.storage_path) await supabase.storage.from('materials').remove([m.storage_path])
    load()
  }

  if (!rows) return <Loading />
  const list = rows.filter(m => (!topic || m.topic_code === topic) && (!theme || m.theme === theme || topicByCode(m.topic_code)?.theme === theme))
  const set = (k: string, v: string) => { const p = new URLSearchParams(params); if (v && v !== '0') p.set(k, v); else p.delete(k); setParams(p) }

  return (
    <>
      <PageHead title="Study materials" sub="Notes, worksheets, slides and links your assessors share — every lesson in the course also has its own notes">
        <select value={theme} onChange={e => { set('theme', e.target.value); set('topic', '') }} style={{ width: 'auto' }} aria-label="Theme">
          <option value={0}>All themes</option>
          {THEMES.map(t => <option key={t.no} value={t.no}>Theme {t.no}</option>)}
        </select>
        <select value={topic} onChange={e => set('topic', e.target.value)} style={{ width: 'auto', maxWidth: 260 }} aria-label="Topic">
          <option value="">All topics</option>
          {TOPICS.filter(t => !theme || t.theme === theme).map(t => <option key={t.code} value={t.code}>{t.code} {t.title}</option>)}
        </select>
        {staff && !adding && <button onClick={() => setAdding(true)}>Add material</button>}
      </PageHead>
      <Alert kind="error">{error}</Alert>
      {adding && <AddMaterial initialTopic={topic} onDone={() => { setAdding(false); load() }} />}
      <div className="card">
        {list.length === 0 ? <Empty>{staff ? 'Nothing shared yet. Add worksheets, slides, articles or notes for your students.' : 'Your assessors have not shared anything here yet. The course lessons cover the whole specification.'}</Empty>
          : <div className="stack">{list.map(m => <MaterialRow key={m.id} m={m} onDelete={m.created_by === profile?.id || profile?.role === 'admin' ? () => remove(m) : undefined} />)}</div>}
      </div>
    </>
  )
}

function AddMaterial({ initialTopic, onDone }: { initialTopic: string; onDone: () => void }) {
  const { profile } = useAuth()
  const [classes, setClasses] = useState<ClassRow[]>([])
  const [f, setF] = useState({ title: '', kind: 'file' as Material['kind'], topic: initialTopic, class_id: '', url: '', body: '' })
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    supabase.from('classes').select('*').eq('assessor_id', profile!.id).order('name').then(({ data }) => setClasses((data as ClassRow[]) ?? []))
  }, [profile])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError('')
    if (f.kind === 'file' && !file) return setError('Choose a file to upload.')
    if (file && file.size > 25 * 1024 * 1024) return setError('Files must be 25 MB or smaller.')
    setBusy(true)
    let storage_path: string | null = null
    if (f.kind === 'file' && file) {
      storage_path = `${profile!.id}/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]+/g, '_')}`
      const { error } = await supabase.storage.from('materials').upload(storage_path, file, { contentType: file.type })
      if (error) { setBusy(false); return setError(errMsg(error)) }
    }
    const { error } = await supabase.from('study_materials').insert({
      title: f.title.trim(), kind: f.kind, topic_code: f.topic || null, theme: f.topic ? Number(f.topic[0]) : null,
      class_id: f.class_id || null, url: f.kind === 'link' ? f.url.trim() : null, body: f.kind === 'note' ? f.body : null, storage_path,
    })
    if (error) {
      if (storage_path) await supabase.storage.from('materials').remove([storage_path])
      setBusy(false)
      return setError(errMsg(error))
    }
    setBusy(false)
    onDone()
  }

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Add study material</h2>
      <div className="form cols">
        <label>Title<input required maxLength={200} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="e.g. Elasticity worksheet" /></label>
        <label>Type
          <select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as Material['kind'] })}>
            <option value="file">File (PDF, Word, PowerPoint, image)</option>
            <option value="link">Link</option>
            <option value="note">Written note</option>
          </select>
        </label>
        <label>Topic
          <select value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })}>
            <option value="">General (no topic)</option>
            {TOPICS.map(t => <option key={t.code} value={t.code}>{t.code} {t.title}</option>)}
          </select>
        </label>
        <label>Share with
          <select value={f.class_id} onChange={e => setF({ ...f, class_id: e.target.value })}>
            <option value="">All my students</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>
      {f.kind === 'file' && <label>File<input type="file" accept=".pdf,.docx,.pptx,.xlsx,.png,.jpg,.jpeg,.webp" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>}
      {f.kind === 'link' && <label>URL<input type="url" required pattern="https?://.+" value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://" /></label>}
      {f.kind === 'note' && <label>Note<textarea required maxLength={20000} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} placeholder="Blank lines separate paragraphs; start lines with - for bullets" /></label>}
      <small className="muted">Only share material you have the right to share. Files are private to signed-in students and parents you teach.</small>
      <Alert kind="error">{error}</Alert>
      <div className="row"><button disabled={busy}>{busy ? 'Saving…' : 'Share'}</button><button type="button" className="secondary" onClick={onDone}>Cancel</button></div>
    </form>
  )
}
