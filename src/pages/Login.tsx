import { useState, type FormEvent } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { normaliseMobile } from '../lib/auth'
import { Alert } from '../components/ui'

type Mode = 'signin' | 'signup'
type Method = 'email' | 'mobile' | 'magic'

const nextExamYear = () => {
  const d = new Date()
  return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear()
}

export default function Login() {
  const [mode, setMode] = useState<Mode>('signin')
  const [method, setMethod] = useState<Method>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [f, setF] = useState({
    email: '', mobile: '', password: '', full_name: '', role: 'student',
    year_group: 'A', exam_year: String(nextExamYear() + 1), invite_code: '',
  })
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  async function signIn(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      if (method === 'email') {
        const { error } = await supabase.auth.signInWithPassword({ email: f.email.trim(), password: f.password })
        if (error) throw error
      } else if (method === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email: f.email.trim(),
          options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname },
        })
        if (error) throw error
        setInfo('Check your inbox for a sign-in link.')
      } else {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mobile-login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({ mobile: normaliseMobile(f.mobile), password: f.password }),
        })
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? 'Sign-in failed')
        const { error } = await supabase.auth.setSession(body)
        if (error) throw error
      }
    } catch (err) {
      setError(errMsg(err))
    } finally {
      setBusy(false)
    }
  }

  async function signUp(e: FormEvent) {
    e.preventDefault()
    setBusy(true); setError(''); setInfo('')
    try {
      if (f.password.length < 8) throw new Error('Use a password of at least 8 characters.')
      const mobile = normaliseMobile(f.mobile)
      if (mobile && !/^\+\d{9,15}$/.test(mobile)) throw new Error('Enter a valid mobile number, e.g. 07700 900123.')
      if (f.role === 'assessor') {
        const { data: valid } = await supabase.rpc('check_invite_code', { code: f.invite_code })
        if (!valid) throw new Error('That assessor invite code is not valid.')
      }
      const { data, error } = await supabase.auth.signUp({
        email: f.email.trim(),
        password: f.password,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          data: {
            full_name: f.full_name.trim(),
            mobile,
            role: f.role,
            year_group: f.year_group,
            exam_year: f.exam_year,
            invite_code: f.role === 'assessor' ? f.invite_code.trim() : undefined,
          },
        },
      })
      if (error) throw error
      if (!data.session) setInfo('Account created. Check your email to confirm, then sign in.')
    } catch (err) {
      const m = errMsg(err)
      setError(m.includes('Database error') ? 'That mobile number is already registered to another account.' : m)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <section className="auth-hero">
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark" style={{ background: 'var(--accent)' }}>£€</span>EconPrep A</div>
        <h1>Edexcel A Level Economics A, organised.</h1>
        <p>One place for classes, tuition, exams and revision — for AS (8EC0) and A level (9EC0).</p>
        <ul>
          <li>Personal study timetable built around your exam dates</li>
          <li>Timed exams with auto-marked MCQs and assessor marking</li>
          <li>Past paper tracker for every series 2016–2026</li>
          <li>Reports shared with parents and assessors</li>
        </ul>
      </section>
      <section className="auth-panel">
        <div className="card auth-card">
          <div className="tabs" role="tablist">
            <button className={mode === 'signin' ? 'on' : ''} onClick={() => setMode('signin')}>Sign in</button>
            <button className={mode === 'signup' ? 'on' : ''} onClick={() => setMode('signup')}>Create account</button>
          </div>

          {mode === 'signin' ? (
            <form className="form" onSubmit={signIn}>
              <div className="row" role="radiogroup" aria-label="Sign-in method">
                {(['email', 'mobile', 'magic'] as Method[]).map(m => (
                  <button type="button" key={m} className={`sm ${method === m ? '' : 'secondary'}`} onClick={() => setMethod(m)}>
                    {m === 'email' ? 'Email' : m === 'mobile' ? 'Mobile number' : 'Email link'}
                  </button>
                ))}
              </div>
              {method === 'mobile' ? (
                <label>Mobile number<input type="tel" autoComplete="tel" required value={f.mobile} onChange={set('mobile')} placeholder="07700 900123" /></label>
              ) : (
                <label>Email<input type="email" autoComplete="email" required value={f.email} onChange={set('email')} /></label>
              )}
              {method !== 'magic' && (
                <label>Password<input type="password" autoComplete="current-password" required value={f.password} onChange={set('password')} /></label>
              )}
              <Alert kind="error">{error}</Alert>
              <Alert kind="success">{info}</Alert>
              <button disabled={busy}>{busy ? 'Please wait…' : method === 'magic' ? 'Email me a link' : 'Sign in'}</button>
            </form>
          ) : (
            <form className="form" onSubmit={signUp}>
              <label>I am a
                <select value={f.role} onChange={set('role')}>
                  <option value="student">Student</option>
                  <option value="parent">Parent / guardian</option>
                  <option value="assessor">Assessor (teacher / tutor)</option>
                </select>
              </label>
              <label>Full name<input required value={f.full_name} onChange={set('full_name')} autoComplete="name" /></label>
              <label>Email<input type="email" required value={f.email} onChange={set('email')} autoComplete="email" /></label>
              <label>Mobile number<input type="tel" value={f.mobile} onChange={set('mobile')} placeholder="07700 900123" autoComplete="tel" />
                <small>Lets you sign in with your mobile number as well as your email.</small>
              </label>
              <label>Password<input type="password" required minLength={8} value={f.password} onChange={set('password')} autoComplete="new-password" /></label>
              {f.role === 'student' && (
                <div className="form cols">
                  <label>Studying for
                    <select value={f.year_group} onChange={set('year_group')}>
                      <option value="AS">AS level (8EC0)</option>
                      <option value="A">A level (9EC0)</option>
                    </select>
                  </label>
                  <label>Exam year<input type="number" min={2024} max={2035} value={f.exam_year} onChange={set('exam_year')} /></label>
                </div>
              )}
              {f.role === 'assessor' && (
                <label>Assessor invite code<input required value={f.invite_code} onChange={set('invite_code')} />
                  <small>Ask your centre administrator or an existing assessor (shown on their Profile page).</small>
                </label>
              )}
              <Alert kind="error">{error}</Alert>
              <Alert kind="success">{info}</Alert>
              <button disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
            </form>
          )}
        </div>
      </section>
    </div>
  )
}
