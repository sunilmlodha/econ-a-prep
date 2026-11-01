-- Library mocks have no owner (created_by is null). In mark_attempt the owner test
-- evaluated to NULL, and "if not (NULL or ...)" does not raise, so any student could
-- mark another student's library attempt. Treat NULL as "not allowed".
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
  self_mark := coalesce(e.library and a.student_id = auth.uid(), false);
  -- coalesce: library mocks have no owner, and a NULL here would skip the check entirely
  if not coalesce(public.is_admin()
    or e.created_by = auth.uid()
    or (e.class_id is not null and public.owns_class(e.class_id))
    or (e.library and public.is_staff() and public.teaches(a.student_id))
    or self_mark, false) then
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
