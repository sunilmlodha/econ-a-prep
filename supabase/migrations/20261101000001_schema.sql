-- EconPrep: Edexcel A Level Economics A preparation app
-- Roles: student, parent, assessor (teacher/tutor), admin

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Settings (not readable by clients; used by security-definer functions)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value text not null
);
alter table public.app_settings enable row level security;
insert into public.app_settings (key, value)
values ('assessor_invite_code', upper(encode(gen_random_bytes(5), 'hex')));

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  mobile text,
  role text not null default 'student' check (role in ('student', 'parent', 'assessor', 'admin')),
  year_group text check (year_group in ('AS', 'A')),
  exam_year int,
  target_grade text,
  school text,
  link_code text unique,
  created_at timestamptz not null default now()
);
create unique index profiles_mobile_key on public.profiles (mobile) where mobile is not null and mobile <> '';
create index profiles_email_idx on public.profiles (lower(email));

create table public.parent_links (
  parent_id uuid not null references public.profiles (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (parent_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Classes, tuition groups, sessions, attendance
-- ---------------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'classroom' check (kind in ('classroom', 'tuition')),
  level text not null default 'A' check (level in ('AS', 'A', 'both')),
  description text,
  weekly_schedule text,
  meeting_url text,
  assessor_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.class_members (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index class_members_student_idx on public.class_members (student_id);

create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null,
  topic_code text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  location text,
  notes text,
  homework text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index class_sessions_class_idx on public.class_sessions (class_id, starts_at);

create table public.attendance (
  session_id uuid not null references public.class_sessions (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('present', 'late', 'absent', 'excused')),
  note text,
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);

-- ---------------------------------------------------------------------------
-- Question bank (answers/mark schemes kept in a separate, protected table)
-- ---------------------------------------------------------------------------
create table public.questions (
  id text primary key default ('q-' || encode(gen_random_bytes(6), 'hex')),
  theme int not null check (theme between 1 and 4),
  topic_code text not null,
  level text not null check (level in ('AS', 'A')),
  type text not null check (type in ('mcq', 'short', 'data', 'essay')),
  marks int not null check (marks > 0),
  prompt text not null,
  context text,
  options jsonb,
  source text not null default 'original',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index questions_theme_idx on public.questions (theme, type);

create table public.question_keys (
  question_id text primary key references public.questions (id) on delete cascade,
  answer text,
  explanation text,
  mark_scheme text
);

-- ---------------------------------------------------------------------------
-- Exams, attempts, answers
-- ---------------------------------------------------------------------------
create table public.exams (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  level text not null default 'A' check (level in ('AS', 'A')),
  kind text not null default 'quiz' check (kind in ('quiz', 'homework', 'mock', 'past_paper')),
  class_id uuid references public.classes (id) on delete cascade,
  duration_minutes int,
  opens_at timestamptz,
  closes_at timestamptz,
  published boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.exam_questions (
  exam_id uuid not null references public.exams (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  position int not null default 0,
  primary key (exam_id, question_id)
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'marked')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  score numeric,
  max_score numeric,
  percent numeric,
  grade text,
  feedback text,
  marked_by uuid references public.profiles (id) on delete set null,
  marked_at timestamptz
);
create index attempts_student_idx on public.attempts (student_id, started_at desc);
create index attempts_exam_idx on public.attempts (exam_id);

create table public.attempt_answers (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  question_id text not null references public.questions (id) on delete cascade,
  response text,
  awarded_marks numeric,
  comment text,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);

-- ---------------------------------------------------------------------------
-- Past papers catalogue and results
-- ---------------------------------------------------------------------------
create table public.past_papers (
  id text primary key,
  qualification text not null check (qualification in ('AS', 'A')),
  spec_code text not null,
  paper_no int not null,
  title text not null,
  themes text not null,
  series text not null,
  year int not null,
  month int not null,
  duration_minutes int not null,
  total_marks int not null,
  availability text not null default 'public' check (availability in ('public', 'secure', 'no_exam')),
  qp_url text,
  ms_url text,
  er_url text,
  qp_path text,
  ms_path text,
  er_path text,
  notes text
);

create table public.past_paper_results (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  past_paper_id text not null references public.past_papers (id) on delete cascade,
  marks numeric not null check (marks >= 0),
  max_marks numeric not null check (max_marks > 0),
  percent numeric generated always as (round(marks * 100.0 / max_marks, 1)) stored,
  grade text,
  source text not null default 'self' check (source in ('self', 'assessor')),
  recorded_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  sat_on date not null default current_date,
  notes text,
  created_at timestamptz not null default now(),
  check (marks <= max_marks)
);
create index past_paper_results_student_idx on public.past_paper_results (student_id, sat_on desc);

-- ---------------------------------------------------------------------------
-- Study progress, plans, reports
-- ---------------------------------------------------------------------------
create table public.topic_progress (
  student_id uuid not null references public.profiles (id) on delete cascade,
  topic_code text not null,
  confidence int not null default 0 check (confidence between 0 and 5),
  status text not null default 'not_started' check (status in ('not_started', 'learning', 'revised', 'mastered')),
  updated_at timestamptz not null default now(),
  primary key (student_id, topic_code)
);

create table public.study_plans (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  settings jsonb not null,
  plan jsonb not null,
  done text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index study_plans_student_idx on public.study_plans (student_id, created_at desc);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,
  author_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  period text not null,
  working_grade text,
  predicted_grade text,
  target_grade text,
  effort int check (effort between 1 and 5),
  attendance_pct numeric,
  strengths text,
  next_steps text,
  comments text,
  created_at timestamptz not null default now()
);
create index reports_student_idx on public.reports (student_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer to avoid RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('assessor', 'admin'), false)
$$;

create or replace function public.owns_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from public.classes where id = cid and assessor_id = auth.uid())
$$;

create or replace function public.is_parent_of(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.parent_links where parent_id = auth.uid() and student_id = sid)
$$;

create or replace function public.teaches(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from public.class_members cm
    join public.classes c on c.id = cm.class_id
    where cm.student_id = sid and c.assessor_id = auth.uid()
  )
$$;

create or replace function public.can_view_student(sid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select sid = auth.uid() or public.is_parent_of(sid) or public.teaches(sid)
$$;

create or replace function public.in_class(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.class_members cm
    where cm.class_id = cid
      and (cm.student_id = auth.uid() or public.is_parent_of(cm.student_id))
  )
$$;

create or replace function public.can_view_exam(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exams e
    where e.id = eid
      and (
        e.created_by = auth.uid()
        or public.is_admin()
        or (e.class_id is not null and public.owns_class(e.class_id))
        or (e.published and (e.class_id is null or public.in_class(e.class_id)))
      )
  )
$$;

create or replace function public.grade_for(lvl text, pct numeric) returns text
language sql immutable as $$
  -- Indicative boundaries only; real Pearson boundaries change every series.
  select case
    when pct is null then null
    when lvl = 'AS' then case
      when pct >= 65 then 'A' when pct >= 56 then 'B' when pct >= 47 then 'C'
      when pct >= 38 then 'D' when pct >= 30 then 'E' else 'U' end
    else case
      when pct >= 74 then 'A*' when pct >= 63 then 'A' when pct >= 53 then 'B'
      when pct >= 43 then 'C' when pct >= 34 then 'D' when pct >= 25 then 'E' else 'U' end
  end
$$;

-- ---------------------------------------------------------------------------
-- New user -> profile
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  wanted text := coalesce(meta ->> 'role', 'student');
  final_role text := 'student';
begin
  if wanted = 'parent' then
    final_role := 'parent';
  elsif wanted = 'assessor' and (meta ->> 'invite_code') is not null
    and upper(meta ->> 'invite_code') = (select value from public.app_settings where key = 'assessor_invite_code') then
    final_role := 'assessor';
  end if;

  insert into public.profiles (id, full_name, email, mobile, role, year_group, exam_year, link_code)
  values (
    new.id,
    coalesce(meta ->> 'full_name', ''),
    new.email,
    nullif(regexp_replace(coalesce(meta ->> 'mobile', new.phone, ''), '[^0-9+]', '', 'g'), ''),
    final_role,
    case when final_role = 'student' and meta ->> 'year_group' in ('AS', 'A') then meta ->> 'year_group' end,
    case when final_role = 'student' then nullif(meta ->> 'exam_year', '')::int end,
    case when final_role = 'student' then upper(encode(gen_random_bytes(4), 'hex')) end
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
create or replace function public.link_child(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if public.my_role() <> 'parent' then raise exception 'Only parent accounts can link a student'; end if;
  select id into sid from public.profiles where link_code = upper(trim(code)) and role = 'student';
  if sid is null then raise exception 'No student found with that link code'; end if;
  insert into public.parent_links (parent_id, student_id) values (auth.uid(), sid) on conflict do nothing;
  return sid;
end;
$$;

create or replace function public.add_student_to_class(cid uuid, identifier text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  sid uuid;
  ident text := trim(identifier);
begin
  if not public.owns_class(cid) then raise exception 'You do not own this class'; end if;
  select id into sid from public.profiles
  where role = 'student'
    and (lower(email) = lower(ident)
      or link_code = upper(ident)
      or (mobile is not null and mobile = regexp_replace(ident, '[^0-9+]', '', 'g')))
  limit 1;
  if sid is null then raise exception 'No student account matches %', ident; end if;
  insert into public.class_members (class_id, student_id) values (cid, sid) on conflict do nothing;
  return sid;
end;
$$;

-- Practice mode: reveal the key for a question unless it is part of an exam the
-- student currently has open.
create or replace function public.reveal_key(qid text)
returns table (answer text, explanation text, mark_scheme text)
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.attempts a
    join public.exam_questions eq on eq.exam_id = a.exam_id
    where a.student_id = auth.uid() and a.status = 'in_progress' and eq.question_id = qid
  ) then
    raise exception 'This question is part of an exam you have in progress';
  end if;
  return query select k.answer, k.explanation, k.mark_scheme from public.question_keys k where k.question_id = qid;
end;
$$;

create or replace function public.start_attempt(eid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  aid uuid;
  e public.exams;
begin
  if public.my_role() <> 'student' then raise exception 'Only students can sit exams'; end if;
  if not public.can_view_exam(eid) then raise exception 'Exam not available'; end if;
  select * into e from public.exams where id = eid;
  if not e.published then raise exception 'Exam is not published'; end if;
  if e.opens_at is not null and now() < e.opens_at then raise exception 'Exam has not opened yet'; end if;
  if e.closes_at is not null and now() > e.closes_at then raise exception 'Exam has closed'; end if;
  select id into aid from public.attempts where exam_id = eid and student_id = auth.uid() and status = 'in_progress';
  if aid is null then
    insert into public.attempts (exam_id, student_id, max_score)
    select eid, auth.uid(), coalesce(sum(q.marks), 0)
    from public.exam_questions eq join public.questions q on q.id = eq.question_id
    where eq.exam_id = eid
    returning id into aid;
  end if;
  return aid;
end;
$$;

create or replace function public.save_answer(aid uuid, qid text, resp text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts;
  dur int;
begin
  select * into a from public.attempts where id = aid;
  if a.id is null or a.student_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  if a.status <> 'in_progress' then raise exception 'Attempt already submitted'; end if;
  select duration_minutes into dur from public.exams where id = a.exam_id;
  if dur is not null and now() > a.started_at + make_interval(mins => dur + 2) then
    raise exception 'Time is up for this exam';
  end if;
  if not exists (select 1 from public.exam_questions where exam_id = a.exam_id and question_id = qid) then
    raise exception 'Question is not part of this exam';
  end if;
  insert into public.attempt_answers (attempt_id, question_id, response, updated_at)
  values (aid, qid, resp, now())
  on conflict (attempt_id, question_id) do update set response = excluded.response, updated_at = now();
end;
$$;

create or replace function public.finalise_attempt(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  lvl text;
  pending int;
  total numeric;
  maxs numeric;
begin
  select e.level into lvl from public.attempts a join public.exams e on e.id = a.exam_id where a.id = aid;
  select count(*) into pending
  from public.exam_questions eq
  join public.attempts a on a.exam_id = eq.exam_id and a.id = aid
  left join public.attempt_answers ans on ans.attempt_id = aid and ans.question_id = eq.question_id
  where ans.awarded_marks is null;
  select coalesce(sum(awarded_marks), 0) into total from public.attempt_answers where attempt_id = aid;
  select max_score into maxs from public.attempts where id = aid;
  update public.attempts set
    score = total,
    percent = case when maxs > 0 then round(total * 100.0 / maxs, 1) end,
    grade = case when pending = 0 and maxs > 0 then public.grade_for(lvl, round(total * 100.0 / maxs, 1)) end,
    status = case when pending = 0 then 'marked' else 'submitted' end
  where id = aid;
end;
$$;
revoke execute on function public.finalise_attempt(uuid) from public, anon, authenticated;

create or replace function public.submit_attempt(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts;
begin
  select * into a from public.attempts where id = aid;
  if a.id is null or a.student_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  if a.status <> 'in_progress' then raise exception 'Attempt already submitted'; end if;

  -- make sure every exam question has an answer row
  insert into public.attempt_answers (attempt_id, question_id, response)
  select aid, eq.question_id, null from public.exam_questions eq where eq.exam_id = a.exam_id
  on conflict do nothing;

  -- auto-mark multiple choice
  update public.attempt_answers ans set awarded_marks = case
      when upper(trim(coalesce(ans.response, ''))) = upper(k.answer) then q.marks else 0 end
  from public.questions q join public.question_keys k on k.question_id = q.id
  where ans.attempt_id = aid and ans.question_id = q.id and q.type = 'mcq';

  -- unanswered written questions score zero automatically
  update public.attempt_answers ans set awarded_marks = 0
  where ans.attempt_id = aid and coalesce(trim(ans.response), '') = '' and ans.awarded_marks is null;

  update public.attempts set submitted_at = now(), status = 'submitted' where id = aid;
  perform public.finalise_attempt(aid);
end;
$$;

-- marks: [{"question_id": "...", "awarded_marks": 4, "comment": "..."}]
create or replace function public.mark_attempt(aid uuid, marks jsonb, overall_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts;
  m jsonb;
  qmax int;
begin
  select * into a from public.attempts where id = aid;
  if a.id is null then raise exception 'Attempt not found'; end if;
  if not (public.is_admin()
    or exists (select 1 from public.exams e where e.id = a.exam_id and (e.created_by = auth.uid() or (e.class_id is not null and public.owns_class(e.class_id))))
    or (public.is_staff() and public.teaches(a.student_id))) then
    raise exception 'Not allowed to mark this attempt';
  end if;
  if a.status = 'in_progress' then raise exception 'Attempt has not been submitted'; end if;

  for m in select * from jsonb_array_elements(coalesce(marks, '[]'::jsonb)) loop
    select q.marks into qmax from public.questions q where q.id = m ->> 'question_id';
    if (m ->> 'awarded_marks')::numeric < 0 or (m ->> 'awarded_marks')::numeric > qmax then
      raise exception 'Marks for % must be between 0 and %', m ->> 'question_id', qmax;
    end if;
    update public.attempt_answers
      set awarded_marks = (m ->> 'awarded_marks')::numeric, comment = m ->> 'comment', updated_at = now()
      where attempt_id = aid and question_id = m ->> 'question_id';
  end loop;

  update public.attempts set feedback = overall_feedback, marked_by = auth.uid(), marked_at = now() where id = aid;
  perform public.finalise_attempt(aid);
end;
$$;

-- Mobile login support: an edge function (service role) resolves mobile -> email.
create or replace function public.email_for_mobile(m text) returns text
language sql stable security definer set search_path = public as $$
  select email from public.profiles where mobile = regexp_replace(m, '[^0-9+]', '', 'g') limit 1
$$;
revoke execute on function public.email_for_mobile(text) from public, anon, authenticated;

-- Assessors can read the invite code to share with colleagues.
create or replace function public.assessor_invite_code() returns text
language sql stable security definer set search_path = public as $$
  select case when public.is_staff() then (select value from public.app_settings where key = 'assessor_invite_code') end
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.parent_links enable row level security;
alter table public.classes enable row level security;
alter table public.class_members enable row level security;
alter table public.class_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.questions enable row level security;
alter table public.question_keys enable row level security;
alter table public.exams enable row level security;
alter table public.exam_questions enable row level security;
alter table public.attempts enable row level security;
alter table public.attempt_answers enable row level security;
alter table public.past_papers enable row level security;
alter table public.past_paper_results enable row level security;
alter table public.topic_progress enable row level security;
alter table public.study_plans enable row level security;
alter table public.reports enable row level security;

-- profiles: see yourself, students you may view, staff directory, parents of your students
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.can_view_student(id)
  or role in ('assessor', 'admin')
  or (public.is_staff() and exists (
    select 1 from public.parent_links pl where pl.parent_id = profiles.id and public.teaches(pl.student_id)))
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, mobile, year_group, exam_year, target_grade, school) on public.profiles to authenticated;

create policy parent_links_select on public.parent_links for select to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid() or public.teaches(student_id));
create policy parent_links_delete on public.parent_links for delete to authenticated
  using (parent_id = auth.uid() or student_id = auth.uid());

create policy classes_select on public.classes for select to authenticated
  using (assessor_id = auth.uid() or public.is_admin() or public.in_class(id));
create policy classes_insert on public.classes for insert to authenticated
  with check (public.is_staff() and assessor_id = auth.uid());
create policy classes_update on public.classes for update to authenticated
  using (public.owns_class(id)) with check (public.owns_class(id));
create policy classes_delete on public.classes for delete to authenticated
  using (public.owns_class(id));

create policy class_members_select on public.class_members for select to authenticated
  using (public.owns_class(class_id) or student_id = auth.uid() or public.is_parent_of(student_id));
create policy class_members_delete on public.class_members for delete to authenticated
  using (public.owns_class(class_id));

create policy class_sessions_select on public.class_sessions for select to authenticated
  using (public.owns_class(class_id) or public.in_class(class_id));
create policy class_sessions_write on public.class_sessions for all to authenticated
  using (public.owns_class(class_id)) with check (public.owns_class(class_id));

create policy attendance_select on public.attendance for select to authenticated
  using (public.can_view_student(student_id)
    or exists (select 1 from public.class_sessions s where s.id = session_id and public.owns_class(s.class_id)));
create policy attendance_write on public.attendance for all to authenticated
  using (exists (select 1 from public.class_sessions s where s.id = session_id and public.owns_class(s.class_id)))
  with check (exists (select 1 from public.class_sessions s where s.id = session_id and public.owns_class(s.class_id)));

create policy questions_select on public.questions for select to authenticated using (true);
create policy questions_insert on public.questions for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid() and source = 'assessor');
create policy questions_update on public.questions for update to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.is_staff()));
create policy questions_delete on public.questions for delete to authenticated
  using (public.is_admin() or (created_by = auth.uid() and public.is_staff()));

-- keys: staff, or a student who has submitted an attempt containing the question
create policy question_keys_select on public.question_keys for select to authenticated using (
  public.is_staff()
  or exists (
    select 1 from public.attempt_answers ans
    join public.attempts a on a.id = ans.attempt_id
    where ans.question_id = question_keys.question_id
      and a.status <> 'in_progress'
      and public.can_view_student(a.student_id))
);
create policy question_keys_write on public.question_keys for all to authenticated
  using (public.is_admin() or exists (select 1 from public.questions q where q.id = question_id and q.created_by = auth.uid()))
  with check (public.is_admin() or exists (select 1 from public.questions q where q.id = question_id and q.created_by = auth.uid()));

create policy exams_select on public.exams for select to authenticated using (public.can_view_exam(id));
create policy exams_insert on public.exams for insert to authenticated
  with check (public.is_staff() and created_by = auth.uid() and (class_id is null or public.owns_class(class_id)));
create policy exams_update on public.exams for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check ((created_by = auth.uid() or public.is_admin()) and (class_id is null or public.owns_class(class_id)));
create policy exams_delete on public.exams for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

create policy exam_questions_select on public.exam_questions for select to authenticated using (public.can_view_exam(exam_id));
create policy exam_questions_write on public.exam_questions for all to authenticated
  using (exists (select 1 from public.exams e where e.id = exam_id and (e.created_by = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.exams e where e.id = exam_id and (e.created_by = auth.uid() or public.is_admin())));

create policy attempts_select on public.attempts for select to authenticated using (
  public.can_view_student(student_id)
  or exists (select 1 from public.exams e where e.id = exam_id and e.created_by = auth.uid())
);

create policy attempt_answers_select on public.attempt_answers for select to authenticated using (
  exists (select 1 from public.attempts a where a.id = attempt_id and (
    public.can_view_student(a.student_id)
    or exists (select 1 from public.exams e where e.id = a.exam_id and e.created_by = auth.uid())))
);
-- answers are written only through save_answer() below

create policy past_papers_select on public.past_papers for select to authenticated using (true);
create policy past_papers_write on public.past_papers for update to authenticated
  using (public.is_staff()) with check (public.is_staff());

create policy ppr_select on public.past_paper_results for select to authenticated using (public.can_view_student(student_id));
create policy ppr_insert on public.past_paper_results for insert to authenticated with check (
  recorded_by = auth.uid() and (
    (student_id = auth.uid() and source = 'self')
    or (public.is_staff() and public.teaches(student_id) and source = 'assessor'))
);
create policy ppr_delete on public.past_paper_results for delete to authenticated using (recorded_by = auth.uid());

create policy topic_progress_select on public.topic_progress for select to authenticated using (public.can_view_student(student_id));
create policy topic_progress_write on public.topic_progress for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy study_plans_select on public.study_plans for select to authenticated using (public.can_view_student(student_id));
create policy study_plans_write on public.study_plans for all to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());

create policy reports_select on public.reports for select to authenticated using (public.can_view_student(student_id));
create policy reports_insert on public.reports for insert to authenticated
  with check (author_id = auth.uid() and public.is_staff() and public.teaches(student_id));
create policy reports_update on public.reports for update to authenticated
  using (author_id = auth.uid()) with check (author_id = auth.uid() and public.teaches(student_id));
create policy reports_delete on public.reports for delete to authenticated using (author_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage: licensed past paper PDFs uploaded by assessors
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('papers', 'papers', false) on conflict do nothing;

create policy papers_read on storage.objects for select to authenticated using (bucket_id = 'papers');
create policy papers_insert on storage.objects for insert to authenticated with check (bucket_id = 'papers' and public.is_staff());
create policy papers_update on storage.objects for update to authenticated using (bucket_id = 'papers' and public.is_staff());
create policy papers_delete on storage.objects for delete to authenticated using (bucket_id = 'papers' and public.is_staff());
