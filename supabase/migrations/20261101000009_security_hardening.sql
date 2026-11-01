-- Security hardening from the /review pass.

-- ---------------------------------------------------------------------------
-- Exam content is hidden until the exam opens (or you own/sat it)
-- ---------------------------------------------------------------------------
create or replace function public.exam_content_visible(eid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.exams e
    where e.id = eid
      and (
        e.created_by = auth.uid()
        or public.is_admin()
        or (e.class_id is not null and public.owns_class(e.class_id))
        or exists (select 1 from public.attempts a where a.exam_id = e.id and public.can_view_student(a.student_id))
        or (e.published
          and (e.class_id is null or public.in_class(e.class_id))
          and (e.opens_at is null or e.opens_at <= now()))
      )
  )
$$;

drop policy exam_questions_select on public.exam_questions;
create policy exam_questions_select on public.exam_questions for select to authenticated
  using (public.exam_content_visible(exam_id));

-- Only the shared bank is public; assessor-written questions appear once their exam opens.
drop policy questions_select on public.questions;
create policy questions_select on public.questions for select to authenticated using (
  source = 'original'
  or public.is_staff()
  or exists (select 1 from public.exam_questions eq where eq.question_id = questions.id and public.exam_content_visible(eq.exam_id))
);

-- ---------------------------------------------------------------------------
-- Practice answer keys: students only, bank questions only, never for an exam
-- they have been set and not yet submitted
-- ---------------------------------------------------------------------------
create or replace function public.reveal_key(qid text)
returns table (answer text, explanation text, mark_scheme text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;
  if not public.is_staff() then
    if public.my_role() <> 'student' then raise exception 'The practice bank is for students'; end if;
    if not exists (select 1 from public.questions where id = qid and source = 'original') then
      raise exception 'Not a practice question';
    end if;
    if exists (
      select 1 from public.exam_questions eq
      join public.exams e on e.id = eq.exam_id
      where eq.question_id = qid
        and e.published
        and (e.class_id is null or public.in_class(e.class_id))
        and (e.closes_at is null or e.closes_at > now())
        and not exists (select 1 from public.attempts a
          where a.exam_id = e.id and a.student_id = auth.uid() and a.status <> 'in_progress')
    ) then
      raise exception 'This question is in an exam you have been set. Sit the exam first.';
    end if;
  end if;
  return query select k.answer, k.explanation, k.mark_scheme from public.question_keys k where k.question_id = qid;
end;
$$;
revoke execute on function public.reveal_key(text) from public, anon;
grant execute on function public.reveal_key(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Marking: only the exam owner, the class owner or an admin
-- ---------------------------------------------------------------------------
create or replace function public.mark_attempt(aid uuid, marks jsonb, overall_feedback text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts;
  m jsonb;
  qmax int;
begin
  select * into a from public.attempts where id = aid;
  if a.id is null then raise exception 'Attempt not found'; end if;
  if not (public.is_admin() or exists (
    select 1 from public.exams e
    where e.id = a.exam_id and (e.created_by = auth.uid() or (e.class_id is not null and public.owns_class(e.class_id))))) then
    raise exception 'Not allowed to mark this attempt';
  end if;
  if a.status = 'in_progress' then raise exception 'Attempt has not been submitted'; end if;

  for m in select * from jsonb_array_elements(coalesce(marks, '[]'::jsonb)) loop
    select q.marks into qmax from public.questions q
      join public.exam_questions eq on eq.question_id = q.id and eq.exam_id = a.exam_id
      where q.id = m ->> 'question_id';
    if qmax is null then raise exception 'Question % is not part of this exam', m ->> 'question_id'; end if;
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

-- ---------------------------------------------------------------------------
-- Link codes: 48 bits instead of 32, and failed guesses are rate limited
-- ---------------------------------------------------------------------------
create table public.rpc_failures (
  user_id uuid not null,
  action text not null,
  created_at timestamptz not null default now()
);
create index rpc_failures_idx on public.rpc_failures (user_id, action, created_at desc);
alter table public.rpc_failures enable row level security;

create or replace function public.new_link_code() returns text
language sql volatile set search_path = public as $$
  select upper(encode(extensions.gen_random_bytes(6), 'hex'))
$$;

update public.profiles set link_code = public.new_link_code() where link_code is not null;

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
    case when final_role = 'student' and (meta ->> 'exam_year') ~ '^\d{4}$' then (meta ->> 'exam_year')::int end,
    case when final_role = 'student' then public.new_link_code() end
  );
  return new;
end;
$$;

-- returns null (and records the miss) instead of raising, so the failure row is kept
create or replace function public.link_child(code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare sid uuid;
begin
  if public.my_role() <> 'parent' then raise exception 'Only parent accounts can link a student'; end if;
  if (select count(*) from public.rpc_failures
      where user_id = auth.uid() and action = 'link' and created_at > now() - interval '1 hour') >= 10 then
    raise exception 'Too many attempts. Try again in an hour.';
  end if;
  select id into sid from public.profiles where link_code = upper(trim(code)) and role = 'student';
  if sid is null then
    insert into public.rpc_failures (user_id, action) values (auth.uid(), 'link');
    return null;
  end if;
  insert into public.parent_links (parent_id, student_id) values (auth.uid(), sid) on conflict do nothing;
  return sid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff contact details: visible to other staff, and to students/parents in
-- that assessor's classes — not to every signed-up account
-- ---------------------------------------------------------------------------
create or replace function public.is_my_teacher(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.classes c where c.assessor_id = pid and public.in_class(c.id))
$$;

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.can_view_student(id)
  or (public.is_staff() and role in ('assessor', 'admin'))
  or (role in ('assessor', 'admin') and public.is_my_teacher(id))
  or exists (select 1 from public.parent_links pl where pl.parent_id = profiles.id and pl.student_id = auth.uid())
  or (public.is_staff() and exists (
    select 1 from public.parent_links pl where pl.parent_id = profiles.id and public.teaches(pl.student_id)))
);

-- ---------------------------------------------------------------------------
-- Past paper PDFs: readable by staff and enrolled students/parents; only the
-- uploader (or an admin) can replace or delete a file; assessors may only set
-- the attachment paths on the catalogue
-- ---------------------------------------------------------------------------
create or replace function public.is_enrolled() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.class_members cm
    where cm.student_id = auth.uid() or public.is_parent_of(cm.student_id))
$$;

drop policy papers_read on storage.objects;
drop policy papers_update on storage.objects;
drop policy papers_delete on storage.objects;
create policy papers_read on storage.objects for select to authenticated
  using (bucket_id = 'papers' and (public.is_staff() or public.is_enrolled()));
create policy papers_update on storage.objects for update to authenticated
  using (bucket_id = 'papers' and public.is_staff() and (owner_id = auth.uid()::text or public.is_admin()));
create policy papers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'papers' and public.is_staff() and (owner_id = auth.uid()::text or public.is_admin()));

revoke update on public.past_papers from authenticated;
grant update (qp_path, ms_path, er_path) on public.past_papers to authenticated;

-- ---------------------------------------------------------------------------
-- Mobile sign-in throttling (written by the mobile-login edge function only)
-- ---------------------------------------------------------------------------
create table public.login_failures (
  mobile text not null,
  created_at timestamptz not null default now()
);
create index login_failures_idx on public.login_failures (mobile, created_at desc);
alter table public.login_failures enable row level security;
