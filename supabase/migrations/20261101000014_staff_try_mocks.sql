-- Assessors and admins can sit library mocks themselves as a try-out, and sit them again.
-- Their attempts never reach a marking queue or report (those only cover student accounts).
create or replace function public.start_attempt(eid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  aid uuid;
  e public.exams;
  try_out boolean;
begin
  select * into e from public.exams where id = eid;
  try_out := coalesce(e.library and public.is_staff(), false);
  if public.my_role() <> 'student' and not try_out then raise exception 'Only students can sit exams'; end if;
  if not public.can_view_exam(eid) then raise exception 'Exam not available'; end if;
  if not e.published then raise exception 'Exam is not published'; end if;

  select id into aid from public.attempts where exam_id = eid and student_id = auth.uid() and status = 'in_progress';
  if aid is not null then return aid; end if;

  if try_out then
    delete from public.attempts where exam_id = eid and student_id = auth.uid();
  elsif exists (select 1 from public.attempts where exam_id = eid and student_id = auth.uid()) then
    raise exception 'You have already submitted this exam';
  end if;
  if e.opens_at is not null and now() < e.opens_at then raise exception 'Exam has not opened yet'; end if;
  if e.closes_at is not null and now() > e.closes_at then raise exception 'Exam has closed'; end if;

  insert into public.attempts (exam_id, student_id, max_score)
  select eid, auth.uid(), coalesce(sum(q.marks), 0)
  from public.exam_questions eq join public.questions q on q.id = eq.question_id
  where eq.exam_id = eid
  on conflict (exam_id, student_id) where status = 'in_progress' do nothing
  returning id into aid;

  if aid is null then
    select id into aid from public.attempts where exam_id = eid and student_id = auth.uid() and status = 'in_progress';
  end if;
  return aid;
end;
$$;
