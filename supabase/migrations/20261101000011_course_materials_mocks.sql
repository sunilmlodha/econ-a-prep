-- Full course (one lesson per specification topic), assessor study materials,
-- and a library of full-length mock papers any student can sit.

-- ---------------------------------------------------------------------------
-- Lessons: seeded from seed/lessons/*.json by scripts/seed-content.mjs
-- ---------------------------------------------------------------------------
create table public.lessons (
  topic_code text primary key,
  theme int not null check (theme between 1 and 4),
  level text not null check (level in ('AS', 'A')),
  position int not null,
  title text not null,
  minutes int not null check (minutes > 0),
  content jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.lessons enable row level security;
create policy lessons_select on public.lessons for select to authenticated using (true);
-- no write policies: lessons change only through migrations

alter table public.topic_progress add column lesson_completed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Study materials: files, links and notes an assessor shares with students
-- ---------------------------------------------------------------------------
create table public.study_materials (
  id uuid primary key default gen_random_uuid(),
  topic_code text,
  theme int check (theme between 1 and 4),
  title text not null check (length(trim(title)) between 1 and 200),
  kind text not null check (kind in ('file', 'link', 'note')),
  url text check (url is null or url ~* '^https?://'),
  storage_path text,
  body text check (body is null or length(body) <= 20000),
  class_id uuid references public.classes (id) on delete cascade,
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'file' and storage_path is not null) or (kind = 'note' and body is not null))
);
create index study_materials_topic_idx on public.study_materials (topic_code);
alter table public.study_materials enable row level security;

-- A class's material is for that class; material with no class is for every
-- student the author teaches (and their parents).
create or replace function public.material_visible(cid uuid, author uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select author = auth.uid()
    or public.is_staff()
    or (cid is not null and public.in_class(cid))
    or (cid is null and exists (
      select 1 from public.classes c where c.assessor_id = author and public.in_class(c.id)))
$$;

create policy study_materials_select on public.study_materials for select to authenticated
  using (public.material_visible(class_id, created_by));
create policy study_materials_insert on public.study_materials for insert to authenticated with check (
  public.is_staff() and created_by = auth.uid()
  and (class_id is null or public.owns_class(class_id))
  and (storage_path is null or storage_path like auth.uid()::text || '/%')
);
create policy study_materials_update on public.study_materials for update to authenticated
  using (created_by = auth.uid() or public.is_admin())
  with check ((created_by = auth.uid() or public.is_admin()) and (class_id is null or public.owns_class(class_id)));
create policy study_materials_delete on public.study_materials for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('materials', 'materials', false, 26214400, array[
  'application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

-- files live under <uploader id>/...; readers must be able to see a material row that points at the file
create policy materials_read on storage.objects for select to authenticated using (
  bucket_id = 'materials' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (select 1 from public.study_materials m where m.storage_path = storage.objects.name)));
create policy materials_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'materials' and public.is_staff() and (storage.foldername(name))[1] = auth.uid()::text);
create policy materials_update on storage.objects for update to authenticated using (
  bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text);
create policy materials_delete on storage.objects for delete to authenticated using (
  bucket_id = 'materials' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

-- ---------------------------------------------------------------------------
-- Library mock papers: published to everyone, owned by no assessor
-- ---------------------------------------------------------------------------
alter table public.exams alter column created_by drop not null;
alter table public.exams add column library boolean not null default false;
alter table public.exams add column slug text unique;
alter table public.exams add column paper text check (paper is null or paper in ('AS1', 'AS2', 'A1', 'A2', 'A3'));
alter table public.exam_questions add column section text;

-- Marking: exam owner, class owner or admin as before. Library mocks can also be
-- marked by the student's own assessor, or self-marked by the student until an
-- assessor has marked them. Students never change auto-marked MCQs.
create or replace function public.mark_attempt(aid uuid, marks jsonb, overall_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts;
  e public.exams;
  m jsonb;
  qmax int;
  qtype text;
  self_mark boolean;
begin
  select * into a from public.attempts where id = aid;
  if a.id is null then raise exception 'Attempt not found'; end if;
  select * into e from public.exams where id = a.exam_id;
  self_mark := e.library and a.student_id = auth.uid();
  if not (public.is_admin()
    or e.created_by = auth.uid()
    or (e.class_id is not null and public.owns_class(e.class_id))
    or (e.library and public.is_staff() and public.teaches(a.student_id))
    or self_mark) then
    raise exception 'Not allowed to mark this attempt';
  end if;
  if self_mark and a.marked_by is not null and a.marked_by <> a.student_id then
    raise exception 'Your assessor has already marked this paper';
  end if;
  if a.status = 'in_progress' then raise exception 'Attempt has not been submitted'; end if;

  for m in select * from jsonb_array_elements(coalesce(marks, '[]'::jsonb)) loop
    select q.marks, q.type into qmax, qtype from public.questions q
      join public.exam_questions eq on eq.question_id = q.id and eq.exam_id = a.exam_id
      where q.id = m ->> 'question_id';
    if qmax is null then raise exception 'Question % is not part of this exam', m ->> 'question_id'; end if;
    if self_mark and qtype = 'mcq' then raise exception 'Multiple-choice answers are marked automatically'; end if;
    if (m ->> 'awarded_marks') is null or (m ->> 'awarded_marks')::numeric < 0 or (m ->> 'awarded_marks')::numeric > qmax then
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
