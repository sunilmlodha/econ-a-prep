-- Exam timers sync to database time so a skewed device clock can't shorten or extend an exam.
create or replace function public.server_now() returns timestamptz
language sql stable as $$ select now() $$;
grant execute on function public.server_now() to authenticated;
