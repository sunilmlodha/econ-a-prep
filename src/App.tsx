import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { configured } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Timetable from './pages/Timetable'
import Classes from './pages/Classes'
import ClassDetail from './pages/ClassDetail'
import Syllabus from './pages/Syllabus'
import Practice from './pages/Practice'
import Exams from './pages/Exams'
import ExamBuilder from './pages/ExamBuilder'
import TakeExam from './pages/TakeExam'
import AttemptView from './pages/AttemptView'
import PastPapers from './pages/PastPapers'
import Reports from './pages/Reports'
import Profile from './pages/Profile'
import Course from './pages/Course'
import Lesson from './pages/Lesson'
import Materials from './pages/Materials'
import Mocks from './pages/Mocks'

function Gate() {
  const { session, profile, loading } = useAuth()
  if (!configured) return <div className="main"><div className="alert error">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.</div></div>
  if (loading) return <div className="main"><p className="muted">Loading…</p></div>
  if (!session) return <Login />
  if (!profile) return <div className="main"><p className="muted">Setting up your profile…</p></div>
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="course" element={<Course />} />
        <Route path="course/:code" element={<Lesson />} />
        <Route path="materials" element={<Materials />} />
        <Route path="mocks" element={<Mocks />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="classes" element={<Classes />} />
        <Route path="classes/:id" element={<ClassDetail />} />
        <Route path="syllabus" element={<Syllabus />} />
        <Route path="practice" element={<Practice />} />
        <Route path="exams" element={<Exams />} />
        <Route path="exams/new" element={<ExamBuilder />} />
        <Route path="exams/:id/edit" element={<ExamBuilder />} />
        <Route path="exams/:id/take" element={<TakeExam />} />
        <Route path="attempts/:id" element={<AttemptView />} />
        <Route path="past-papers" element={<PastPapers />} />
        <Route path="reports" element={<Reports />} />
        <Route path="profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Gate />
      </HashRouter>
    </AuthProvider>
  )
}
