-- ============================================================
-- Lilliput Play School - Database Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================

-- 1. PROFILES (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('director', 'coordinator', 'teacher', 'office')),
  created_at timestamptz default now()
);

-- 2. CHILDREN
create table if not exists public.children (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  class_name text not null,
  parent_name text,
  parent_phone text,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 3. ATTENDANCE + FOLLOW-UP (core module from research)
create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  attendance_date date not null default current_date,
  status text not null check (status in ('Present', 'Absent', 'Late')),
  follow_up_status text not null default 'None'
    check (follow_up_status in ('None', 'Pending', 'Contacted', 'Resolved')),
  follow_up_note text default '',
  parent_response text default '',
  action_by text default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (child_id, attendance_date)
);

-- 4. FEE RECORDS
create table if not exists public.fees (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  month_year text not null,          -- e.g. '2026-09'
  amount numeric(10,2) not null default 0,
  status text not null default 'Pending'
    check (status in ('Paid', 'Pending', 'Partial')),
  last_payment_date date,
  notes text default '',
  updated_by uuid references public.profiles(id),
  updated_at timestamptz default now(),
  unique (child_id, month_year)
);

-- 5. PARENT COMMUNICATION LOG
create table if not exists public.communications (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  log_date date not null default current_date,
  message_summary text not null,
  channel text not null default 'WhatsApp'
    check (channel in ('WhatsApp', 'Call', 'In-person', 'Other')),
  action_required text default '',
  status text not null default 'Open'
    check (status in ('Open', 'Closed')),
  handled_by text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 6. CHILD PROGRESS / SUPPORT NOTES
create table if not exists public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id) on delete cascade,
  note_date date not null default current_date,
  category text not null
    check (category in ('Learning', 'Behaviour', 'Health', 'Social', 'Other')),
  note text not null,
  needs_support boolean default false,
  recorded_by text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- 7. DAILY HANDOVER
create table if not exists public.handover_notes (
  id uuid primary key default gen_random_uuid(),
  note_date date not null default current_date,
  note text not null,
  is_seen boolean default false,
  created_by_name text default '',
  created_by uuid references public.profiles(id),
  created_at timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY (basic – all authenticated users can read/write)
-- You can tighten later per role
-- ============================================================

alter table public.profiles enable row level security;
alter table public.children enable row level security;
alter table public.attendance enable row level security;
alter table public.fees enable row level security;
alter table public.communications enable row level security;
alter table public.progress_notes enable row level security;
alter table public.handover_notes enable row level security;

create policy "Authenticated users full access" on public.profiles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.children
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.attendance
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.fees
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.communications
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.progress_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "Authenticated users full access" on public.handover_notes
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ============================================================
-- TRIGGER: auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    coalesce(new.raw_user_meta_data->>'role', 'teacher')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- SAMPLE CHILDREN (optional – run after schema)
-- ============================================================
-- insert into public.children (full_name, class_name, parent_name, parent_phone) values
-- ('Aarav Sharma', 'Nursery A', 'Mr. Sharma', '98XXXXXX01'),
-- ('Ananya Verma', 'Nursery A', 'Mrs. Verma', '98XXXXXX02'),
-- ('Vivaan Singh', 'LKG B', 'Mr. Singh', '98XXXXXX03'),
-- ('Myra Gupta', 'LKG B', 'Mrs. Gupta', '98XXXXXX04'),
-- ('Reyansh Patel', 'UKG A', 'Mr. Patel', '98XXXXXX05'),
-- ('Siya Reddy', 'UKG A', 'Mrs. Reddy', '98XXXXXX06');
