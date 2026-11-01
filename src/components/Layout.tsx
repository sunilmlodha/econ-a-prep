import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import type { Role } from '../lib/supabase'

const NAV: { to: string; label: string; ico: string; roles: Role[] }[] = [
  { to: '/', label: 'Dashboard', ico: '◧', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/course', label: 'Course', ico: '❖', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/timetable', label: 'Study timetable', ico: '▦', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/classes', label: 'Classes & tuition', ico: '◉', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/syllabus', label: 'Syllabus tracker', ico: '☰', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/practice', label: 'Practice bank', ico: '✎', roles: ['student', 'assessor', 'admin'] },
  { to: '/materials', label: 'Study materials', ico: '▣', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/mocks', label: 'Mock exams', ico: '⧗', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/exams', label: 'Exams & marking', ico: '✓', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/past-papers', label: 'Past papers', ico: '▤', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/reports', label: 'Reports', ico: '◔', roles: ['student', 'parent', 'assessor', 'admin'] },
  { to: '/profile', label: 'Profile & links', ico: '⚙', roles: ['student', 'parent', 'assessor', 'admin'] },
]

const ROLE_LABEL: Record<Role, string> = { student: 'Student', parent: 'Parent', assessor: 'Assessor', admin: 'Admin' }

export default function Layout() {
  const { profile, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  const role = profile?.role ?? 'student'

  return (
    <div className="shell">
      <div className="topbar">
        <button className="secondary sm" onClick={() => setOpen(o => !o)} aria-label="Menu">☰ Menu</button>
        <strong style={{ fontFamily: 'var(--serif)' }}>EconPrep A</strong>
      </div>
      <aside className={`sidebar ${open ? 'open' : ''}`} key={loc.pathname} onClick={() => setOpen(false)}>
        <div className="brand"><span className="brand-mark">£€</span>EconPrep A</div>
        <nav className="nav">
          {NAV.filter(n => n.roles.includes(role)).map(n => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <span className="ico" aria-hidden>{n.ico}</span>{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="who">
          <div><strong>{profile?.full_name || profile?.email}</strong></div>
          <div className="muted">{ROLE_LABEL[role]}{profile?.year_group ? ` · ${profile.year_group === 'AS' ? 'AS level' : 'A level'}` : ''}</div>
          <button className="ghost sm" style={{ paddingLeft: 0 }} onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  )
}
