-- INSERT ... RETURNING evaluates the select policy before can_view_exam() can see
-- the new row, so check ownership inline first.
drop policy exams_select on public.exams;
create policy exams_select on public.exams for select to authenticated
  using (created_by = auth.uid() or public.can_view_exam(id));
