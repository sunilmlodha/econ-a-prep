-- Students can see the parents linked to them.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid()
  or public.can_view_student(id)
  or role in ('assessor', 'admin')
  or exists (select 1 from public.parent_links pl where pl.parent_id = profiles.id and pl.student_id = auth.uid())
  or (public.is_staff() and exists (
    select 1 from public.parent_links pl where pl.parent_id = profiles.id and public.teaches(pl.student_id)))
);

-- Lets the sign-up form tell an assessor their invite code is wrong before the
-- account is silently created as a student.
create or replace function public.check_invite_code(code text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_settings where key = 'assessor_invite_code' and value = upper(trim(code)))
$$;
grant execute on function public.check_invite_code(text) to anon, authenticated;
