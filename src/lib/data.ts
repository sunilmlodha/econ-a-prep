import { supabase, type Attempt, type PaperResult, type Report, type SessionRow, type PastPaper } from './supabase'
import { gradeFor } from './grades'
import type { Level } from './spec'

export interface AttemptWithExam extends Attempt {
  exams: { title: string; kind: string; level: 'AS' | 'A' } | null
}
export interface ResultWithPaper extends PaperResult {
  past_papers: Pick<PastPaper, 'qualification' | 'paper_no' | 'series' | 'title'> | null
}
export interface AttendanceRow {
  status: 'present' | 'late' | 'absent' | 'excused'
  class_sessions: { starts_at: string; title: string } | null
}

export interface StudentSummary {
  attempts: AttemptWithExam[]
  results: ResultWithPaper[]
  attendance: AttendanceRow[]
  progress: Record<string, number>
  reports: Report[]
  attendancePct: number | null
  avgPct: number | null
  predicted: string | null
}

export async function loadStudentSummary(sid: string, level: Level): Promise<StudentSummary> {
  const [a, r, at, p, rep] = await Promise.all([
    supabase.from('attempts').select('*, exams(title, kind, level)').eq('student_id', sid).order('started_at', { ascending: true }),
    supabase.from('past_paper_results').select('*, past_papers(qualification, paper_no, series, title)').eq('student_id', sid).order('sat_on', { ascending: true }),
    supabase.from('attendance').select('status, class_sessions(starts_at, title)').eq('student_id', sid),
    supabase.from('topic_progress').select('topic_code, confidence').eq('student_id', sid),
    supabase.from('reports').select('*').eq('student_id', sid).order('created_at', { ascending: false }),
  ])
  // a silent partial load would publish a wrong predicted grade, so fail loudly instead
  const failed = [a, r, at, p, rep].find(x => x.error)
  if (failed?.error) throw failed.error
  const attempts = (a.data ?? []) as AttemptWithExam[]
  const results = (r.data ?? []) as ResultWithPaper[]
  const attendance = (at.data ?? []) as unknown as AttendanceRow[]
  const progress: Record<string, number> = {}
  for (const row of p.data ?? []) progress[row.topic_code] = row.confidence

  const counted = attendance.filter(x => x.status !== 'excused')
  const attendancePct = counted.length
    ? Math.round((counted.filter(x => x.status !== 'absent').length * 100) / counted.length)
    : null

  // prediction: mean of the latest 6 scored pieces (past papers + marked mocks at the student's level)
  const scored = [
    ...results.filter(x => x.past_papers?.qualification === level).map(x => ({ d: x.sat_on, v: Number(x.percent) })),
    ...attempts.filter(x => x.status === 'marked' && x.percent != null && x.exams?.level === level && x.exams?.kind !== 'quiz')
      .map(x => ({ d: x.submitted_at ?? x.started_at, v: Number(x.percent) })),
  ].sort((x, y) => x.d.localeCompare(y.d)).slice(-6)
  const avgPct = scored.length ? Math.round((scored.reduce((s, x) => s + x.v, 0) / scored.length) * 10) / 10 : null

  return { attempts, results, attendance, progress, reports: (rep.data ?? []) as Report[], attendancePct, avgPct, predicted: gradeFor(level, avgPct) }
}

export async function upcomingSessions(limit = 5) {
  const { data } = await supabase.from('class_sessions').select('*, classes(name, kind, meeting_url)')
    .gte('ends_at', new Date().toISOString()).order('starts_at').limit(limit)
  return (data ?? []) as (SessionRow & { classes: { name: string; kind: string; meeting_url: string | null } | null })[]
}
