# EconPrep A — Edexcel A Level Economics A preparation app

A web app for preparing for **Pearson Edexcel A Level Economics A (9EC0)** and **AS Economics A (8EC0)**. It brings classes, tuition, exams, marking, past papers, a study timetable and progress reports into one place for **students, parents and assessors**.

**Live app:** https://sunilmlodha.github.io/econ-a-prep/

## Features

| Area | What it does |
| --- | --- |
| **Roles & sign-in** | Students, parents and assessors (teachers/tutors) sign in with **email + password**, **mobile number + password**, or an **email magic link**. Assessor accounts need an invite code. |
| **Classes & tuition** | Assessors create classroom groups or 1:1/small-group tuition, add students by email, mobile or link code, schedule one-off or weekly sessions (topic, location, online link, homework) and take registers. |
| **Course** | The complete course: one lesson for each of the 87 specification topics (Themes 1–4), written to A* standard — teaching notes, key terms, every diagram students must draw (rendered from data), formulae with worked examples, UK applications, evaluation points, common mistakes, exam tips, a model top-band answer with commentary and a self-check quiz. Students mark lessons complete and rate their confidence. |
| **A\* readiness advisor** | Works out the hours each student still needs (lessons left, three spaced revision rounds on insecure topics, timed papers with marking), the weekly study time that requires before their first paper, whether they are on track against their timetable, the gap to the A\* (or AS grade A) boundary, and a ranked "do next" list. Shown on the dashboard, timetable and parent view. |
| **Mock exams** | A library of 10 full-length original mock papers in the Edexcel format — AS Papers 1–2 and A level Papers 1–3, two sets each — timed, with sections, data-response extracts and levels-based mark schemes. Any student can sit them; MCQs mark themselves, students self-mark written answers against the mark scheme, and their assessor can review and override. |
| **Study materials** | Assessors share files (PDF, Word, PowerPoint, images — private storage), links and notes by topic, with one class or all their students. Materials also appear on the matching lesson. |
| **Study timetable** | Generates a week-by-week plan from today to the first exam: a foundation phase covering every spec topic, consolidation, then an 8-week exam phase with past papers ramping up. Weak topics (from the syllabus tracker) come first and are revisited more often. Students tick sessions off; parents and assessors can view it. |
| **Syllabus tracker** | The full specification (Themes 1–4, every subtopic with key content) and exam structure. Students rate confidence 0–5 per topic. |
| **Practice bank** | Original exam-style questions (MCQ, short answer, data response, 25-mark essays) mapped to spec codes, with answers, explanations and levels-based mark schemes. |
| **Exams & marking** | Assessors build quizzes, homework or timed mocks from the bank, set them for a class or everyone, with open/close windows. MCQs are auto-marked on submit; written answers go to a marking queue (marks + comments per question, overall feedback). Indicative grades are calculated automatically. |
| **Past papers** | Catalogue of every series 2016–2026 for AS (Papers 1–2) and A level (Papers 1–3), including the 2020/2021 COVID gaps and autumn series. Links to Pearson's official materials; assessors can attach PDFs their centre is licensed to use (private storage). Students or assessors log marks → percentage and indicative grade. |
| **Reports** | Per-student report: data-driven predicted grade, assessor predictions, score trend vs target, topic confidence by theme, attendance, past paper and exam history. Assessors publish termly written reports. Print/PDF export. Parents see linked children's reports. |

> **Copyright:** Pearson question papers, mark schemes and examiner reports are © Pearson Education Ltd. The app links to Pearson's website instead of copying them. Practice questions in `seed/questions.json` are original. Grade boundaries in the app are **indicative**. Course lessons (`seed/lessons/`) and mock papers (`seed/mocks/`) are original too; see `seed/AUTHORING.md` — check [Pearson's published boundaries](https://qualifications.pearson.com/en/support/support-topics/results-certification/grade-boundaries.html) for each series.

## Architecture

- **Frontend:** React 19 + TypeScript + Vite, React Router (hash routing for GitHub Pages). No UI framework; styles in `src/index.css` with light/dark themes.
- **Backend:** Supabase — Postgres with row-level security on every table, Auth, Storage (`papers` and `materials` buckets), and an Edge Function (`mobile-login`) that resolves a mobile number to its account server-side.
- **Hosting:** GitHub Pages, deployed by `.github/workflows/deploy.yml` on every push to `main`.

### Data model (`supabase/migrations`)

`profiles` (role, email, mobile, year group, link code) · `parent_links` · `classes` · `class_members` · `class_sessions` · `attendance` · `questions` + `question_keys` (answers hidden from students until they submit) · `exams` · `exam_questions` · `attempts` · `attempt_answers` · `past_papers` · `past_paper_results` · `topic_progress` (confidence + lesson completion) · `study_plans` · `reports` · `lessons` · `study_materials`. Library mock papers are `exams` rows with `library = true` and no owner.

Writes that need integrity checks go through security-definer functions: `start_attempt`, `save_answer` (enforces time limit), `submit_attempt` (auto-marks MCQs), `mark_attempt`, `add_student_to_class`, `link_child`, `reveal_key`.

### Who can see what

- **Students:** their own data; published exams for their classes or everyone.
- **Parents:** data for students who gave them their link code.
- **Assessors:** students in classes they run; exams they created; the marking queue.
- **Admin:** everything (set `role = 'admin'` in `profiles` via SQL).

## Getting started

```bash
npm install
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

### Set up your own Supabase project

```bash
supabase link --project-ref <ref>
supabase db push                                  # schema, catalogue, question bank
supabase functions deploy mobile-login --use-api
supabase config push                              # auth redirect URLs etc.
```

The first assessor needs the invite code:

```sql
select value from app_settings where key = 'assessor_invite_code';
```

After that any assessor can see it on their Profile page.

### Deploying to GitHub Pages

1. Repository **Settings → Pages → Source: GitHub Actions**.
2. Repository **variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the anon key is public by design; RLS protects the data).
3. Push to `main`.

## Notes and next steps

- Email confirmation is **off** because Supabase's built-in email sender is heavily rate-limited. Add a custom SMTP provider in Supabase, then turn confirmations back on.
- Mobile sign-in uses mobile + password. For SMS one-time codes, configure an SMS provider (e.g. Twilio) in Supabase Auth.
- Course content: edit `seed/lessons/*.json` or `seed/mocks/*.json`, run `node scripts/validate-content.mjs`, then `node scripts/seed-content.mjs` to regenerate the content migration (or add a new migration for changes after it has been applied).
- `seed/questions.json` is the source for the question bank; `scripts/seed-questions.mjs` regenerates the SQL migration from it.
