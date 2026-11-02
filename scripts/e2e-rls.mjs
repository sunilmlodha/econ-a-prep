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
check('student has link code', /^[0-9A-F]{12}$/.test(people.student.profile.link_code ?? ''))

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

const prePeek = await c.student.rpc('reveal_key', { qid: mcqs[0].id })
check('practice reveal blocked for a set exam before starting', !!prePeek.error, prePeek.error?.message)
const anonPeek = await client().rpc('reveal_key', { qid: mcqs[0].id })
check('anonymous callers cannot reveal keys', !!anonPeek.error)
const parentPeek = await c.parent.rpc('reveal_key', { qid: mcqs[0].id })
check('parents cannot reveal keys', !!parentPeek.error)
const { data: future } = await c.assessor.from('exams').insert({ title: 'Demo future mock', level: 'A', kind: 'mock', class_id: cls.id, published: true, opens_at: new Date(Date.now() + 86400000).toISOString() }).select().single()
await c.assessor.from('exam_questions').insert({ exam_id: future.id, question_id: short.id, position: 0 })
const futureQs = await c.student.from('exam_questions').select('question_id').eq('exam_id', future.id)
check('questions of an unopened exam stay hidden', (futureQs.data ?? []).length === 0)
const ownerQs = await c.assessor.from('exam_questions').select('question_id').eq('exam_id', future.id)
check('exam owner still sees its questions', (ownerQs.data ?? []).length === 1)
await c.assessor.from('exams').delete().eq('id', future.id)
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

// exam integrity
const relist = await c.assessor.rpc('set_exam_questions', { eid: exam.id, qids: [mcqs[0].id] })
check('questions locked once students have started', !!relist.error, relist.error?.message)
const sneak = await c.assessor.from('exam_questions').insert({ exam_id: exam.id, question_id: mcqs[0].id === short.id ? mcqs[1].id : 't1-essay-01', position: 99 })
check('direct question insert into a sat exam refused', !!sneak.error)
const badDur = await c.assessor.from('exams').insert({ title: 'bad', level: 'A', duration_minutes: 0 })
check('zero time limit rejected', !!badDur.error)

const { data: ex2 } = await c.assessor.from('exams').insert({ title: 'Demo expiry check', level: 'A', kind: 'quiz', class_id: cls.id, duration_minutes: 5, published: true }).select().single()
await c.assessor.rpc('set_exam_questions', { eid: ex2.id, qids: [mcqs[1].id] })
const { data: aid2 } = await c.student.rpc('start_attempt', { eid: ex2.id })
await admin.from('exams').update({ closes_at: new Date(Date.now() - 600000).toISOString() }).eq('id', ex2.id)
const lateReveal = await c.student.rpc('reveal_key', { qid: mcqs[1].id })
check('keys stay hidden while an attempt is open after closing', !!lateReveal.error)
const lateSave = await c.student.rpc('save_answer', { aid: aid2, qid: mcqs[1].id, resp: 'A' })
check('answers cannot be saved after the exam closes', !!lateSave.error, lateSave.error?.message)
const auto = await admin.rpc('auto_submit_expired')
const { data: a2 } = await c.student.from('attempts').select('status').eq('id', aid2).single()
check('expired attempts are submitted automatically', !auto.error && a2.status !== 'in_progress', auto.error?.message ?? a2.status)

const { data: tmpCls } = await c.assessor.from('classes').insert({ name: 'Demo temp class', kind: 'tuition', level: 'A' }).select().single()
const { data: tmpExam } = await c.assessor.from('exams').insert({ title: 'Demo temp exam', level: 'A', class_id: tmpCls.id, published: true }).select().single()
await c.assessor.from('classes').delete().eq('id', tmpCls.id)
const { data: kept } = await c.assessor.from('exams').select('class_id, published').eq('id', tmpExam.id).single()
check('deleting a class keeps its exams, unpublished', !!kept && kept.class_id === null && kept.published === false)
await c.assessor.from('exams').delete().in('id', [tmpExam.id, ex2.id])

// past paper result + report
const pp = await c.student.from('past_paper_results').insert({ student_id: people.student.profile.id, past_paper_id: 'A-P1-2019-06', marks: 68, max_marks: 100, grade: 'A', source: 'self' })
check('student logs past paper', !pp.error, pp.error?.message)
const ppHack = await c.other.from('past_paper_results').insert({ student_id: people.student.profile.id, past_paper_id: 'A-P1-2019-06', marks: 1, max_marks: 100, source: 'self' })
check('cannot log results for someone else', !!ppHack.error)
const rep = await c.assessor.from('reports').insert({ student_id: people.student.profile.id, period: 'Autumn term', working_grade: 'B', predicted_grade: 'A', effort: 4, comments: 'Strong analysis; work on evaluation.' })
check('assessor writes report', !rep.error, rep.error?.message)

// staff contact details
const staffLeak = await c.other.from('profiles').select('email').eq('id', people.assessor.profile.id)
check('students outside a class cannot see assessor contact details', (staffLeak.data ?? []).length === 0)
const staffOk = await c.student.from('profiles').select('full_name').eq('id', people.assessor.profile.id)
check('students see their own assessor', (staffOk.data ?? []).length === 1)

// parent linking
const badLink = await c.parent.rpc('link_child', { code: 'DEADBEEF0000' })
check('wrong link code links nobody', !badLink.error && badLink.data === null)
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

{
// course lessons and lesson progress
const anonLessons = await client().from('lessons').select('topic_code').limit(1)
check('lessons are not public to signed-out visitors', (anonLessons.data ?? []).length === 0)
const sLessons = await c.student.from('lessons').select('topic_code, content').limit(1)
check('signed-in users can read lessons', !sLessons.error, sLessons.error?.message)
const lessonWrite = await c.assessor.from('lessons').insert({ topic_code: '9.9.9', theme: 1, level: 'AS', position: 999, title: 'x', minutes: 30, content: {} })
check('lessons cannot be written from the app', !!lessonWrite.error)
const done = await c.student.from('topic_progress').upsert({ student_id: people.student.profile.id, topic_code: '1.1.1', confidence: 4, status: 'revised', lesson_completed_at: new Date().toISOString() })
check('student marks a lesson complete', !done.error, done.error?.message)
const pDone = await c.parent.from('topic_progress').select('lesson_completed_at').eq('student_id', people.student.profile.id).eq('topic_code', '1.1.1').single()
check('parent sees lesson progress', !!pDone.data?.lesson_completed_at)

// study materials: class material reaches the class (and parents) only
const note = await c.assessor.from('study_materials').insert({ title: 'Demo elasticity note', kind: 'note', body: 'PED = %ΔQd ÷ %ΔP', topic_code: '1.2.3', theme: 1, class_id: cls.id }).select().single()
check('assessor shares a note with a class', !note.error, note.error?.message)
const sNote = await c.student.from('study_materials').select('id').eq('id', note.data?.id)
const pNote = await c.parent.from('study_materials').select('id').eq('id', note.data?.id)
const oNote = await c.other.from('study_materials').select('id').eq('id', note.data?.id)
check('class student and their parent see it; other student does not', sNote.data?.length === 1 && pNote.data?.length === 1 && oNote.data?.length === 0)
const sMat = await c.student.from('study_materials').insert({ title: 'hack', kind: 'note', body: 'x' })
check('students cannot add materials', !!sMat.error)
const path = `${people.assessor.profile.id}/demo-${Date.now()}.pdf`
const up = await c.assessor.storage.from('materials').upload(path, new Blob(['%PDF-1.4 demo'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
check('assessor uploads a file to their folder', !up.error, up.error?.message)
const fileRow = await c.assessor.from('study_materials').insert({ title: 'Demo worksheet', kind: 'file', storage_path: path, class_id: cls.id }).select().single()
const sUrl = await c.student.storage.from('materials').createSignedUrl(path, 60)
const oUrl = await c.other.storage.from('materials').createSignedUrl(path, 60)
check('class student can download the file; other student cannot', !sUrl.error && !!oUrl.error, sUrl.error?.message)
const foreign = await c.assessor.from('study_materials').insert({ title: 'x', kind: 'file', storage_path: `${people.student.profile.id}/x.pdf` })
check('material cannot point at someone else\'s folder', !!foreign.error)
await c.assessor.from('study_materials').delete().in('id', [note.data?.id, fileRow.data?.id].filter(Boolean))
await c.assessor.storage.from('materials').remove([path])

// library mock: anyone may sit it; the student self-marks, their assessor can override
const { data: bankQs } = await admin.from('questions').select('id, type, marks').eq('source', 'original').in('type', ['mcq', 'essay']).limit(40)
const mq = bankQs.find(q => q.type === 'mcq'), eq = bankQs.find(q => q.type === 'essay')
const { data: lib } = await admin.from('exams').insert({ title: 'Demo library mock', level: 'A', kind: 'mock', published: true, library: true, created_by: null, duration_minutes: 60 }).select().single()
await admin.from('exam_questions').insert([{ exam_id: lib.id, question_id: mq.id, position: 0, section: 'A' }, { exam_id: lib.id, question_id: eq.id, position: 1, section: 'B' }])
const otherSees = await c.other.from('exams').select('id').eq('id', lib.id)
check('library mocks are visible to every student', otherSees.data?.length === 1)
const assessorEdit = await c.assessor.from('exams').update({ title: 'hijack' }).eq('id', lib.id).select()
check('assessors cannot edit library mocks', !assessorEdit.data?.length)
const { data: la } = await c.student.rpc('start_attempt', { eid: lib.id })
await c.student.rpc('save_answer', { aid: la, qid: mq.id, resp: 'Z' })
await c.student.rpc('save_answer', { aid: la, qid: eq.id, resp: 'My essay answer' })
await c.student.rpc('submit_attempt', { aid: la })
const keyAfter = await c.student.from('question_keys').select('mark_scheme').eq('question_id', eq.id)
check('mark scheme visible to the student after submitting', keyAfter.data?.length === 1)
const mcqSelf = await c.student.rpc('mark_attempt', { aid: la, marks: [{ question_id: mq.id, awarded_marks: 1 }], overall_feedback: null })
check('students cannot change auto-marked MCQs', !!mcqSelf.error, mcqSelf.error?.message)
const tooMany = await c.student.rpc('mark_attempt', { aid: la, marks: [{ question_id: eq.id, awarded_marks: eq.marks + 1 }], overall_feedback: null })
check('self-marks are capped at the question maximum', !!tooMany.error)
const selfMark = await c.student.rpc('mark_attempt', { aid: la, marks: [{ question_id: eq.id, awarded_marks: 15 }], overall_feedback: 'Need more evaluation' })
const { data: selfA } = await c.student.from('attempts').select('status, marked_by, score').eq('id', la).single()
check('student self-marks a library mock', !selfMark.error && selfA.status === 'marked' && selfA.marked_by === people.student.profile.id, selfMark.error?.message)
const otherMark = await c.other.rpc('mark_attempt', { aid: la, marks: [{ question_id: eq.id, awarded_marks: 25 }], overall_feedback: null })
check('another student cannot mark it', !!otherMark.error)
const tMark = await c.assessor.rpc('mark_attempt', { aid: la, marks: [{ question_id: eq.id, awarded_marks: 12 }], overall_feedback: 'Moderated' })
check('their assessor can override self-marks', !tMark.error, tMark.error?.message)
const reSelf = await c.student.rpc('mark_attempt', { aid: la, marks: [{ question_id: eq.id, awarded_marks: 25 }], overall_feedback: null })
check('student cannot re-mark after the assessor', !!reSelf.error)
const studentResit = await c.student.rpc('start_attempt', { eid: lib.id })
check('students still cannot re-sit a library mock', !!studentResit.error)
const { data: ta, error: taErr } = await c.assessor.rpc('start_attempt', { eid: lib.id })
check('assessor can try a library mock', !taErr && !!ta, taErr?.message)
await c.assessor.rpc('save_answer', { aid: ta, qid: eq.id, resp: 'Staff try-out' })
const taSub = await c.assessor.rpc('submit_attempt', { aid: ta })
const taMark = await c.assessor.rpc('mark_attempt', { aid: ta, marks: [{ question_id: eq.id, awarded_marks: 20 }], overall_feedback: null })
check('assessor submits and self-marks a try-out', !taSub.error && !taMark.error, taSub.error?.message ?? taMark.error?.message)
const { data: ta2, error: ta2Err } = await c.assessor.rpc('start_attempt', { eid: lib.id })
const { data: taRows } = await admin.from('attempts').select('id').eq('exam_id', lib.id).eq('student_id', people.assessor.profile.id)
check('assessor can sit it again, replacing the old try', !ta2Err && ta2 !== ta && taRows?.length === 1, ta2Err?.message)
const staffClassExam = await c.assessor.rpc('start_attempt', { eid: exam.id })
check('assessors still cannot sit class exams', !!staffClassExam.error)
const { data: parentProfile } = await c.parent.from('profiles').select('role').eq('id', people.parent.profile.id).single()
const parentTry = await c.parent.rpc('start_attempt', { eid: lib.id })
check('parents cannot sit mocks', parentProfile?.role === 'parent' && !!parentTry.error)
const studentSeesStaff = await c.student.from('attempts').select('id').eq('id', ta2)
check('students cannot see staff try-outs', !studentSeesStaff.data?.length)
await admin.from('exams').delete().eq('id', lib.id)
}

console.log(`\n${failures ? `${failures} FAILED` : 'All checks passed'}`)
process.exit(failures ? 1 : 0)
