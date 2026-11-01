// End-to-end check of auth, roles and row-level security against a Supabase project.
// Usage: node --env-file=.env.local --env-file=.env.supabase scripts/e2e-rls.mjs
// Creates (or reuses) demo accounts and writes their credentials to .env.demo (git-ignored).
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const admin = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const client = () => createClient(URL, ANON, { auth: { persistSession: false } })

let failures = 0
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
  if (!cond) failures++
}

const demo = existsSync('.env.demo')
  ? Object.fromEntries(readFileSync('.env.demo', 'utf8').trim().split('\n').map(l => l.split('=')))
  : { DEMO_PASSWORD: randomBytes(9).toString('base64url') }
writeFileSync('.env.demo', Object.entries(demo).map(([k, v]) => `${k}=${v}`).join('\n') + '\n')
const PW = demo.DEMO_PASSWORD

const { data: code } = await admin.from('app_settings').select('value').eq('key', 'assessor_invite_code').single()
const people = {
  assessor: { email: 'demo.assessor@econprep-demo.com', mobile: '+447700900001', role: 'assessor', invite_code: code.value, full_name: 'Demo Assessor' },
  student: { email: 'demo.student@econprep-demo.com', mobile: '+447700900002', role: 'student', year_group: 'A', exam_year: '2027', full_name: 'Demo Student' },
  parent: { email: 'demo.parent@econprep-demo.com', mobile: '+447700900003', role: 'parent', full_name: 'Demo Parent' },
  other: { email: 'demo.student2@econprep-demo.com', mobile: '+447700900004', role: 'student', year_group: 'AS', exam_year: '2027', full_name: 'Demo Student Two' },
}

const c = {}
for (const [k, p] of Object.entries(people)) {
  c[k] = client()
  let { error } = await c[k].auth.signInWithPassword({ email: p.email, password: PW })
  if (error) {
    const { email, ...meta } = p
    const r = await c[k].auth.signUp({ email, password: PW, options: { data: meta } })
    if (r.error) throw r.error
    ;({ error } = await c[k].auth.signInWithPassword({ email: p.email, password: PW }))
    if (error) throw error
  }
  const { data: u } = await c[k].auth.getUser()
  const { data } = await c[k].from('profiles').select('*').eq('id', u.user.id).single()
  p.profile = data
}

check('roles assigned by trigger', people.assessor.profile.role === 'assessor' && people.student.profile.role === 'student' && people.parent.profile.role === 'parent')
check('student has link code', /^[0-9A-F]{8}$/.test(people.student.profile.link_code ?? ''))

// role escalation blocked
const esc = await c.student.from('profiles').update({ role: 'admin' }).eq('id', people.student.profile.id)
check('student cannot change own role', !!esc.error, esc.error?.message)

// bad invite code -> student
const badRole = await admin.rpc('check_invite_code', { code: 'nope' })
check('invalid invite code rejected', badRole.data === false)

// mobile login edge function
const ml = await fetch(`${URL}/functions/v1/mobile-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ mobile: people.student.mobile, password: PW }),
})
check('mobile + password sign-in', ml.ok && !!(await ml.json()).access_token)
const mlBad = await fetch(`${URL}/functions/v1/mobile-login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON, Authorization: `Bearer ${ANON}` },
  body: JSON.stringify({ mobile: people.student.mobile, password: 'wrong-password' }),
})
check('mobile sign-in rejects wrong password', mlBad.status === 401)
const emailLookup = await c.student.rpc('email_for_mobile', { m: people.assessor.mobile })
check('clients cannot resolve mobile -> email', !!emailLookup.error)

// class + session + attendance
let { data: cls } = await c.assessor.from('classes').select('*').eq('name', 'Demo Y13 Economics').maybeSingle()
if (!cls) ({ data: cls } = await c.assessor.from('classes').insert({ name: 'Demo Y13 Economics', kind: 'classroom', level: 'A', weekly_schedule: 'Tue & Thu 14:00' }).select().single())
const add = await c.assessor.rpc('add_student_to_class', { cid: cls.id, identifier: people.student.mobile })
check('assessor adds student by mobile', !add.error, add.error?.message)
const studentCreatesClass = await c.student.from('classes').insert({ name: 'hack' })
check('student cannot create class', !!studentCreatesClass.error)
const start = new Date(Date.now() - 86400000)
const { data: sess } = await c.assessor.from('class_sessions').insert({
  class_id: cls.id, title: 'Elasticities workshop', topic_code: '1.2.3', starts_at: start.toISOString(), ends_at: new Date(start.getTime() + 3600000).toISOString(),
}).select().single()
const att = await c.assessor.from('attendance').upsert({ session_id: sess.id, student_id: people.student.profile.id, status: 'present' })
check('assessor records attendance', !att.error, att.error?.message)
const attHack = await c.student.from('attendance').upsert({ session_id: sess.id, student_id: people.student.profile.id, status: 'present' })
check('student cannot write attendance', !!attHack.error)
const otherSees = await c.other.from('class_sessions').select('id').eq('class_id', cls.id)
check('non-member cannot see class sessions', (otherSees.data ?? []).length === 0)

// exam: 3 MCQs + 1 short answer
// questions this student has never been examined on, so their keys must still be hidden
const { data: seen } = await admin.from('attempt_answers').select('question_id, attempts!inner(student_id)').eq('attempts.student_id', people.student.profile.id)
const seenIds = new Set((seen ?? []).map(r => r.question_id))
const { data: allMcq } = await admin.from('questions').select('id').eq('type', 'mcq')
const mcqs = allMcq.filter(q => !seenIds.has(q.id)).sort(() => Math.random() - 0.5).slice(0, 3)
const { data: short } = await admin.from('questions').select('id, marks').eq('type', 'short').eq('theme', 1).limit(1).single()
const { data: exam } = await c.assessor.from('exams').insert({ title: `Demo Theme 1 quiz ${new Date().toISOString().slice(0, 16)}`, level: 'A', kind: 'quiz', class_id: cls.id, duration_minutes: 20, published: true }).select().single()
const eqIns = await c.assessor.from('exam_questions').insert([...mcqs, short].map((q, i) => ({ exam_id: exam.id, question_id: q.id, position: i })))
check('assessor builds exam', !eqIns.error, eqIns.error?.message)

const keysBefore = await c.student.from('question_keys').select('*').in('question_id', mcqs.map(q => q.id))
check('student cannot read answer keys before sitting', (keysBefore.data ?? []).length === 0)
const [s1, s2] = await Promise.all([c.student.rpc('start_attempt', { eid: exam.id }), c.student.rpc('start_attempt', { eid: exam.id })])
const { data: aid, error: startErr } = s1
check('student starts attempt', !startErr, startErr?.message)
check('concurrent starts share one attempt', s1.data === s2.data, `${s1.data} vs ${s2.data}`)
const peek = await c.student.rpc('reveal_key', { qid: mcqs[0].id })
check('practice reveal blocked during exam', !!peek.error)
const { data: keys } = await admin.from('question_keys').select('question_id, answer').in('question_id', mcqs.map(q => q.id))
for (const [i, k] of keys.entries()) await c.student.rpc('save_answer', { aid, qid: k.question_id, resp: i === 0 ? 'Z' : k.answer })
await c.student.rpc('save_answer', { aid, qid: short.id, resp: 'Demand is price inelastic because...' })
const directWrite = await c.student.from('attempt_answers').update({ awarded_marks: 99 }).eq('attempt_id', aid)
check('student cannot award own marks', !!directWrite.error || (directWrite.count ?? 0) === 0)
const sub = await c.student.rpc('submit_attempt', { aid })
check('student submits', !sub.error, sub.error?.message)
const resit = await c.student.rpc('start_attempt', { eid: exam.id })
check('cannot re-sit a submitted exam', !!resit.error, resit.error?.message)
let { data: att1 } = await c.student.from('attempts').select('*').eq('id', aid).single()
check('MCQs auto-marked, written pending', att1.status === 'submitted' && Number(att1.score) === 2, `score ${att1.score}/${att1.max_score}`)
const keysAfter = await c.student.from('question_keys').select('*').in('question_id', mcqs.map(q => q.id))
check('student sees keys after submitting', (keysAfter.data ?? []).length === 3)

const otherMark = await c.other.rpc('mark_attempt', { aid, marks: [], overall_feedback: 'x' })
check('another student cannot mark', !!otherMark.error)
const tooMany = await c.assessor.rpc('mark_attempt', { aid, marks: [{ question_id: short.id, awarded_marks: short.marks + 1 }], overall_feedback: null })
check('marks above maximum rejected', !!tooMany.error)
const mk = await c.assessor.rpc('mark_attempt', { aid, marks: [{ question_id: short.id, awarded_marks: 3, comment: 'Good application' }], overall_feedback: 'Solid start.' })
check('assessor marks attempt', !mk.error, mk.error?.message)
;({ data: att1 } = await c.student.from('attempts').select('*').eq('id', aid).single())
check('attempt marked with grade', att1.status === 'marked' && !!att1.grade, `${att1.score}/${att1.max_score} = ${att1.percent}% → ${att1.grade}`)

// past paper result + report
const pp = await c.student.from('past_paper_results').insert({ student_id: people.student.profile.id, past_paper_id: 'A-P1-2019-06', marks: 68, max_marks: 100, grade: 'A', source: 'self' })
check('student logs past paper', !pp.error, pp.error?.message)
const ppHack = await c.other.from('past_paper_results').insert({ student_id: people.student.profile.id, past_paper_id: 'A-P1-2019-06', marks: 1, max_marks: 100, source: 'self' })
check('cannot log results for someone else', !!ppHack.error)
const rep = await c.assessor.from('reports').insert({ student_id: people.student.profile.id, period: 'Autumn term', working_grade: 'B', predicted_grade: 'A', effort: 4, comments: 'Strong analysis; work on evaluation.' })
check('assessor writes report', !rep.error, rep.error?.message)

// parent linking
const link = await c.parent.rpc('link_child', { code: people.student.profile.link_code })
check('parent links child with code', !link.error, link.error?.message)
const pAttempts = await c.parent.from('attempts').select('id').eq('student_id', people.student.profile.id)
const pReports = await c.parent.from('reports').select('id').eq('student_id', people.student.profile.id)
check('parent sees child attempts and reports', (pAttempts.data ?? []).length > 0 && (pReports.data ?? []).length > 0)
const pOther = await c.parent.from('profiles').select('id').eq('id', people.other.profile.id)
check('parent cannot see unlinked student', (pOther.data ?? []).length === 0)
const oAttempts = await c.other.from('attempts').select('id').eq('student_id', people.student.profile.id)
check('student cannot see another student attempts', (oAttempts.data ?? []).length === 0)
const otherLink = await c.other.rpc('link_child', { code: people.student.profile.link_code })
check('student account cannot use parent linking', !!otherLink.error)

console.log(`\n${failures ? `${failures} FAILED` : 'All checks passed'}`)
process.exit(failures ? 1 : 0)
