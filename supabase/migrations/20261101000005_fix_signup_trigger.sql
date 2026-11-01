-- pgcrypto lives in the extensions schema on Supabase; the trigger's search_path is locked to public.
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
    case when final_role = 'student' then upper(encode(extensions.gen_random_bytes(4), 'hex')) end
  );
  return new;
end;
$$;
