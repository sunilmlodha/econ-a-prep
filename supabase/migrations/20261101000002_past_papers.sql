-- Catalogue of Pearson Edexcel Economics A exam series, 2016-2026.
-- The app links to Pearson's official exam-materials page; assessors can attach
-- PDFs their centre is licensed to use (Storage bucket "papers").

do $$
declare
  materials constant text := 'https://qualifications.pearson.com/en/qualifications/edexcel-a-levels/economics-a-2015.coursematerials.html#filterQuery=category:Pearson-UK:Category%2FExam-materials';
  s record;
  p record;
begin
  for s in
    select * from (values
      (2016, 6, 'June 2016', 'public', true, false),
      (2017, 6, 'June 2017', 'public', true, true),
      (2018, 6, 'June 2018', 'public', true, true),
      (2019, 6, 'June 2019', 'public', true, true),
      (2020, 6, 'June 2020', 'no_exam', true, true),
      (2020, 10, 'Autumn 2020', 'secure', true, true),
      (2021, 6, 'June 2021', 'no_exam', true, true),
      (2021, 10, 'Autumn 2021', 'secure', true, true),
      (2022, 6, 'June 2022', 'public', true, true),
      (2023, 6, 'June 2023', 'public', true, true),
      (2024, 6, 'June 2024', 'public', true, true),
      (2025, 6, 'June 2025', 'secure', true, true),
      (2026, 6, 'June 2026', 'secure', true, true)
    ) as t(yr, mon, label, avail, has_as, has_a)
  loop
    for p in
      select * from (values
        ('AS', '8EC0/01', 1, 'Introduction to markets and market failure', 'Theme 1', 90, 80),
        ('AS', '8EC0/02', 2, 'The UK economy – performance and policies', 'Theme 2', 90, 80),
        ('A', '9EC0/01', 1, 'Markets and business behaviour', 'Themes 1 & 3', 120, 100),
        ('A', '9EC0/02', 2, 'The national and global economy', 'Themes 2 & 4', 120, 100),
        ('A', '9EC0/03', 3, 'Microeconomics and macroeconomics', 'Themes 1–4 (synoptic)', 120, 100)
      ) as t(qual, code, no, title, themes, mins, marks)
    loop
      continue when (p.qual = 'AS' and not s.has_as) or (p.qual = 'A' and not s.has_a);
      insert into public.past_papers
        (id, qualification, spec_code, paper_no, title, themes, series, year, month, duration_minutes, total_marks, availability, qp_url, notes)
      values (
        p.qual || '-P' || p.no || '-' || s.yr || '-' || lpad(s.mon::text, 2, '0'),
        p.qual, p.code, p.no, p.title, p.themes, s.label, s.yr, s.mon, p.mins, p.marks, s.avail,
        case when s.avail = 'no_exam' then null else materials end,
        case s.avail
          when 'no_exam' then 'No exam sat: grades were centre/teacher assessed during COVID-19.'
          when 'secure' then 'Recent or autumn series: Pearson usually restricts these to teachers via Secure Key Materials. Your assessor can attach the PDF here.'
          else 'Question paper, mark scheme and examiner report are published by Pearson.'
        end
      ) on conflict (id) do nothing;
    end loop;
  end loop;
end $$;
