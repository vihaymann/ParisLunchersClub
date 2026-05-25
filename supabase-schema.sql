-- ============================================================
-- Lunchers Club — Supabase Schema
-- Run this in Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- Applications table (flattened fields for indexable columns)
create table applications (
  id           uuid primary key default gen_random_uuid(),
  status       text not null default 'pending'
               check (status in ('pending','accepted','waitlist','declined')),
  applied_at   timestamptz not null default now(),
  decided_at   timestamptz,
  ref_code     text not null unique,

  first_name   text not null,
  last_name    text not null,
  email        text not null,
  country_code text not null default '+33',
  phone        text not null default '',
  dob_day      text not null default '',
  dob_month    text not null default '',
  dob_year     text not null default '',
  city         text not null default '',
  city_is_other boolean not null default false,
  profession   text not null default '',
  employer     text not null default '',
  linkedin     text not null default '',
  instagram    text not null default '',
  ref_name     text not null default '',
  ref_relation text not null default '',
  why          text not null default '',

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_applications_status on applications (status);
create index idx_applications_applied_at on applications (applied_at desc);
create index idx_applications_email on applications (email);
create unique index idx_applications_email_pending
  on applications (email) where status = 'pending';

-- Auto-generate unique ref codes server-side
create or replace function generate_unique_ref_code()
returns text as $$
declare
  code text;
  letters text := 'ACDEFGHJKLMNPQRSTUVWXY';
begin
  for i in 1..100 loop
    code := 'LU-'
         || substr(letters, floor(random() * 22 + 1)::int, 1)
         || substr(letters, floor(random() * 22 + 1)::int, 1)
         || lpad(floor(10 + random() * 89)::text, 2, '0');
    if not exists (select 1 from applications where ref_code = code) then
      return code;
    end if;
  end loop;
  raise exception 'Could not generate unique ref code';
end;
$$ language plpgsql;

alter table applications
  alter column ref_code set default generate_unique_ref_code();

-- Auto-update updated_at on every UPDATE
create or replace function update_updated_at()
returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_applications_updated
  before update on applications
  for each row execute function update_updated_at();

-- Lunches table
create table lunches (
  id           uuid primary key default gen_random_uuid(),
  date         timestamptz not null,
  restaurant   text not null,
  neighborhood text not null default '',
  capacity     integer not null default 8,
  host_id      uuid references applications(id),
  created_at   timestamptz not null default now()
);

create index idx_lunches_date on lunches (date desc);

-- Junction table for attendees
create table lunch_attendees (
  lunch_id    uuid not null references lunches(id) on delete cascade,
  member_id   uuid not null references applications(id),
  primary key (lunch_id, member_id)
);

-- Membership plans
create table member_plans (
  member_id   uuid primary key references applications(id),
  plan_key    text not null default 'standard'
              check (plan_key in ('standard','patron')),
  updated_at  timestamptz not null default now()
);

-- ============================================================
-- Row Level Security
-- ============================================================
alter table applications enable row level security;
alter table lunches enable row level security;
alter table lunch_attendees enable row level security;
alter table member_plans enable row level security;

-- PUBLIC (anon): can only INSERT applications with status='pending'
create policy "public_submit_application"
  on applications for insert to anon
  with check (status = 'pending' and decided_at is null);

-- STAFF (authenticated): full access to everything
create policy "staff_read_apps" on applications for select to authenticated using (true);
create policy "staff_write_apps" on applications for update to authenticated using (true);
create policy "staff_insert_apps" on applications for insert to authenticated with check (true);
create policy "staff_delete_apps" on applications for delete to authenticated using (true);

create policy "staff_all_lunches" on lunches for all to authenticated using (true) with check (true);
create policy "staff_all_attendees" on lunch_attendees for all to authenticated using (true) with check (true);
create policy "staff_all_plans" on member_plans for all to authenticated using (true) with check (true);

-- ============================================================
-- RPC: public application submission (returns ref code)
-- Uses SECURITY DEFINER to bypass RLS for the RETURNING clause
-- ============================================================
create or replace function public.submit_application(
  p_first_name text,
  p_last_name text,
  p_email text,
  p_country_code text default '+33',
  p_phone text default '',
  p_dob_day text default '',
  p_dob_month text default '',
  p_dob_year text default '',
  p_city text default '',
  p_city_is_other boolean default false,
  p_profession text default '',
  p_employer text default '',
  p_linkedin text default '',
  p_instagram text default '',
  p_ref_name text default '',
  p_ref_relation text default '',
  p_why text default ''
) returns json as $$
declare
  new_row applications%rowtype;
begin
  insert into applications (
    status, first_name, last_name, email, country_code, phone,
    dob_day, dob_month, dob_year, city, city_is_other,
    profession, employer, linkedin, instagram,
    ref_name, ref_relation, why
  ) values (
    'pending', p_first_name, p_last_name, p_email, p_country_code, p_phone,
    p_dob_day, p_dob_month, p_dob_year, p_city, p_city_is_other,
    p_profession, p_employer, p_linkedin, p_instagram,
    p_ref_name, p_ref_relation, p_why
  ) returning * into new_row;

  return json_build_object(
    'id', new_row.id,
    'ref_code', new_row.ref_code,
    'status', new_row.status,
    'applied_at', new_row.applied_at
  );
end;
$$ language plpgsql security definer;

grant execute on function public.submit_application to anon;
grant execute on function public.submit_application to authenticated;
