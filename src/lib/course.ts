import { supabase } from './supabase'
import type { Level } from './spec'

type Pt = [number, number]

export interface DiagramSpec {
  title: string
  x: string
  y: string
  lines: { label: string; points: Pt[]; style?: 'solid' | 'dashed' | 'shift'; curve?: boolean }[]
  points?: { x: number; y: number; label?: string; guides?: boolean; xlabel?: string; ylabel?: string }[]
  areas?: { points: Pt[]; label?: string }[]
  arrows?: { from: Pt; to: Pt }[]
  caption?: string
}

export interface LessonContent {
  overview: string
  objectives: string[]
  sections: { heading: string; body: string }[]
  key_terms: { term: string; definition: string }[]
  diagrams?: DiagramSpec[]
  formulae?: { name: string; formula: string; example?: string }[]
  applications: string[]
  evaluation: string[]
  misconceptions: string[]
  exam_tips: string[]
  model_answer: { question: string; marks: number; answer: string; commentary: string }
  check: { q: string; options: string[]; answer: string; explanation: string }[]
  synoptic?: string[]
}

export interface LessonMeta {
  topic_code: string
  theme: number
  level: Level
  position: number
  title: string
  minutes: number
}

export interface Lesson extends LessonMeta { content: LessonContent }

export interface TopicProgress {
  topic_code: string
  confidence: number
  lesson_completed_at: string | null
}

export type MockPaper = 'AS1' | 'AS2' | 'A1' | 'A2' | 'A3'

export const PAPER_INFO: Record<MockPaper, { level: Level; name: string; themes: number[]; marks: number }> = {
  AS1: { level: 'AS', name: 'AS Paper 1 — Introduction to markets and market failure', themes: [1], marks: 80 },
  AS2: { level: 'AS', name: 'AS Paper 2 — The UK economy: performance and policies', themes: [2], marks: 80 },
  A1: { level: 'A', name: 'A level Paper 1 — Markets and business behaviour', themes: [1, 3], marks: 100 },
  A2: { level: 'A', name: 'A level Paper 2 — The national and global economy', themes: [2, 4], marks: 100 },
  A3: { level: 'A', name: 'A level Paper 3 — Microeconomics and macroeconomics', themes: [1, 2, 3, 4], marks: 100 },
}

export interface MockState {
  id: string
  title: string
  description: string | null
  paper: MockPaper
  level: Level
  duration_minutes: number
  attempt?: { id: string; status: 'in_progress' | 'submitted' | 'marked'; percent: number | null; grade: string | null; self_marked: boolean }
}

/** Library mock papers with this student's attempt on each (one attempt per paper). */
export async function loadMocks(studentId: string | null) {
  const { data, error } = await supabase.from('exams').select('id, title, description, paper, level, duration_minutes, slug')
    .eq('library', true).order('slug')
  if (error) throw error
  const mocks = (data ?? []) as Omit<MockState, 'attempt'>[]
  if (!studentId || !mocks.length) return mocks as MockState[]
  const { data: at, error: ae } = await supabase.from('attempts').select('id, exam_id, status, percent, grade, marked_by, student_id')
    .eq('student_id', studentId).in('exam_id', mocks.map(m => m.id))
  if (ae) throw ae
  return mocks.map(m => {
    const a = (at ?? []).find(x => x.exam_id === m.id)
    return { ...m, attempt: a && { id: a.id, status: a.status, percent: a.percent, grade: a.grade, self_marked: a.marked_by === a.student_id } }
  }) as MockState[]
}

export const lessonsFor =(all: LessonMeta[], level: Level) => all.filter(l => level === 'A' || l.theme <= 2)

export async function loadLessonIndex() {
  const { data, error } = await supabase.from('lessons').select('topic_code, theme, level, position, title, minutes').order('position')
  if (error) throw error
  return (data ?? []) as LessonMeta[]
}

export async function loadProgress(studentId: string) {
  const { data, error } = await supabase.from('topic_progress').select('topic_code, confidence, lesson_completed_at').eq('student_id', studentId)
  if (error) throw error
  const m: Record<string, TopicProgress> = {}
  for (const r of (data ?? []) as TopicProgress[]) m[r.topic_code] = r
  return m
}

export const progressStatus = (confidence: number) =>
  confidence === 0 ? 'not_started' : confidence <= 2 ? 'learning' : confidence <= 4 ? 'revised' : 'mastered'
