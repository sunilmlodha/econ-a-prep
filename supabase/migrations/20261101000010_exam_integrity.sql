-- Exam integrity fixes from the /review red-team pass.

-- Sensible exam settings
update public.exams set duration_minutes = null where duration_minutes <= 0;
alter table public.exams add constraint exams_duration_positive check (duration_minutes is null or duration_minutes > 0);
alter table public.exams add constraint exams_window_order check (opens_at is null or closes_at is null or closes_at > opens_at);

-- Deleting a class keeps its exams and results: the exam is detached and unpublished.
alter table public.exams drop constraint exams_class_id_fkey;
alter table public.exams add constraint exams_class_id_fkey
  foreign key (class_id) references public.classes (id) on delete set null;

create or replace function public.unpublish_class_exams() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.exams set published = false where class_id = old.id;
  return old;
end;
$$;
create trigger before_class_delete before delete on public.classes
  for each row execute function public.unpublish_class_exams();

-- ---------------------------------------------------------------------------
-- An exam's question list is frozen once anyone has started it
-- ---------------------------------------------------------------------------
create or replace function public.lock_sat_exam_questions() returns trigger
language plpgsql security definer set search_path = public as $$
declare eid uuid := case when tg_op = 'DELETE' then old.exam_id else new.exam_id end;
begin
  -- the exam itself is being deleted (cascade): allow
  if tg_op = 'DELETE' and not exists (select 1 from public.exams where id = eid) then return old; end if;
  if exists (select 1 from public.attempts where exam_id = eid) then
    raise exception 'Questions cannot be changed after students have started this exam';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger exam_questions_locked before insert or update or delete on public.exam_questions
  for each row execute function public.lock_sat_exam_questions();

-- Replace an exam's question list in one transaction.
create or replace function public.set_exam_questions(eid uuid, qids text[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.exams where id = eid and (created_by = auth.uid() or public.is_admin())) then
    raise exception 'You do not own this exam';
  end if;
  if exists (select 1 from public.attempts where exam_id = eid) then
    if (select array_agg(question_id order by position) from public.exam_questions where exam_id = eid) is distinct from qids then
      raise exception 'Questions cannot be changed after students have started this exam';
    end if;
    return;
  end if;
  delete from public.exam_questions where exam_id = eid;
  insert into public.exam_questions (exam_id, question_id, position)
  select eid, q, i - 1 from unnest(qids) with ordinality as t(q, i);
end;
$$;

-- ---------------------------------------------------------------------------
-- Scoring uses the exam's question set only, and never exceeds 100%
-- ---------------------------------------------------------------------------
create or replace function public.finalise_attempt(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  lvl text;
  pending int;
  total numeric;
  maxs numeric;
  pct numeric;
begin
  select e.level into lvl from public.attempts a join public.exams e on e.id = a.exam_id where a.id = aid;
  select count(*) filter (where ans.awarded_marks is null),
         coalesce(sum(ans.awarded_marks), 0),
         coalesce(sum(q.marks), 0)
    into pending, total, maxs
  from public.attempts a
  join public.exam_questions eq on eq.exam_id = a.exam_id
  join public.questions q on q.id = eq.question_id
  left join public.attempt_answers ans on ans.attempt_id = a.id and ans.question_id = eq.question_id
  where a.id = aid;
  pct := case when maxs > 0 then least(100, round(total * 100.0 / maxs, 1)) end;
  update public.attempts set
    score = total,
    max_score = maxs,
    percent = pct,
    grade = case when pending = 0 then public.grade_for(lvl, pct) end,
    status = case when pending = 0 then 'marked' else 'submitted' end
  where id = aid;
end;
$$;
revoke execute on function public.finalise_attempt(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Submission: shared internal routine, row-locked so saves can't interleave
-- ---------------------------------------------------------------------------
create or replace function public.submit_attempt_internal(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = aid for update;
  if a.status <> 'in_progress' then return; end if;

  insert into public.attempt_answers (attempt_id, question_id, response)
  select aid, eq.question_id, null from public.exam_questions eq where eq.exam_id = a.exam_id
  on conflict do nothing;

  update public.attempt_answers ans set awarded_marks = case
      when upper(trim(coalesce(ans.response, ''))) = upper(k.answer) then q.marks else 0 end
  from public.questions q join public.question_keys k on k.question_id = q.id
  where ans.attempt_id = aid and ans.question_id = q.id and q.type = 'mcq';

  update public.attempt_answers ans set awarded_marks = 0
  where ans.attempt_id = aid and coalesce(trim(ans.response), '') = '' and ans.awarded_marks is null;

  update public.attempts set submitted_at = now(), status = 'submitted' where id = aid;
  perform public.finalise_attempt(aid);
end;
$$;
revoke execute on function public.submit_attempt_internal(uuid) from public, anon, authenticated;

create or replace function public.submit_attempt(aid uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a public.attempts;
begin
  select * into a from public.attempts where id = aid;
  if a.id is null or a.student_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  if a.status <> 'in_progress' then raise exception 'Attempt already submitted'; end if;
  perform public.submit_attempt_internal(aid);
end;
$$;

-- Saves stop at the time limit or the closing time (2 minutes' grace for network lag).
create or replace function public.save_answer(aid uuid, qid text, resp text) returns void
language plpgsql security definer set search_path = public as $$
declare
  a public.attempts;
  e public.exams;
begin
  select * into a from public.attempts where id = aid for update;
  if a.id is null or a.student_id <> auth.uid() then raise exception 'Attempt not found'; end if;
  if a.status <> 'in_progress' then raise exception 'Attempt already submitted'; end if;
  select * into e from public.exams where id = a.exam_id;
  if e.duration_minutes is not null and now() > a.started_at + make_interval(mins => e.duration_minutes + 2) then
    raise exception 'Time is up for this exam';
  end if;
  if e.closes_at is not null and now() > e.closes_at + interval '2 minutes' then
    raise exception 'This exam has closed';
  end if;
  if not exists (select 1 from public.exam_questions where exam_id = a.exam_id and question_id = qid) then
    raise exception 'Question is not part of this exam';
  end if;
  insert into public.attempt_answers (attempt_id, question_id, response, updated_at)
  values (aid, qid, resp, now())
  on conflict (attempt_id, question_id) do update set response = excluded.response, updated_at = now();
end;
$$;

-- Attempts left open past their time limit or closing time are submitted automatically.
create or replace function public.auto_submit_expired() returns int
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n int := 0;
begin
  for r in
    select a.id from public.attempts a join public.exams e on e.id = a.exam_id
    where a.status = 'in_progress'
      and ((e.duration_minutes is not null and now() > a.started_at + make_interval(mins => e.duration_minutes + 2))
        or (e.closes_at is not null and now() > e.closes_at + interval '2 minutes'))
  loop
    perform public.submit_attempt_internal(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke execute on function public.auto_submit_expired() from public, anon, authenticated;

create extension if not exists pg_cron;
select cron.schedule('auto-submit-expired-attempts', '*/5 * * * *', 'select public.auto_submit_expired()');

-- ---------------------------------------------------------------------------
-- Practice keys stay hidden while the student has any open attempt on the question
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
      select 1 from public.attempts a
      join public.exam_questions eq on eq.exam_id = a.exam_id
      where a.student_id = auth.uid() and a.status = 'in_progress' and eq.question_id = qid
    ) or exists (
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

-- ---------------------------------------------------------------------------
-- Study plan ticks: atomic toggle instead of overwriting the whole array
-- ---------------------------------------------------------------------------
create or replace function public.toggle_plan_item(pid uuid, item text, is_done boolean) returns text[]
language sql security definer set search_path = public as $$
  update public.study_plans
     set done = case when is_done then array(select distinct unnest(array_append(done, item)))
                     else array_remove(done, item) end
   where id = pid and student_id = auth.uid()
  returning done
$$;
