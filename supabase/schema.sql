-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users / Collaborators
-- auth_id links a profile to a Supabase Auth account (null = no login, legacy/imported).
create table users (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  area text not null,
  job_title text not null default '',
  seniority text not null default '',
  employee_number text not null default '',
  total_points integer not null default 0,
  spent_points integer not null default 0,
  auth_id uuid unique references auth.users(id) on delete set null,
  email text,
  is_active boolean not null default true,
  role text not null default 'viewer' check (role in ('admin','manager','viewer')),
  created_at timestamptz not null default now()
);

-- Teams (points pool) — a user belongs to at most one team; null = unassigned
create table teams (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  area text not null default '',
  created_at timestamptz not null default now()
);

alter table users
  add column if not exists team_id uuid references teams(id) on delete set null;

-- SQDCM Point Configuration (set by manager)
create table sqdcm_point_config (
  id uuid primary key default uuid_generate_v4(),
  category char(1) not null check (category in ('S','Q','D','C','M')),
  impact_level text not null check (impact_level in ('high','medium')),
  points integer not null default 0,
  unique (category, impact_level)
);

-- Insert default point values
insert into sqdcm_point_config (category, impact_level, points) values
  ('S','high', 50), ('S','medium', 25),
  ('Q','high', 40), ('Q','medium', 20),
  ('D','high', 30), ('D','medium', 15),
  ('C','high', 35), ('C','medium', 18),
  ('M','high', 25), ('M','medium', 12);

-- Improvements
create table improvements (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  area text not null,
  date_submitted date not null default current_date,
  status text not null default 'submitted' check (status in ('draft','submitted','under_review','approved','implemented','rejected')),
  -- Step 2: Problem
  problem_description text not null default '',
  sqdcm_targeted text[] not null default '{}',
  expected_objective text not null default '',
  problem_impact text not null default '',
  -- Step 3: Current vs Desired
  current_state text[] not null default '{}',
  desired_state text[] not null default '{}',
  -- Step 5: Root Cause
  root_cause_method text not null default '5whys' check (root_cause_method in ('5whys','ishikawa')),
  five_whys jsonb not null default '[]',
  ishikawa_causes jsonb not null default '[]',
  -- Step 6: Solutions
  solutions jsonb not null default '[]',
  chosen_solution text not null default '',
  -- Step 7: Development
  dev_planning text not null default '',
  dev_resources text not null default '',
  dev_implementation text not null default '',
  dev_followup text not null default '',
  -- Step 8: Images
  before_images text[] not null default '{}',
  after_images text[] not null default '{}',
  -- Step 9: Results
  result_indicators jsonb not null default '[]',
  new_standards text[] not null default '{}',
  -- Step 10: SQDCM Impact
  sqdcm_impact jsonb not null default '[]',
  submitter_impact jsonb not null default '[]',
  -- Step 11: PDCA
  pdca_plan text not null default '',
  pdca_do text not null default '',
  pdca_check text not null default '',
  pdca_act text not null default '',
  next_steps_responsible text not null default '',
  next_steps_date date,
  next_steps_followup text not null default '',
  -- Meta
  created_by uuid references users(id),
  evaluated_by uuid references users(id) on delete set null,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Participants in an improvement
create table improvement_participants (
  id uuid primary key default uuid_generate_v4(),
  improvement_id uuid not null references improvements(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  role_in_project text not null default '',
  unique (improvement_id, user_id)
);

-- Point assignments per improvement per user
create table point_assignments (
  id uuid primary key default uuid_generate_v4(),
  improvement_id uuid not null references improvements(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  points integer not null default 0,
  assigned_by text not null default 'admin',
  created_at timestamptz not null default now(),
  unique (improvement_id, user_id)
);

-- Audit log of improvement status transitions (written by trigger only)
create table status_history (
  id uuid primary key default uuid_generate_v4(),
  improvement_id uuid not null references improvements(id) on delete cascade,
  from_status text,
  to_status text,
  changed_by uuid references users(id),
  comment text not null default '',
  created_at timestamptz not null default now()
);

-- Auto-update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger improvements_updated_at
  before update on improvements
  for each row execute function update_updated_at();

-- Log status changes to status_history. SECURITY DEFINER so the audit row is
-- written even when the acting user has no direct insert rights on the table.
create or replace function log_status_change()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  uid uuid;
begin
  if old.status is distinct from new.status then
    select id into uid from public.users where auth_id = auth.uid() limit 1;
    insert into public.status_history (improvement_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, uid);
  end if;
  return new;
end;
$$;

create trigger improvements_status_log
  after update of status on improvements
  for each row execute function log_status_change();

-- Auto-sync users.total_points (current balance = earned - held) and spent_points.
-- Fires for both point_assignments (earnings) and award_redemptions (spending).
create or replace function sync_user_points()
returns trigger as $$
declare
  uid uuid;
begin
  uid := coalesce(
    case tg_table_name
      when 'point_assignments' then coalesce(new.user_id, old.user_id)
      when 'award_redemptions' then coalesce(new.user_id, old.user_id)
    end,
    null
  );

  if uid is null then return coalesce(new, old); end if;

  update users
  set
    spent_points = (
      select coalesce(sum(points_spent), 0)
      from award_redemptions
      where user_id = uid and status in ('pending','fulfilled')
    ),
    total_points = (
      select coalesce(sum(pa.points), 0)
      from point_assignments pa where pa.user_id = uid
    ) - (
      select coalesce(sum(points_spent), 0)
      from award_redemptions
      where user_id = uid and status in ('pending','fulfilled')
    )
  where id = uid;

  return coalesce(new, old);
end;
$$ language plpgsql;

create trigger point_assignments_sync
  after insert or update or delete on point_assignments
  for each row execute function sync_user_points();

-- Keep the "every participant earns the improvement's points" rule true when a
-- participant is added after the improvement was already scored. (If it isn't
-- scored yet, points are assigned later in the Admin panel for all participants.)
create or replace function sync_new_participant_points()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_points integer;
begin
  select points into v_points
  from point_assignments
  where improvement_id = new.improvement_id
  limit 1;

  if v_points is not null then
    insert into point_assignments (improvement_id, user_id, points, assigned_by)
    values (new.improvement_id, new.user_id, v_points, 'auto')
    on conflict (improvement_id, user_id) do nothing;
  end if;

  return new;
end;
$$;

create trigger improvement_participants_points
  after insert on improvement_participants
  for each row execute function sync_new_participant_points();

-- Leaderboard view (annual)
create or replace view leaderboard_annual as
select
  u.id as user_id,
  u.name as user_name,
  u.area,
  extract(year from pa.created_at)::int as year,
  coalesce(sum(pa.points), 0) as total_points,
  count(distinct pa.improvement_id) as improvements_count,
  rank() over (partition by extract(year from pa.created_at) order by sum(pa.points) desc) as rank
from users u
left join point_assignments pa on pa.user_id = u.id
group by u.id, u.name, u.area, extract(year from pa.created_at);

-- Dashboard metrics view
create or replace view dashboard_metrics as
select
  count(*) as total_improvements,
  count(*) filter (where status = 'implemented') as implemented,
  count(*) filter (where status in ('submitted','under_review','approved')) as in_progress,
  count(*) filter (where status = 'rejected') as rejected
from improvements;

-- ============================================================
-- AWARDS CATALOG
-- ============================================================

create table awards (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text not null default '',
  point_cost integer not null check (point_cost > 0),
  image_url text not null default '',
  stock integer,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (stock is null or stock >= 0)
);

create trigger awards_updated_at
  before update on awards
  for each row execute function update_updated_at();

create table award_redemptions (
  id uuid primary key default uuid_generate_v4(),
  award_id uuid not null references awards(id),
  user_id uuid not null references users(id) on delete cascade,
  points_spent integer not null check (points_spent > 0),
  status text not null default 'pending' check (status in ('pending','fulfilled','cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  fulfilled_at timestamptz
);

-- Hold stock on pending/fulfilled, release on cancel/delete.
create or replace function adjust_award_stock()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    if new.status in ('pending','fulfilled') then
      update awards set stock = stock - 1
        where id = new.award_id and stock is not null;
    end if;
    return new;
  end if;

  if (tg_op = 'UPDATE') then
    if old.status in ('pending','fulfilled') and new.status = 'cancelled' then
      update awards set stock = stock + 1
        where id = new.award_id and stock is not null;
    elsif old.status = 'cancelled' and new.status in ('pending','fulfilled') then
      update awards set stock = stock - 1
        where id = new.award_id and stock is not null;
    end if;
    return new;
  end if;

  if (tg_op = 'DELETE') then
    if old.status in ('pending','fulfilled') then
      update awards set stock = stock + 1
        where id = old.award_id and stock is not null;
    end if;
    return old;
  end if;

  return null;
end;
$$ language plpgsql;

create trigger award_redemptions_stock
  after insert or update or delete on award_redemptions
  for each row execute function adjust_award_stock();

create trigger award_redemptions_sync
  after insert or update or delete on award_redemptions
  for each row execute function sync_user_points();

-- ============================================================
-- AUTH HELPERS
-- Resolve the calling Supabase Auth user to their app profile. SECURITY DEFINER
-- + stable so RLS policies can call them without recursive policy evaluation.
-- ============================================================
create or replace function public."current_role"()
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select role from public.users where auth_id = auth.uid() limit 1;
$$;

create or replace function public.current_user_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from public.users where auth_id = auth.uid() limit 1;
$$;

-- Admin-only user provisioning: creates the Supabase Auth account (+ identity)
-- and the matching public.users profile in one call. Returns the new profile id.
create or replace function public.admin_create_user(
  p_email text,
  p_password text,
  p_name text,
  p_area text default '',
  p_job_title text default '',
  p_seniority text default '',
  p_employee_number text default '',
  p_role text default 'viewer'
)
returns uuid
language plpgsql
security definer
set search_path to 'public', 'auth', 'extensions'
as $$
declare
  v_caller_role text;
  v_user_id uuid;
  v_users_id uuid;
begin
  -- Authorize: only admin can create users
  select role into v_caller_role from public.users where auth_id = auth.uid();
  if v_caller_role is null or v_caller_role <> 'admin' then
    raise exception 'Forbidden: admin role required';
  end if;

  if p_role not in ('admin','manager','viewer') then
    raise exception 'Invalid role: %', p_role;
  end if;

  if length(coalesce(p_password,'')) < 8 then
    raise exception 'Password must be at least 8 characters';
  end if;

  if exists (select 1 from auth.users where email = p_email) then
    raise exception 'Email already in use';
  end if;

  v_user_id := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token,
    is_super_admin, is_anonymous
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_user_id, 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider','email','providers',array['email']),
    '{}'::jsonb,
    now(), now(),
    '', '', '', '',
    false, false
  );

  insert into auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(), v_user_id,
    jsonb_build_object('sub', v_user_id::text, 'email', p_email, 'email_verified', true),
    'email', v_user_id::text,
    now(), now(), now()
  );

  insert into public.users (name, area, job_title, seniority, employee_number, email, role, auth_id, is_active)
  values (p_name, p_area, p_job_title, p_seniority, p_employee_number, p_email, p_role, v_user_id, true)
  returning id into v_users_id;

  return v_users_id;
end;
$$;

-- Admin-only hard delete of a user profile + their Auth login.
-- Authored improvements and status-history rows are preserved (link nulled);
-- point_assignments / participations / award_redemptions cascade away.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'auth'
as $$
declare
  v_caller_role text;
  v_caller_id uuid;
  v_auth uuid;
begin
  select id, role into v_caller_id, v_caller_role
  from public.users where auth_id = auth.uid();

  if v_caller_role is null or v_caller_role <> 'admin' then
    raise exception 'Forbidden: admin role required';
  end if;

  if p_user_id = v_caller_id then
    raise exception 'You cannot delete your own account';
  end if;

  select auth_id into v_auth from public.users where id = p_user_id;

  update public.improvements set created_by = null where created_by = p_user_id;
  update public.status_history set changed_by = null where changed_by = p_user_id;

  delete from public.users where id = p_user_id;

  if v_auth is not null then
    delete from auth.users where id = v_auth;
  end if;
end;
$$;

-- ============================================================
-- ROW LEVEL SECURITY
-- Reads are public (everyone signed in can browse). Writes are gated by role
-- via current_role()/current_user_id(). status_history is written only by the
-- log_status_change() trigger, so it has no write policy.
-- ============================================================
alter table users enable row level security;
alter table teams enable row level security;
alter table sqdcm_point_config enable row level security;
alter table improvements enable row level security;
alter table improvement_participants enable row level security;
alter table point_assignments enable row level security;
alter table awards enable row level security;
alter table award_redemptions enable row level security;
alter table status_history enable row level security;

-- users
drop policy if exists users_select on users;
create policy users_select on users for select using (true);
drop policy if exists users_admin_write on users;
create policy users_admin_write on users for all
  using (public."current_role"() = 'admin')
  with check (public."current_role"() = 'admin');

-- teams (open management for now)
drop policy if exists public_all on teams;
create policy public_all on teams for all using (true) with check (true);

-- sqdcm_point_config
drop policy if exists sqdcm_select on sqdcm_point_config;
create policy sqdcm_select on sqdcm_point_config for select using (true);
drop policy if exists sqdcm_admin_write on sqdcm_point_config;
create policy sqdcm_admin_write on sqdcm_point_config for all
  using (public."current_role"() = 'admin')
  with check (public."current_role"() = 'admin');

-- improvements
-- Drafts are visible only to their owner and managers/admins; submitted+ are public.
drop policy if exists improvements_select on improvements;
create policy improvements_select on improvements for select
  using (
    status <> 'draft'
    or created_by = public.current_user_id()
    or public."current_role"() in ('admin','manager')
  );
drop policy if exists improvements_insert on improvements;
create policy improvements_insert on improvements for insert
  with check (
    created_by is null
    or created_by = public.current_user_id()
    or public."current_role"() in ('admin','manager')
  );
-- Owner may edit their own draft and submit it (draft -> submitted) but not edit
-- once submitted; managers/admins may edit any improvement at any status.
drop policy if exists improvements_update on improvements;
create policy improvements_update on improvements for update
  using (
    public."current_role"() in ('admin','manager')
    or (created_by = public.current_user_id() and status = 'draft')
  )
  with check (
    public."current_role"() in ('admin','manager')
    or (created_by = public.current_user_id() and status in ('draft','submitted'))
  );
drop policy if exists improvements_delete on improvements;
create policy improvements_delete on improvements for delete
  using (public."current_role"() = 'admin');

-- improvement_participants
drop policy if exists participants_select on improvement_participants;
create policy participants_select on improvement_participants for select using (true);
drop policy if exists participants_write on improvement_participants;
create policy participants_write on improvement_participants for all
  using (
    public."current_role"() in ('admin','manager')
    or exists (
      select 1 from improvements i
      where i.id = improvement_participants.improvement_id
        and i.created_by = public.current_user_id()
    )
  )
  with check (
    public."current_role"() in ('admin','manager')
    or exists (
      select 1 from improvements i
      where i.id = improvement_participants.improvement_id
        and i.created_by = public.current_user_id()
    )
  );

-- point_assignments
drop policy if exists points_select on point_assignments;
create policy points_select on point_assignments for select using (true);
drop policy if exists points_manager_write on point_assignments;
create policy points_manager_write on point_assignments for all
  using (public."current_role"() in ('admin','manager'))
  with check (public."current_role"() in ('admin','manager'));

-- awards
drop policy if exists awards_select on awards;
create policy awards_select on awards for select using (true);
drop policy if exists awards_admin_write on awards;
create policy awards_admin_write on awards for all
  using (public."current_role"() = 'admin')
  with check (public."current_role"() = 'admin');

-- award_redemptions
drop policy if exists redemptions_select on award_redemptions;
create policy redemptions_select on award_redemptions for select using (true);
drop policy if exists redemptions_manager_write on award_redemptions;
create policy redemptions_manager_write on award_redemptions for all
  using (public."current_role"() in ('admin','manager'))
  with check (public."current_role"() in ('admin','manager'));

-- status_history (read-only to clients; rows inserted by trigger)
drop policy if exists status_history_select on status_history;
create policy status_history_select on status_history for select using (true);

-- Storage buckets for improvement before/after images and award images.
insert into storage.buckets (id, name, public) values
  ('improvements','improvements',true),
  ('awards','awards',true)
on conflict (id) do update set public = true;

drop policy if exists app_buckets_all on storage.objects;
create policy app_buckets_all on storage.objects for all to anon, authenticated
  using (bucket_id in ('improvements','awards'))
  with check (bucket_id in ('improvements','awards'));

-- ============================================================
-- MONTHLY EVALUATION FORUM
-- Panel members (admin/manager) score each improvement on 5 criteria
-- (1-5, higher = better) to rank them and surface the Top 5. No points here.
-- ============================================================
create table forum_evaluations (
  id uuid primary key default uuid_generate_v4(),
  improvement_id uuid not null references improvements(id) on delete cascade,
  evaluator_id uuid not null references users(id) on delete cascade,
  impacto    smallint not null default 3 check (impacto between 1 and 5),
  viabilidad smallint not null default 3 check (viabilidad between 1 and 5),
  urgencia   smallint not null default 3 check (urgencia between 1 and 5),
  alineacion smallint not null default 3 check (alineacion between 1 and 5),
  costo      smallint not null default 3 check (costo between 1 and 5),
  comment text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (improvement_id, evaluator_id)
);

create trigger forum_evaluations_updated_at
  before update on forum_evaluations
  for each row execute function update_updated_at();

-- Single-row settings: participation points the admin grants on top of SQDCM
-- impact (so everyone earns something just for participating).
create table point_settings (
  id uuid primary key default uuid_generate_v4(),
  participation_points integer not null default 0 check (participation_points >= 0),
  singleton boolean not null default true unique,
  updated_at timestamptz not null default now()
);

create trigger point_settings_updated_at
  before update on point_settings
  for each row execute function update_updated_at();

insert into point_settings (participation_points) values (0);

-- RLS
alter table forum_evaluations enable row level security;
alter table point_settings enable row level security;

-- forum_evaluations: anyone signed in reads rankings; an evaluator writes only
-- their own row; admins/managers may manage any.
drop policy if exists forum_eval_select on forum_evaluations;
create policy forum_eval_select on forum_evaluations for select using (true);
drop policy if exists forum_eval_write on forum_evaluations;
create policy forum_eval_write on forum_evaluations for all
  using (
    evaluator_id = public.current_user_id()
    or public."current_role"() in ('admin','manager')
  )
  with check (
    evaluator_id = public.current_user_id()
    or public."current_role"() in ('admin','manager')
  );

-- point_settings: public read, admin write (like sqdcm_point_config)
drop policy if exists point_settings_select on point_settings;
create policy point_settings_select on point_settings for select using (true);
drop policy if exists point_settings_admin_write on point_settings;
create policy point_settings_admin_write on point_settings for all
  using (public."current_role"() = 'admin')
  with check (public."current_role"() = 'admin');
