-- VeloxWebStudio client requirements schema.
-- Run this entire file in Supabase Dashboard > SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  business_type text not null,
  contact_name text not null,
  email text not null,
  phone text,
  whatsapp text,
  country text,
  city text,
  address text,
  website_url text,
  social_links jsonb not null default '{}'::jsonb,
  logo_path text,
  about_description text not null,
  founding_year integer check (founding_year is null or founding_year between 1800 and 2100),
  experience integer check (experience is null or experience >= 0),
  differentiators text,
  certifications text,
  achievements text,
  service_areas text,
  created_at timestamptz not null default now()
);

create table if not exists public.website_requirements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  website_type text,
  selected_pages text[] not null default '{}',
  home_sections text[] not null default '{}',
  about_sections text[] not null default '{}',
  portfolio_sections text[] not null default '{}',
  selected_features text[] not null default '{}',
  design_preferences jsonb not null default '{}'::jsonb,
  reference_urls text,
  custom_budget numeric(14,2) not null check (custom_budget >= 0),
  currency text not null,
  budget_notes text,
  additional_notes text,
  raw_answers jsonb not null default '{}'::jsonb,
  status text not null default 'New' check (status in ('New','Reviewing','Contacted','Quoted','In Progress','Completed','Rejected')),
  internal_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  project_name text not null,
  project_type text,
  description text not null,
  location text,
  completion_date date,
  outcome text,
  reference_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.project_images (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  storage_path text not null,
  image_type text not null check (image_type in ('project','before','after')),
  original_filename text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.team_images (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  image_type text not null default 'team',
  created_at timestamptz not null default now()
);

create table if not exists public.client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text,
  file_size bigint not null default 0 check (file_size >= 0),
  image_type text not null default 'logo',
  created_at timestamptz not null default now()
);

create index if not exists clients_company_name_idx on public.clients using gin (to_tsvector('simple', company_name));
create index if not exists clients_business_type_idx on public.clients (business_type);
create index if not exists clients_created_at_idx on public.clients (created_at desc);
create index if not exists requirements_status_idx on public.website_requirements (status);
create index if not exists requirements_created_at_idx on public.website_requirements (created_at desc);
create index if not exists projects_client_id_idx on public.projects (client_id);
create index if not exists project_images_project_id_idx on public.project_images (project_id);
create index if not exists team_images_client_id_idx on public.team_images (client_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
drop trigger if exists website_requirements_updated_at on public.website_requirements;
create trigger website_requirements_updated_at before update on public.website_requirements
for each row execute function public.set_updated_at();

-- Private storage bucket: uploads are not publicly readable.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('client-uploads', 'client-uploads', false, 8388608,
  array['image/jpeg','image/png','image/webp','image/svg+xml'])
on conflict (id) do update set public=false, file_size_limit=8388608,
  allowed_mime_types=excluded.allowed_mime_types;

-- Enable RLS on every table containing client data.
alter table public.admin_users enable row level security;
alter table public.clients enable row level security;
alter table public.website_requirements enable row level security;
alter table public.projects enable row level security;
alter table public.project_images enable row level security;
alter table public.team_images enable row level security;
alter table public.client_files enable row level security;

-- Only authenticated users explicitly registered as admins can read/update client data.
drop policy if exists "Admins can read own admin membership" on public.admin_users;
create policy "Admins can read own admin membership" on public.admin_users
for select to authenticated using (user_id = auth.uid());

drop policy if exists "Admins can read clients" on public.clients;
create policy "Admins can read clients" on public.clients
for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "Admins can update clients" on public.clients;
create policy "Admins can update clients" on public.clients
for update to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "Admins can read requirements" on public.website_requirements;
create policy "Admins can read requirements" on public.website_requirements
for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "Admins can update requirements" on public.website_requirements;
create policy "Admins can update requirements" on public.website_requirements
for update to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()))
with check (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

drop policy if exists "Admins can read projects" on public.projects;
create policy "Admins can read projects" on public.projects
for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "Admins can read project images" on public.project_images;
create policy "Admins can read project images" on public.project_images
for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "Admins can read team images" on public.team_images;
create policy "Admins can read team images" on public.team_images
for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));
drop policy if exists "Admins can read client files" on public.client_files;
create policy "Admins can read client files" on public.client_files
for select to authenticated using (exists(select 1 from public.admin_users a where a.user_id=auth.uid()));

-- Storage access is private; the server uses the service role only after validating submissions.
drop policy if exists "Admins can read private client uploads" on storage.objects;
create policy "Admins can read private client uploads" on storage.objects
for select to authenticated using (
  bucket_id = 'client-uploads' and
  exists(select 1 from public.admin_users a where a.user_id=auth.uid())
);

-- No anon insert/read/update policies are intentionally created. Public submissions go through
-- the Vercel API, which uses the server-only service role key.
