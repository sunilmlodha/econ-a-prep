import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const configured = Boolean(url && anonKey)

export const supabase = createClient(url || 'http://localhost', anonKey || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

export type Role = 'student' | 'parent' | 'assessor' | 'admin'

export interface Profile {
  id: string
  full_name: string
  email: string | null
  mobile: string | null
  role: Role
  year_group: 'AS' | 'A' | null
  exam_year: number | null
  target_grade: string | null
  school: string | null
  link_code: string | null
}

export interface ClassRow {
  id: string
  name: string
  kind: 'classroom' | 'tuition'
  level: 'AS' | 'A' | 'both'
  description: string | null
  weekly_schedule: string | null
  meeting_url: string | null
  assessor_id: string
}

export interface SessionRow {
  id: string
  class_id: string
  title: string
  topic_code: string | null
  starts_at: string
  ends_at: string
  location: string | null
  notes: string | null
  homework: string | null
}

export interface Question {
  id: string
  theme: number
  topic_code: string
  level: 'AS' | 'A'
  type: 'mcq' | 'short' | 'data' | 'essay'
  marks: number
  prompt: string
  context: string | null
  options: string[] | null
}

export interface QuestionKey {
  answer: string | null
  explanation: string | null
  mark_scheme: string | null
}

export interface Exam {
  id: string
  title: string
  description: string | null
  level: 'AS' | 'A'
  kind: 'quiz' | 'homework' | 'mock' | 'past_paper'
  class_id: string | null
  duration_minutes: number | null
  opens_at: string | null
  closes_at: string | null
  published: boolean
  created_by: string
  created_at: string
}

export interface Attempt {
  id: string
  exam_id: string
  student_id: string
  status: 'in_progress' | 'submitted' | 'marked'
  started_at: string
  submitted_at: string | null
  score: number | null
  max_score: number | null
  percent: number | null
  grade: string | null
  feedback: string | null
}

export interface PastPaper {
  id: string
  qualification: 'AS' | 'A'
  spec_code: string
  paper_no: number
  title: string
  themes: string
  series: string
  year: number
  month: number
  duration_minutes: number
  total_marks: number
  availability: 'public' | 'secure' | 'no_exam'
  qp_url: string | null
  qp_path: string | null
  ms_path: string | null
  er_path: string | null
  notes: string | null
}

export interface PaperResult {
  id: string
  student_id: string
  past_paper_id: string
  marks: number
  max_marks: number
  percent: number
  grade: string | null
  source: 'self' | 'assessor'
  sat_on: string
  notes: string | null
}

export interface Report {
  id: string
  student_id: string
  author_id: string
  period: string
  working_grade: string | null
  predicted_grade: string | null
  target_grade: string | null
  effort: number | null
  attendance_pct: number | null
  strengths: string | null
  next_steps: string | null
  comments: string | null
  created_at: string
}

export const errMsg = (e: unknown) =>
  e && typeof e === 'object' && 'message' in e ? String((e as { message: string }).message) : String(e)
