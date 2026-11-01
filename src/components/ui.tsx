import { useEffect, useState, type ReactNode } from 'react'
import { gradeTone } from '../lib/grades'
import { supabase, type Profile } from '../lib/supabase'
import { useAuth } from '../lib/auth'

export function PageHead({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{title}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  )
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  )
}

export const Grade = ({ g }: { g?: string | null }) =>
  g ? <span className={`badge ${gradeTone(g)} grade`}>{g}</span> : <span className="muted">—</span>

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>

export const Alert = ({ kind, children }: { kind?: 'error' | 'success'; children: ReactNode }) =>
  children ? <div className={`alert ${kind ?? ''}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div> : null

export const Loading = () => <p className="muted">Loading…</p>

export const fmtDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
export const fmtDateTime = (s?: string | null) =>
  s ? new Date(s).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

/** Students the signed-in user may view: self (student), linked children (parent), class members (assessor). */
export function useViewableStudents() {
  const { profile } = useAuth()
  const [students, setStudents] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    if (!profile) return
    if (profile.role === 'student') {
      setStudents([profile])
      setLoading(false)
      return
    }
    supabase.from('profiles').select('*').eq('role', 'student').neq('id', profile.id).order('full_name')
      .then(({ data }) => {
        setStudents((data as Profile[]) ?? [])
        setLoading(false)
      })
  }, [profile])
  return { students, loading }
}

export function StudentPicker({ students, value, onChange }: { students: Profile[]; value: string; onChange: (id: string) => void }) {
  if (students.length <= 1) return null
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={{ width: 'auto', minWidth: 220 }} aria-label="Student">
      {students.map(s => <option key={s.id} value={s.id}>{s.full_name || s.email}</option>)}
    </select>
  )
}

/** Simple SVG line chart of percentages over time. */
export function LineChart({ points, target }: { points: { label: string; value: number }[]; target?: number }) {
  if (points.length === 0) return <Empty>No results yet.</Empty>
  const W = 560, H = 200, pad = 32
  const x = (i: number) => pad + (points.length === 1 ? (W - 2 * pad) / 2 : (i * (W - 2 * pad)) / (points.length - 1))
  const y = (v: number) => H - pad - (v / 100) * (H - 2 * pad)
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Score trend">
      {[0, 25, 50, 75, 100].map(v => (
        <g key={v}>
          <line className="gridline" x1={pad} x2={W - pad} y1={y(v)} y2={y(v)} />
          <text x={4} y={y(v) + 4}>{v}%</text>
        </g>
      ))}
      {target != null && <line className="target" x1={pad} x2={W - pad} y1={y(target)} y2={y(target)} />}
      <polyline className="line" points={points.map((p, i) => `${x(i)},${y(p.value)}`).join(' ')} />
      {points.map((p, i) => (
        <g key={i}>
          <circle className="dot" cx={x(i)} cy={y(p.value)} r={4}><title>{`${p.label}: ${p.value}%`}</title></circle>
          {(points.length <= 8 || i % Math.ceil(points.length / 8) === 0) && (
            <text x={x(i)} y={H - 8} textAnchor="middle">{p.label}</text>
          )}
        </g>
      ))}
    </svg>
  )
}

export function Bar({ value }: { value: number }) {
  return <div className="bar" aria-hidden><span style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}
