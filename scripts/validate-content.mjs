// Validates course lessons (seed/lessons/*.json) and mock papers (seed/mocks/*.json).
// Usage: node scripts/validate-content.mjs [file ...]   (no args = everything)
import { readFileSync, readdirSync, existsSync } from 'node:fs'

const root = new URL('..', import.meta.url)
const specSrc = readFileSync(new URL('src/lib/spec.ts', root), 'utf8')
const SPEC = new Map([...specSrc.matchAll(/t\((\d), '[^']*', '([\d.]+)', '([^']+)'/g)].map(m => [m[2], { theme: +m[1], title: m[3] }]))

const errors = []
const err = (where, msg) => errors.push(`${where}: ${msg}`)
const str = (v, min = 1) => typeof v === 'string' && v.trim().length >= min
const arr = (v, lo, hi) => Array.isArray(v) && v.length >= lo && v.length <= hi

function checkDiagram(w, d) {
  if (!str(d.title) || !str(d.x) || !str(d.y)) err(w, 'diagram needs title, x and y axis labels')
  if (!arr(d.lines, 1, 8)) return err(w, 'diagram needs 1–8 lines')
  const inRange = p => Array.isArray(p) && p.length === 2 && p.every(n => typeof n === 'number' && n >= 0 && n <= 10)
  for (const l of d.lines) {
    if (!str(l.label) || !arr(l.points, 2, 40) || !l.points.every(inRange)) err(w, `diagram line "${l.label}" needs a label and 2+ [x,y] points within 0–10`)
    if (l.style && !['solid', 'dashed', 'shift'].includes(l.style)) err(w, `diagram line style must be solid|dashed|shift`)
  }
  for (const p of d.points ?? []) if (!inRange([p.x, p.y])) err(w, 'diagram point x/y must be within 0–10')
  for (const a of d.areas ?? []) if (!arr(a.points, 3, 40) || !a.points.every(inRange)) err(w, 'diagram area needs 3+ points within 0–10')
  for (const a of d.arrows ?? []) if (!inRange(a.from) || !inRange(a.to)) err(w, 'diagram arrow from/to must be within 0–10')
}

function checkLesson(file, l, seen) {
  const w = `${file} ${l.topic_code}`
  const spec = SPEC.get(l.topic_code)
  if (!spec) return err(w, 'unknown topic_code')
  if (seen.has(l.topic_code)) err(w, 'duplicate lesson')
  seen.add(l.topic_code)
  if (l.title !== spec.title) err(w, `title must be exactly "${spec.title}"`)
  if (!(Number.isInteger(l.minutes) && l.minutes >= 30 && l.minutes <= 120)) err(w, 'minutes must be an integer 30–120')
  if (!str(l.overview, 80)) err(w, 'overview too short')
  if (!arr(l.objectives, 3, 7) || !l.objectives.every(s => str(s))) err(w, 'objectives: 3–7 strings')
  if (!arr(l.sections, 3, 8) || !l.sections.every(s => str(s.heading) && str(s.body, 200))) err(w, 'sections: 3–8 with heading and a body of 200+ chars')
  if (!arr(l.key_terms, 4, 15) || !l.key_terms.every(k => str(k.term) && str(k.definition, 20))) err(w, 'key_terms: 4–15 {term, definition}')
  if (!arr(l.diagrams ?? [], 0, 4)) err(w, 'diagrams: at most 4')
  for (const d of l.diagrams ?? []) checkDiagram(w, d)
  for (const f of l.formulae ?? []) if (!str(f.name) || !str(f.formula)) err(w, 'formulae need name and formula')
  if (!arr(l.applications, 2, 6) || !l.applications.every(s => str(s, 60))) err(w, 'applications: 2–6 strings of 60+ chars')
  if (!arr(l.evaluation, 3, 8) || !l.evaluation.every(s => str(s, 40))) err(w, 'evaluation: 3–8 strings')
  if (!arr(l.misconceptions, 2, 6)) err(w, 'misconceptions: 2–6')
  if (!arr(l.exam_tips, 2, 6)) err(w, 'exam_tips: 2–6')
  const m = l.model_answer
  if (!m || !str(m.question) || !Number.isInteger(m.marks) || !str(m.answer, 400) || !str(m.commentary, 80)) err(w, 'model_answer needs question, integer marks, answer (400+ chars) and commentary')
  if (!arr(l.check, 3, 6)) err(w, 'check: 3–6 questions')
  for (const c of l.check ?? []) {
    if (!str(c.q) || !arr(c.options, 4, 4) || !/^[A-D]$/.test(c.answer) || !str(c.explanation)) err(w, 'check question needs q, 4 options, answer A–D and explanation')
    if (c.options?.some(o => /^[A-D][).:\s]/.test(o))) err(w, 'check options must not start with a letter prefix')
  }
  for (const s of l.synoptic ?? []) if (!SPEC.has(s)) err(w, `synoptic code ${s} unknown`)
}

const PAPERS = { AS1: { level: 'AS', marks: 80, mins: 90, themes: [1] }, AS2: { level: 'AS', marks: 80, mins: 90, themes: [2] },
  A1: { level: 'A', marks: 100, mins: 120, themes: [1, 3] }, A2: { level: 'A', marks: 100, mins: 120, themes: [2, 4] }, A3: { level: 'A', marks: 100, mins: 120, themes: [1, 2, 3, 4] } }

function checkMock(file, m, ids) {
  const w = `${file} ${m.id}`
  const p = PAPERS[m.paper]
  if (!p) return err(w, 'paper must be AS1|AS2|A1|A2|A3')
  if (!/^[a-z0-9-]+$/.test(m.id ?? '')) err(w, 'id must be lowercase kebab')
  if (m.level !== p.level) err(w, `level must be ${p.level}`)
  if (m.duration_minutes !== p.mins) err(w, `duration_minutes must be ${p.mins}`)
  if (!str(m.title) || !str(m.description)) err(w, 'title and description required')
  if (!arr(m.questions, 8, 30)) return err(w, 'questions: 8–30')
  let total = 0
  for (const q of m.questions) {
    const qw = `${w} ${q.id}`
    if (ids.has(q.id)) err(qw, 'duplicate question id')
    ids.add(q.id)
    if (!q.id?.startsWith(`m-${m.id}-`)) err(qw, `question id must start with m-${m.id}-`)
    if (!['A', 'B', 'C'].includes(q.section)) err(qw, 'section must be A, B or C')
    if (!SPEC.has(q.topic_code)) err(qw, `unknown topic_code ${q.topic_code}`)
    else if (q.theme !== SPEC.get(q.topic_code).theme) err(qw, 'theme does not match topic_code')
    if (!p.themes.includes(q.theme)) err(qw, `theme ${q.theme} is not examined on ${m.paper}`)
    if (q.level !== p.level) err(qw, `level must be ${p.level}`)
    if (!['mcq', 'short', 'data', 'essay'].includes(q.type)) err(qw, 'bad type')
    if (!(Number.isInteger(q.marks) && q.marks > 0)) err(qw, 'marks must be a positive integer')
    if (!str(q.prompt)) err(qw, 'prompt required')
    if (q.type === 'mcq') {
      if (q.marks !== 1 || !arr(q.options, 4, 4) || !/^[A-D]$/.test(q.answer) || !str(q.explanation)) err(qw, 'mcq: 1 mark, 4 options, answer A–D, explanation')
      if (q.options && !q.options.every((o, i) => o.startsWith(`${'ABCD'[i]} `))) err(qw, 'mcq options must start with "A ", "B ", "C ", "D "')
    } else if (!str(q.mark_scheme, q.marks >= 8 ? 400 : 80)) err(qw, 'mark_scheme missing or too thin')
    if (q.type === 'data' && !str(q.context, 400)) err(qw, 'data questions need the shared extract in context')
    total += q.marks || 0
  }
  if (total !== p.marks) err(w, `total marks ${total}, expected ${p.marks}`)
}

const files = process.argv.slice(2)
const pick = dir => existsSync(new URL(dir, root)) ? readdirSync(new URL(dir, root)).filter(f => f.endsWith('.json')).map(f => dir + f) : []
const targets = files.length ? files : [...pick('seed/lessons/'), ...pick('seed/mocks/')]
const lessonsSeen = new Set()
const qids = new Set()
for (const f of targets) {
  let data
  try { data = JSON.parse(readFileSync(new URL(f.replace(/^\.\//, ''), root), 'utf8')) } catch (e) { err(f, `invalid JSON: ${e.message}`); continue }
  if (f.includes('lessons')) { if (!Array.isArray(data)) err(f, 'must be an array of lessons'); else data.forEach(l => checkLesson(f, l, lessonsSeen)) }
  else checkMock(f, data, qids)
}
if (!files.length) {
  const missing = [...SPEC.keys()].filter(c => !lessonsSeen.has(c))
  if (missing.length) err('lessons', `missing ${missing.length}: ${missing.join(' ')}`)
}
if (errors.length) { console.log(errors.join('\n')); console.log(`\n${errors.length} problem(s)`); process.exit(1) }
console.log(`OK — ${lessonsSeen.size} lessons, ${qids.size} mock questions checked`)
