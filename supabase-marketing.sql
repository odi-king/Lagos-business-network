-- LBN Phase 17A: UNIVERSITY MARKETING DEPARTMENT (database, security and server-side pay rules).
-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run. Safe to run again.
-- Run AFTER supabase-admin-home.sql, supabase-audit.sql and supabase-security-5.sql.
--
-- Separate from the Ambassador programme (own tables, own pages). Nothing existing is removed.
--   * New admin permission "marketing" (Super Admin always has it). Pay approval needs the existing "finance" permission.
--   * Every institution has its OWN team (default 15 places, adjustable by the Super Admin). Only the Super Admin can move a promoter between institutions.
--   * Coordinators see and manage only their own institution. Promoters see only their own work.
--   * Money is worked out ONLY by the database from approved attendance and verified referrals. The website never sends an amount.
--   * Pay needs two people: one prepares, a different authorised person approves (the Super Admin may do both). Every step goes to the Admin audit log.
--   * All tables are closed to direct access. Everything goes through checked functions.

-- ---------- Settings, role templates, institutions ----------
create table if not exists mkt_settings (
  id boolean primary key default true check (id),
  default_rate_kobo bigint not null default 1000000 check (default_rate_kobo >= 0),
  default_days integer not null default 30 check (default_days between 1 and 366)
);
insert into mkt_settings default values on conflict do nothing;

create table if not exists mkt_roles (
  key text primary key,
  title text not null,
  default_slots integer not null check (default_slots between 0 and 100),
  responsibilities text not null default '',
  sort integer not null default 0
);
insert into mkt_roles (key, title, default_slots, responsibilities, sort) values
  ('coordinator', 'Campus Marketing Coordinator', 1, 'Leads the campus team, plans the daily work, marks attendance, reviews daily reports and reports to LBN management.', 1),
  ('faculty_rep', 'Faculty Representative', 4, 'Represents LBN in an assigned faculty or department, spreads awareness and connects students to LBN.', 2),
  ('student_recruiter', 'Student Recruitment Promoter', 5, 'Signs students up on LBN and helps them finish their registration.', 3),
  ('digital_promoter', 'Digital Marketing Promoter', 2, 'Runs the campus social media, WhatsApp groups and online posts for LBN.', 4),
  ('business_outreach', 'Business Outreach Promoter', 2, 'Visits business owners and traders around the campus and helps them register on LBN.', 5),
  ('events_promoter', 'Events and Activation Promoter', 1, 'Organises campus events, booths and activation days for LBN.', 6)
on conflict (key) do nothing;

create table if not exists mkt_institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text,
  kind text not null default 'university' check (kind in ('university', 'polytechnic', 'college_of_education', 'other')),
  city text,
  state text,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  notes text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists mkt_institutions_name_uq on mkt_institutions (lower(name));

create table if not exists mkt_institution_roles (
  institution_id uuid not null references mkt_institutions(id) on delete cascade,
  role_key text not null references mkt_roles(key),
  slots integer not null check (slots between 0 and 100),
  responsibilities text,
  primary key (institution_id, role_key)
);

-- ---------- People ----------
create table if not exists mkt_members (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references mkt_institutions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references mkt_roles(key),
  status text not null default 'active' check (status in ('active', 'suspended', 'ended')),
  note text,
  joined_at timestamptz not null default now(),
  ended_at timestamptz,
  added_by uuid references profiles(id) on delete set null
);
-- one live place in one institution per person
create unique index if not exists mkt_members_one_live on mkt_members (user_id) where status in ('active', 'suspended');
create index if not exists mkt_members_by_inst on mkt_members (institution_id, status);

create table if not exists mkt_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_institution uuid references mkt_institutions(id) on delete set null,
  to_institution uuid references mkt_institutions(id) on delete set null,
  from_role text,
  to_role text,
  reason text,
  moved_by uuid references profiles(id) on delete set null,
  moved_at timestamptz not null default now()
);

create table if not exists mkt_bank (
  user_id uuid primary key references auth.users(id) on delete cascade,
  bank_name text not null,
  account_number text not null,
  account_name text not null,
  updated_at timestamptz not null default now()
);

-- ---------- Campaigns ----------
create table if not exists mkt_campaigns (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references mkt_institutions(id) on delete cascade,
  name text not null,
  instructions text,
  start_date date not null,
  end_date date not null,
  status text not null default 'draft' check (status in ('draft', 'active', 'completed', 'cancelled')),
  pay_basis text not null default 'daily' check (pay_basis in ('daily', 'weekly', 'monthly')),
  rate_kobo bigint not null default 1000000 check (rate_kobo >= 0),
  work_days_per_week integer not null default 5 check (work_days_per_week between 1 and 7),
  work_days_per_month integer not null default 22 check (work_days_per_month between 1 and 31),
  target_student_regs integer not null default 0 check (target_student_regs >= 0),
  target_verified integer not null default 0 check (target_verified >= 0),
  target_business_regs integer not null default 0 check (target_business_regs >= 0),
  target_active_members integer not null default 0 check (target_active_members >= 0),
  bonus_per_verified_kobo bigint not null default 0 check (bonus_per_verified_kobo >= 0),
  bonus_threshold integer not null default 0 check (bonus_threshold >= 0),
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint mkt_campaign_dates check (end_date >= start_date)
);
create index if not exists mkt_campaigns_by_inst on mkt_campaigns (institution_id, status);

create table if not exists mkt_assignments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mkt_campaigns(id) on delete cascade,
  member_id uuid not null references mkt_members(id) on delete cascade,
  rate_kobo bigint check (rate_kobo is null or rate_kobo >= 0),
  status text not null default 'active' check (status in ('active', 'removed')),
  assigned_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (campaign_id, member_id)
);

create table if not exists mkt_attendance (
  campaign_id uuid not null references mkt_campaigns(id) on delete cascade,
  member_id uuid not null references mkt_members(id) on delete cascade,
  day date not null,
  status text not null check (status in ('present', 'absent', 'excused')),
  marked_by uuid references profiles(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (campaign_id, member_id, day)
);

create table if not exists mkt_activity (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mkt_campaigns(id) on delete cascade,
  member_id uuid not null references mkt_members(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('outreach', 'registration_drive', 'business_visit', 'event', 'digital_post', 'other')),
  summary text not null,
  contacts integer not null default 0 check (contacts between 0 and 5000),
  student_regs_claimed integer not null default 0 check (student_regs_claimed between 0 and 2000),
  business_regs_claimed integer not null default 0 check (business_regs_claimed between 0 and 2000),
  evidence_note text,
  status text not null default 'submitted' check (status in ('submitted', 'approved', 'rejected')),
  review_note text,
  reviewed_by uuid references profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mkt_activity_by_campaign on mkt_activity (campaign_id, day desc);

-- ---------- Pay ----------
create table if not exists mkt_pay (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mkt_campaigns(id) on delete cascade,
  member_id uuid not null references mkt_members(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  days_present integer not null default 0,
  base_kobo bigint not null default 0 check (base_kobo >= 0),
  bonus_kobo bigint not null default 0 check (bonus_kobo >= 0),
  manual_bonus_kobo bigint not null default 0 check (manual_bonus_kobo >= 0),
  manual_bonus_reason text,
  total_kobo bigint not null default 0 check (total_kobo >= 0),
  status text not null default 'prepared' check (status in ('prepared', 'approved', 'paid', 'withheld')),
  prepared_by uuid references profiles(id) on delete set null,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  paid_by uuid references profiles(id) on delete set null,
  paid_at timestamptz,
  payment_reference text,
  withheld_reason text,
  created_at timestamptz not null default now(),
  constraint mkt_pay_period check (period_end >= period_start)
);
create index if not exists mkt_pay_by_campaign on mkt_pay (campaign_id, status);

-- ---------- Close every table to direct access ----------
alter table mkt_settings enable row level security;
alter table mkt_roles enable row level security;
alter table mkt_institutions enable row level security;
alter table mkt_institution_roles enable row level security;
alter table mkt_members enable row level security;
alter table mkt_transfers enable row level security;
alter table mkt_bank enable row level security;
alter table mkt_campaigns enable row level security;
alter table mkt_assignments enable row level security;
alter table mkt_attendance enable row level security;
alter table mkt_activity enable row level security;
alter table mkt_pay enable row level security;
revoke all on mkt_settings, mkt_roles, mkt_institutions, mkt_institution_roles, mkt_members, mkt_transfers, mkt_bank,
  mkt_campaigns, mkt_assignments, mkt_attendance, mkt_activity, mkt_pay from public, anon, authenticated;

-- ---------- Small helpers (not callable from the website) ----------
create or replace function mkt_today() returns date language sql stable set search_path = public as $$
  select (now() at time zone 'Africa/Lagos')::date;
$$;

create or replace function mkt_staff() returns boolean language sql security definer set search_path = public stable as $$
  select admin_can('marketing');
$$;

create or replace function mkt_coord_of(p_inst uuid) returns boolean language sql security definer set search_path = public stable as $$
  select exists (select 1 from mkt_members m
                 where m.user_id = auth.uid() and m.institution_id = p_inst and m.role_key = 'coordinator' and m.status = 'active');
$$;

create or replace function mkt_can_view(p_inst uuid) returns boolean language sql security definer set search_path = public stable as $$
  select mkt_staff() or mkt_coord_of(p_inst);
$$;

create or replace function mkt_audit(p_action text, p_target uuid, p_details text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into admin_audit (actor_id, action, target_id, details)
  values (auth.uid(), left('marketing: ' || p_action, 80), p_target, left(p_details, 500));
end;
$$;

create or replace function mkt_need_staff() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not mkt_staff() then raise exception 'Not allowed'; end if;
end;
$$;

create or replace function mkt_need_super() returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not is_super_admin() then raise exception 'Only the Super Admin can do this'; end if;
end;
$$;

create or replace function mkt_naira(p_kobo bigint) returns text language sql immutable set search_path = public as $$
  select 'N' || to_char(coalesce(p_kobo, 0) / 100.0, 'FM999,999,999,990.00');
$$;

-- Results of one promoter inside one campaign, from the real referral records (never typed in by anyone)
create or replace function mkt_member_results(p_campaign uuid, p_member uuid, p_from date default null, p_to date default null)
returns table (student_regs integer, business_regs integer, other_regs integer, verified integer, active_members integer)
language sql security definer set search_path = public stable as $$
  with c as (select start_date, end_date from mkt_campaigns where id = p_campaign),
       m as (select user_id from mkt_members where id = p_member),
       r as (
         select rf.id, rf.flagged, rf.status, rf.referred_id, pr.role
         from referrals rf
         join m on m.user_id = rf.referrer_id
         join c on true
         left join profiles pr on pr.id = rf.referred_id
         where (rf.created_at at time zone 'Africa/Lagos')::date between coalesce(p_from, c.start_date) and coalesce(p_to, c.end_date)
           and rf.status <> 'void'
       )
  select count(*) filter (where role = 'student')::int,
         count(*) filter (where role = 'business')::int,
         count(*) filter (where role is distinct from 'student' and role is distinct from 'business')::int,
         count(*) filter (where not flagged)::int,
         count(*) filter (where not flagged and exists (select 1 from memberships ms where ms.user_id = r.referred_id and ms.paid_until > now()))::int
  from r;
$$;

-- What a promoter has earned for a period, from approved attendance and real referrals
create or replace function mkt_pay_calc(p_campaign uuid, p_member uuid, p_from date, p_to date)
returns table (days integer, base bigint, bonus bigint, verified integer)
language plpgsql security definer set search_path = public stable as $$
declare c mkt_campaigns%rowtype; v_rate bigint; v_days integer; v_ver integer; v_base bigint;
begin
  select * into c from mkt_campaigns where id = p_campaign;
  select coalesce(a.rate_kobo, c.rate_kobo) into v_rate from mkt_assignments a where a.campaign_id = p_campaign and a.member_id = p_member;
  v_rate := coalesce(v_rate, c.rate_kobo);
  select count(*)::int into v_days from mkt_attendance t
   where t.campaign_id = p_campaign and t.member_id = p_member and t.status = 'present' and t.day between p_from and p_to;
  v_base := case c.pay_basis
              when 'daily' then v_days * v_rate
              when 'weekly' then round(v_days * v_rate::numeric / c.work_days_per_week)
              else round(v_days * v_rate::numeric / c.work_days_per_month) end;
  select r.verified into v_ver from mkt_member_results(p_campaign, p_member, p_from, p_to) r;
  v_ver := coalesce(v_ver, 0);
  return query select v_days, v_base::bigint, (c.bonus_per_verified_kobo * greatest(v_ver - c.bonus_threshold, 0))::bigint, v_ver;
end;
$$;

-- ============ Institutions and teams ============
create or replace function mkt_roles_list() returns json
language plpgsql security definer set search_path = public as $$
begin
  if not (mkt_staff() or exists (select 1 from mkt_members where user_id = auth.uid() and status = 'active')) then raise exception 'Not allowed'; end if;
  return (select coalesce(json_agg(row_to_json(x) order by x.sort), '[]'::json)
          from (select key, title, default_slots, responsibilities, sort from mkt_roles) x);
end;
$$;

create or replace function mkt_settings_get() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform mkt_need_staff();
  return (select row_to_json(s) from (select default_rate_kobo, default_days from mkt_settings) s);
end;
$$;

create or replace function mkt_role_template_set(p_key text, p_slots integer, p_resp text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform mkt_need_super();
  if p_slots is null or p_slots < 0 or p_slots > 100 then raise exception 'Places must be 0 to 100'; end if;
  update mkt_roles set default_slots = p_slots, responsibilities = left(coalesce(p_resp, ''), 600) where key = p_key;
  if not found then raise exception 'Unknown role'; end if;
  perform mkt_audit('changed role template', null, p_key || ' places ' || p_slots);
end;
$$;

create or replace function mkt_settings_set(p_rate_kobo bigint, p_days integer) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform mkt_need_super();
  if p_rate_kobo is null or p_rate_kobo < 0 or p_rate_kobo > 100000000 then raise exception 'Daily pay looks wrong'; end if;
  if p_days is null or p_days < 1 or p_days > 366 then raise exception 'Campaign length must be 1 to 366 days'; end if;
  update mkt_settings set default_rate_kobo = p_rate_kobo, default_days = p_days;
  perform mkt_audit('changed default pay', null, mkt_naira(p_rate_kobo) || ' and ' || p_days || ' days');
end;
$$;

create or replace function mkt_institution_create(p_name text, p_short text, p_kind text, p_city text, p_state text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_name text := btrim(coalesce(p_name, ''));
begin
  perform mkt_need_super();
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Give the institution name (3 to 120 letters)'; end if;
  if p_kind not in ('university', 'polytechnic', 'college_of_education', 'other') then raise exception 'Choose a type'; end if;
  if exists (select 1 from mkt_institutions where lower(name) = lower(v_name)) then raise exception 'That institution already exists'; end if;
  insert into mkt_institutions (name, short_name, kind, city, state, created_by)
  values (v_name, left(nullif(btrim(p_short), ''), 20), p_kind, left(nullif(btrim(p_city), ''), 60), left(nullif(btrim(p_state), ''), 60), auth.uid())
  returning id into v_id;
  insert into mkt_institution_roles (institution_id, role_key, slots, responsibilities)
  select v_id, key, default_slots, responsibilities from mkt_roles;
  perform mkt_audit('added institution', null, v_name);
  return v_id;
end;
$$;

create or replace function mkt_institution_update(p_id uuid, p_name text, p_short text, p_kind text, p_city text, p_state text, p_status text, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, ''));
begin
  perform mkt_need_super();
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Give the institution name (3 to 120 letters)'; end if;
  if p_kind not in ('university', 'polytechnic', 'college_of_education', 'other') then raise exception 'Choose a type'; end if;
  if p_status not in ('active', 'paused', 'closed') then raise exception 'Choose a status'; end if;
  if exists (select 1 from mkt_institutions where lower(name) = lower(v_name) and id <> p_id) then raise exception 'Another institution has that name'; end if;
  update mkt_institutions set name = v_name, short_name = left(nullif(btrim(p_short), ''), 20), kind = p_kind,
         city = left(nullif(btrim(p_city), ''), 60), state = left(nullif(btrim(p_state), ''), 60), status = p_status, notes = left(p_notes, 500)
  where id = p_id;
  if not found then raise exception 'Institution not found'; end if;
  perform mkt_audit('changed institution', null, v_name || ' (' || p_status || ')');
end;
$$;

create or replace function mkt_institution_list() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform mkt_need_staff();
  return (select coalesce(json_agg(x order by x.name), '[]'::json) from (
    select i.id, i.name, i.short_name, i.kind, i.city, i.state, i.status, i.notes,
      (select count(*)::int from mkt_members m where m.institution_id = i.id and m.status = 'active') as people,
      (select coalesce(sum(r.slots), 0)::int from mkt_institution_roles r where r.institution_id = i.id) as places,
      (select count(*)::int from mkt_campaigns c where c.institution_id = i.id and c.status = 'active') as active_campaigns
    from mkt_institutions i) x);
end;
$$;

create or replace function mkt_team_get(p_inst uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_staff boolean := mkt_staff();
begin
  if not mkt_can_view(p_inst) then raise exception 'Not allowed'; end if;
  return json_build_object(
    'institution', (select row_to_json(i) from (select id, name, short_name, kind, city, state, status from mkt_institutions where id = p_inst) i),
    'roles', (select coalesce(json_agg(x order by x.sort), '[]'::json) from (
        select r.role_key, d.title, d.sort, r.slots, coalesce(r.responsibilities, d.responsibilities) as responsibilities,
               (select count(*)::int from mkt_members m where m.institution_id = p_inst and m.role_key = r.role_key and m.status in ('active', 'suspended')) as filled
        from mkt_institution_roles r join mkt_roles d on d.key = r.role_key where r.institution_id = p_inst) x),
    'members', (select coalesce(json_agg(y order by y.sort, y.name), '[]'::json) from (
        select m.id, m.user_id, public.display_name(m.user_id) as name, m.role_key, d.title as role_title, d.sort, m.status, m.joined_at, m.note,
               exists (select 1 from mkt_assignments s join mkt_campaigns k on k.id = s.campaign_id where s.member_id = m.id and s.status = 'active' and k.status = 'active') as on_campaign,
               case when v_staff then (select u.email::text from auth.users u where u.id = m.user_id) else null end as email
        from mkt_members m join mkt_roles d on d.key = m.role_key
        where m.institution_id = p_inst and m.status in ('active', 'suspended')) y));
end;
$$;

create or replace function mkt_slots_set(p_inst uuid, p_role text, p_slots integer, p_resp text) returns void
language plpgsql security definer set search_path = public as $$
declare v_filled integer;
begin
  perform mkt_need_super();
  if p_slots is null or p_slots < 0 or p_slots > 100 then raise exception 'Places must be 0 to 100'; end if;
  select count(*)::int into v_filled from mkt_members where institution_id = p_inst and role_key = p_role and status in ('active', 'suspended');
  if p_slots < v_filled then raise exception 'There are already % people in this role. End or move some first.', v_filled; end if;
  insert into mkt_institution_roles (institution_id, role_key, slots, responsibilities)
  values (p_inst, p_role, p_slots, left(nullif(btrim(p_resp), ''), 600))
  on conflict (institution_id, role_key) do update set slots = excluded.slots, responsibilities = excluded.responsibilities;
  perform mkt_audit('changed team places', null, p_role || ' = ' || p_slots);
end;
$$;

create or replace function mkt_find_account(p_query text) returns json
language plpgsql security definer set search_path = public as $$
declare q text := btrim(coalesce(p_query, ''));
begin
  perform mkt_need_staff();
  if length(q) < 3 then return '[]'::json; end if;
  return (select coalesce(json_agg(x), '[]'::json) from (
    select pr.id, pr.full_name, u.email::text as email, pr.role, pr.institution,
           exists (select 1 from mkt_members m where m.user_id = pr.id and m.status in ('active', 'suspended')) as in_team
    from profiles pr join auth.users u on u.id = pr.id
    where pr.deleted_at is null and (pr.full_name ilike '%' || q || '%' or u.email ilike q || '%')
    order by pr.full_name limit 10) x);
end;
$$;

-- ============ People ============
create or replace function mkt_member_add(p_inst uuid, p_user uuid, p_role text, p_note text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_slots integer; v_filled integer; v_status text;
begin
  perform mkt_need_staff();
  select status into v_status from mkt_institutions where id = p_inst;
  if v_status is null then raise exception 'Institution not found'; end if;
  if v_status <> 'active' then raise exception 'This institution is not active'; end if;
  if not exists (select 1 from profiles where id = p_user and deleted_at is null and deactivated_at is null) then raise exception 'Account not found or not active'; end if;
  if exists (select 1 from mkt_members where user_id = p_user and status in ('active', 'suspended')) then raise exception 'This person is already in a marketing team. Use Transfer (Super Admin) to move them.'; end if;
  select slots into v_slots from mkt_institution_roles where institution_id = p_inst and role_key = p_role;
  if v_slots is null then raise exception 'Unknown role'; end if;
  select count(*)::int into v_filled from mkt_members where institution_id = p_inst and role_key = p_role and status in ('active', 'suspended');
  if v_filled >= v_slots then raise exception 'All places for this role are taken. The Super Admin can raise the number of places.'; end if;
  insert into mkt_members (institution_id, user_id, role_key, note, added_by) values (p_inst, p_user, p_role, left(p_note, 300), auth.uid()) returning id into v_id;
  perform mkt_audit('added team member', p_user, p_role || ' at ' || (select name from mkt_institutions where id = p_inst));
  begin
    perform notify(p_user, 'admin', 'You joined the LBN marketing team', 'Open My marketing to see your work.', 'marketing.html', auth.uid());
  exception when others then null;
  end;
  return v_id;
end;
$$;

create or replace function mkt_member_set_status(p_member uuid, p_status text, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare m mkt_members%rowtype;
begin
  perform mkt_need_staff();
  if p_status not in ('active', 'suspended', 'ended') then raise exception 'Choose a status'; end if;
  select * into m from mkt_members where id = p_member;
  if not found then raise exception 'Person not found'; end if;
  if m.status = 'ended' then raise exception 'This person has already left the team'; end if;
  update mkt_members set status = p_status, note = left(coalesce(p_note, note), 300),
         ended_at = case when p_status = 'ended' then now() else null end
  where id = p_member;
  if p_status = 'ended' then
    update mkt_assignments a set status = 'removed' from mkt_campaigns c
     where a.member_id = p_member and a.campaign_id = c.id and c.status in ('draft', 'active');
  end if;
  perform mkt_audit('team member ' || p_status, m.user_id, coalesce(p_note, ''));
end;
$$;

create or replace function mkt_member_change_role(p_member uuid, p_role text) returns void
language plpgsql security definer set search_path = public as $$
declare m mkt_members%rowtype; v_slots integer; v_filled integer;
begin
  perform mkt_need_staff();
  select * into m from mkt_members where id = p_member and status in ('active', 'suspended');
  if not found then raise exception 'Person not found'; end if;
  select slots into v_slots from mkt_institution_roles where institution_id = m.institution_id and role_key = p_role;
  if v_slots is null then raise exception 'Unknown role'; end if;
  select count(*)::int into v_filled from mkt_members where institution_id = m.institution_id and role_key = p_role and status in ('active', 'suspended');
  if v_filled >= v_slots then raise exception 'All places for that role are taken'; end if;
  update mkt_members set role_key = p_role where id = p_member;
  perform mkt_audit('changed team role', m.user_id, m.role_key || ' to ' || p_role);
end;
$$;

create or replace function mkt_member_transfer(p_member uuid, p_to uuid, p_role text, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m mkt_members%rowtype; v_slots integer; v_filled integer; v_new uuid;
begin
  perform mkt_need_super();
  select * into m from mkt_members where id = p_member and status in ('active', 'suspended');
  if not found then raise exception 'Person not found'; end if;
  if m.institution_id = p_to then raise exception 'They are already at that institution'; end if;
  if not exists (select 1 from mkt_institutions where id = p_to and status = 'active') then raise exception 'The new institution must be active'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Write the reason for the transfer'; end if;
  select slots into v_slots from mkt_institution_roles where institution_id = p_to and role_key = p_role;
  if v_slots is null then raise exception 'Unknown role'; end if;
  select count(*)::int into v_filled from mkt_members where institution_id = p_to and role_key = p_role and status in ('active', 'suspended');
  if v_filled >= v_slots then raise exception 'All places for that role at the new institution are taken'; end if;

  update mkt_members set status = 'ended', ended_at = now(), note = left('Transferred: ' || p_reason, 300) where id = p_member;
  update mkt_assignments a set status = 'removed' from mkt_campaigns c
   where a.member_id = p_member and a.campaign_id = c.id and c.status in ('draft', 'active');
  insert into mkt_members (institution_id, user_id, role_key, note, added_by) values (p_to, m.user_id, p_role, left('Transferred in: ' || p_reason, 300), auth.uid()) returning id into v_new;
  insert into mkt_transfers (user_id, from_institution, to_institution, from_role, to_role, reason, moved_by)
  values (m.user_id, m.institution_id, p_to, m.role_key, p_role, left(p_reason, 300), auth.uid());
  perform mkt_audit('transferred promoter', m.user_id, (select name from mkt_institutions where id = m.institution_id) || ' to ' || (select name from mkt_institutions where id = p_to));
  return v_new;
end;
$$;

create or replace function mkt_transfers_list() returns json
language plpgsql security definer set search_path = public as $$
begin
  perform mkt_need_staff();
  return (select coalesce(json_agg(x order by x.moved_at desc), '[]'::json) from (
    select t.moved_at, public.display_name(t.user_id) as name,
           (select name from mkt_institutions where id = t.from_institution) as from_name,
           (select name from mkt_institutions where id = t.to_institution) as to_name,
           t.from_role, t.to_role, t.reason
    from mkt_transfers t order by t.moved_at desc limit 100) x);
end;
$$;

-- ============ Campaigns ============
create or replace function mkt_campaign_save(
  p_id uuid, p_inst uuid, p_name text, p_instructions text, p_start date, p_end date, p_basis text, p_rate_kobo bigint,
  p_wdw integer, p_wdm integer, p_t_students integer, p_t_verified integer, p_t_business integer, p_t_active integer,
  p_bonus_kobo bigint, p_bonus_threshold integer) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_name text := btrim(coalesce(p_name, '')); v_id uuid; c mkt_campaigns%rowtype; v_paid boolean;
begin
  perform mkt_need_staff();
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Give the campaign a name (3 to 120 letters)'; end if;
  if p_start is null or p_end is null or p_end < p_start then raise exception 'The end date must be on or after the start date'; end if;
  if p_end - p_start > 365 then raise exception 'A campaign can be at most 366 days'; end if;
  if p_basis not in ('daily', 'weekly', 'monthly') then raise exception 'Choose daily, weekly or monthly pay'; end if;
  if p_rate_kobo is null or p_rate_kobo < 0 or p_rate_kobo > 100000000 then raise exception 'The pay amount looks wrong'; end if;
  if coalesce(p_bonus_kobo, 0) < 0 or coalesce(p_bonus_kobo, 0) > 100000000 then raise exception 'The bonus amount looks wrong'; end if;
  if coalesce(p_wdw, 5) not between 1 and 7 or coalesce(p_wdm, 22) not between 1 and 31 then raise exception 'Working days look wrong'; end if;
  if least(coalesce(p_t_students, 0), coalesce(p_t_verified, 0), coalesce(p_t_business, 0), coalesce(p_t_active, 0), coalesce(p_bonus_threshold, 0)) < 0 then raise exception 'Targets cannot be negative'; end if;

  if p_id is null then
    if not exists (select 1 from mkt_institutions where id = p_inst and status = 'active') then raise exception 'Choose an active institution'; end if;
    insert into mkt_campaigns (institution_id, name, instructions, start_date, end_date, pay_basis, rate_kobo, work_days_per_week, work_days_per_month,
        target_student_regs, target_verified, target_business_regs, target_active_members, bonus_per_verified_kobo, bonus_threshold, created_by)
    values (p_inst, v_name, left(p_instructions, 4000), p_start, p_end, p_basis, p_rate_kobo, coalesce(p_wdw, 5), coalesce(p_wdm, 22),
        coalesce(p_t_students, 0), coalesce(p_t_verified, 0), coalesce(p_t_business, 0), coalesce(p_t_active, 0), coalesce(p_bonus_kobo, 0), coalesce(p_bonus_threshold, 0), auth.uid())
    returning id into v_id;
    perform mkt_audit('created campaign', null, v_name);
    return v_id;
  end if;

  select * into c from mkt_campaigns where id = p_id;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status in ('completed', 'cancelled') then raise exception 'A finished campaign cannot be changed'; end if;
  select exists (select 1 from mkt_pay where campaign_id = p_id) into v_paid;
  if v_paid and (p_basis <> c.pay_basis or p_rate_kobo <> c.rate_kobo or coalesce(p_wdw, 5) <> c.work_days_per_week or coalesce(p_wdm, 22) <> c.work_days_per_month
                 or coalesce(p_bonus_kobo, 0) <> c.bonus_per_verified_kobo or coalesce(p_bonus_threshold, 0) <> c.bonus_threshold
                 or p_start <> c.start_date or p_end <> c.end_date) then
    raise exception 'Pay records already exist, so dates and pay rules are locked';
  end if;
  update mkt_campaigns set name = v_name, instructions = left(p_instructions, 4000), start_date = p_start, end_date = p_end, pay_basis = p_basis,
         rate_kobo = p_rate_kobo, work_days_per_week = coalesce(p_wdw, 5), work_days_per_month = coalesce(p_wdm, 22),
         target_student_regs = coalesce(p_t_students, 0), target_verified = coalesce(p_t_verified, 0),
         target_business_regs = coalesce(p_t_business, 0), target_active_members = coalesce(p_t_active, 0),
         bonus_per_verified_kobo = coalesce(p_bonus_kobo, 0), bonus_threshold = coalesce(p_bonus_threshold, 0)
  where id = p_id;
  perform mkt_audit('changed campaign', null, v_name);
  return p_id;
end;
$$;

create or replace function mkt_campaign_set_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype;
begin
  perform mkt_need_staff();
  select * into c from mkt_campaigns where id = p_id;
  if not found then raise exception 'Campaign not found'; end if;
  if p_status = 'active' then
    if c.status <> 'draft' then raise exception 'Only a draft campaign can be started'; end if;
    if not exists (select 1 from mkt_assignments where campaign_id = p_id and status = 'active') then raise exception 'Assign at least one person first'; end if;
  elsif p_status = 'completed' then
    if c.status <> 'active' then raise exception 'Only a running campaign can be completed'; end if;
  elsif p_status = 'cancelled' then
    if c.status not in ('draft', 'active') then raise exception 'This campaign is already finished'; end if;
    if exists (select 1 from mkt_pay where campaign_id = p_id and status in ('approved', 'paid')) then raise exception 'Money was already approved or paid. Complete the campaign instead.'; end if;
  else
    raise exception 'Unknown status';
  end if;
  update mkt_campaigns set status = p_status, closed_at = case when p_status in ('completed', 'cancelled') then now() else null end where id = p_id;
  perform mkt_audit('campaign ' || p_status, null, c.name);
end;
$$;

create or replace function mkt_campaign_list(p_inst uuid default null) returns json
language plpgsql security definer set search_path = public as $$
declare v_inst uuid := p_inst;
begin
  if not mkt_staff() then
    if v_inst is null then
      select institution_id into v_inst from mkt_members where user_id = auth.uid() and role_key = 'coordinator' and status = 'active' limit 1;
    end if;
    if v_inst is null or not mkt_coord_of(v_inst) then raise exception 'Not allowed'; end if;
  end if;
  return (select coalesce(json_agg(x order by x.start_date desc), '[]'::json) from (
    select c.id, c.institution_id, i.name as institution, c.name, c.start_date, c.end_date, c.status, c.pay_basis,
           c.target_student_regs, c.target_verified, c.target_business_regs, c.target_active_members,
           (select count(*)::int from mkt_assignments a where a.campaign_id = c.id and a.status = 'active') as people,
           coalesce((select sum(r.student_regs) from mkt_assignments a cross join lateral mkt_member_results(c.id, a.member_id) r where a.campaign_id = c.id and a.status = 'active'), 0)::int as student_regs,
           coalesce((select sum(r.business_regs) from mkt_assignments a cross join lateral mkt_member_results(c.id, a.member_id) r where a.campaign_id = c.id and a.status = 'active'), 0)::int as business_regs,
           coalesce((select sum(r.verified) from mkt_assignments a cross join lateral mkt_member_results(c.id, a.member_id) r where a.campaign_id = c.id and a.status = 'active'), 0)::int as verified,
           coalesce((select sum(r.active_members) from mkt_assignments a cross join lateral mkt_member_results(c.id, a.member_id) r where a.campaign_id = c.id and a.status = 'active'), 0)::int as active_members
    from mkt_campaigns c join mkt_institutions i on i.id = c.institution_id
    where (v_inst is null or c.institution_id = v_inst)) x);
end;
$$;

create or replace function mkt_campaign_get(p_id uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype; v_money boolean;
begin
  select * into c from mkt_campaigns where id = p_id;
  if not found then raise exception 'Campaign not found'; end if;
  if not mkt_can_view(c.institution_id) then raise exception 'Not allowed'; end if;
  v_money := mkt_staff() or admin_can('finance');
  return json_build_object(
    'campaign', (select row_to_json(x) from (
        select c.id, c.institution_id, (select name from mkt_institutions where id = c.institution_id) as institution, c.name, c.instructions, c.start_date, c.end_date, c.status,
               c.pay_basis, case when v_money then c.rate_kobo else null end as rate_kobo, c.work_days_per_week, c.work_days_per_month,
               c.target_student_regs, c.target_verified, c.target_business_regs, c.target_active_members,
               case when v_money then c.bonus_per_verified_kobo else null end as bonus_per_verified_kobo, c.bonus_threshold) x),
    'people', (select coalesce(json_agg(y order by y.sort, y.name), '[]'::json) from (
        select a.id as assignment_id, a.member_id, public.display_name(m.user_id) as name, m.role_key, d.title as role_title, d.sort, a.status,
               case when v_money then a.rate_kobo else null end as rate_kobo,
               (select count(*)::int from mkt_attendance t where t.campaign_id = c.id and t.member_id = a.member_id and t.status = 'present') as days_present,
               (select count(*)::int from mkt_activity z where z.campaign_id = c.id and z.member_id = a.member_id and z.status = 'approved') as reports_approved,
               (select count(*)::int from mkt_activity z where z.campaign_id = c.id and z.member_id = a.member_id and z.status = 'submitted') as reports_waiting,
               r.student_regs, r.business_regs, r.verified, r.active_members
        from mkt_assignments a
        join mkt_members m on m.id = a.member_id join mkt_roles d on d.key = m.role_key
        cross join lateral mkt_member_results(c.id, a.member_id) r
        where a.campaign_id = c.id) y),
    'money', case when v_money then (select json_build_object(
        'prepared_kobo', coalesce(sum(total_kobo) filter (where status = 'prepared'), 0),
        'approved_kobo', coalesce(sum(total_kobo) filter (where status = 'approved'), 0),
        'paid_kobo', coalesce(sum(total_kobo) filter (where status = 'paid'), 0),
        'withheld_kobo', coalesce(sum(total_kobo) filter (where status = 'withheld'), 0)) from mkt_pay where campaign_id = c.id) else null end);
end;
$$;

create or replace function mkt_assign(p_campaign uuid, p_member uuid, p_rate_kobo bigint default null) returns void
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype; m mkt_members%rowtype;
begin
  perform mkt_need_staff();
  select * into c from mkt_campaigns where id = p_campaign;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status not in ('draft', 'active') then raise exception 'This campaign is finished'; end if;
  select * into m from mkt_members where id = p_member;
  if not found or m.status <> 'active' then raise exception 'That person is not an active team member'; end if;
  if m.institution_id <> c.institution_id then raise exception 'That person belongs to another institution'; end if;
  if p_rate_kobo is not null and (p_rate_kobo < 0 or p_rate_kobo > 100000000) then raise exception 'The pay amount looks wrong'; end if;
  if exists (select 1 from mkt_assignments a join mkt_campaigns o on o.id = a.campaign_id
             where a.member_id = p_member and a.status = 'active' and o.id <> p_campaign and o.status in ('draft', 'active')
               and o.start_date <= c.end_date and o.end_date >= c.start_date) then
    raise exception 'That person is already in another campaign on those dates';
  end if;
  insert into mkt_assignments (campaign_id, member_id, rate_kobo, assigned_by) values (p_campaign, p_member, p_rate_kobo, auth.uid())
  on conflict (campaign_id, member_id) do update set status = 'active', rate_kobo = excluded.rate_kobo, assigned_by = auth.uid();
  perform mkt_audit('assigned to campaign', m.user_id, c.name);
  begin
    perform notify(m.user_id, 'admin', 'New marketing campaign', 'You were assigned to: ' || c.name, 'marketing.html', auth.uid());
  exception when others then null;
  end;
end;
$$;

create or replace function mkt_unassign(p_campaign uuid, p_member uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_user uuid; v_name text;
begin
  perform mkt_need_staff();
  update mkt_assignments set status = 'removed' where campaign_id = p_campaign and member_id = p_member;
  if not found then raise exception 'Assignment not found'; end if;
  select user_id into v_user from mkt_members where id = p_member;
  select name into v_name from mkt_campaigns where id = p_campaign;
  perform mkt_audit('removed from campaign', v_user, v_name);
end;
$$;

-- ============ Attendance and daily activity ============
create or replace function mkt_attendance_mark(p_campaign uuid, p_member uuid, p_day date, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype; m mkt_members%rowtype; v_staff boolean := mkt_staff();
begin
  select * into c from mkt_campaigns where id = p_campaign;
  if not found then raise exception 'Campaign not found'; end if;
  if not mkt_can_view(c.institution_id) then raise exception 'Not allowed'; end if;
  if p_status not in ('present', 'absent', 'excused') then raise exception 'Choose present, absent or excused'; end if;
  select * into m from mkt_members where id = p_member;
  if not found then raise exception 'Person not found'; end if;
  if not v_staff and m.user_id = auth.uid() then raise exception 'You cannot mark your own attendance'; end if;
  if c.status not in ('active', 'completed') then raise exception 'The campaign has not started'; end if;
  if c.status = 'completed' and not v_staff then raise exception 'The campaign is finished'; end if;
  if not exists (select 1 from mkt_assignments where campaign_id = p_campaign and member_id = p_member and status = 'active') then raise exception 'That person is not assigned to this campaign'; end if;
  if p_day is null or p_day < c.start_date or p_day > c.end_date then raise exception 'That day is outside the campaign dates'; end if;
  if p_day > mkt_today() then raise exception 'You cannot mark a future day'; end if;
  if not v_staff and p_day < mkt_today() - 7 then raise exception 'Coordinators can only change the last 7 days. Ask the marketing office.'; end if;
  if exists (select 1 from mkt_pay where campaign_id = p_campaign and member_id = p_member and status in ('approved', 'paid') and p_day between period_start and period_end) then
    raise exception 'That day is already in an approved or paid period';
  end if;
  insert into mkt_attendance (campaign_id, member_id, day, status, marked_by) values (p_campaign, p_member, p_day, p_status, auth.uid())
  on conflict (campaign_id, member_id, day) do update set status = excluded.status, marked_by = auth.uid(), marked_at = now();
  perform mkt_audit('attendance', m.user_id, c.name || ' ' || p_day || ' ' || p_status);
end;
$$;

create or replace function mkt_attendance_list(p_campaign uuid, p_day date) returns json
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype;
begin
  select * into c from mkt_campaigns where id = p_campaign;
  if not found then raise exception 'Campaign not found'; end if;
  if not mkt_can_view(c.institution_id) then raise exception 'Not allowed'; end if;
  return (select coalesce(json_agg(x order by x.sort, x.name), '[]'::json) from (
    select a.member_id, public.display_name(m.user_id) as name, d.title as role_title, d.sort,
           (select t.status from mkt_attendance t where t.campaign_id = p_campaign and t.member_id = a.member_id and t.day = p_day) as status,
           (select count(*)::int from mkt_activity z where z.campaign_id = p_campaign and z.member_id = a.member_id and z.day = p_day and z.status <> 'rejected') as reports
    from mkt_assignments a join mkt_members m on m.id = a.member_id join mkt_roles d on d.key = m.role_key
    where a.campaign_id = p_campaign and a.status = 'active') x);
end;
$$;

create or replace function mkt_activity_list(p_campaign uuid, p_status text default null) returns json
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype;
begin
  select * into c from mkt_campaigns where id = p_campaign;
  if not found then raise exception 'Campaign not found'; end if;
  if not mkt_can_view(c.institution_id) then raise exception 'Not allowed'; end if;
  return (select coalesce(json_agg(x order by x.day desc, x.created_at desc), '[]'::json) from (
    select z.id, z.day, z.kind, z.summary, z.contacts, z.student_regs_claimed, z.business_regs_claimed, z.evidence_note, z.status, z.review_note, z.created_at,
           z.member_id, public.display_name(m.user_id) as name
    from mkt_activity z join mkt_members m on m.id = z.member_id
    where z.campaign_id = p_campaign and (p_status is null or z.status = p_status)
    order by z.day desc, z.created_at desc limit 300) x);
end;
$$;

create or replace function mkt_activity_review(p_id uuid, p_approve boolean, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare z mkt_activity%rowtype; c mkt_campaigns%rowtype; m mkt_members%rowtype;
begin
  select * into z from mkt_activity where id = p_id;
  if not found then raise exception 'Report not found'; end if;
  select * into c from mkt_campaigns where id = z.campaign_id;
  select * into m from mkt_members where id = z.member_id;
  if not mkt_can_view(c.institution_id) then raise exception 'Not allowed'; end if;
  if m.user_id = auth.uid() then raise exception 'You cannot review your own report'; end if;
  if z.status <> 'submitted' then raise exception 'This report was already reviewed'; end if;
  if not p_approve and length(btrim(coalesce(p_note, ''))) < 3 then raise exception 'Say why the report is rejected'; end if;
  update mkt_activity set status = case when p_approve then 'approved' else 'rejected' end, review_note = left(p_note, 300), reviewed_by = auth.uid(), reviewed_at = now() where id = p_id;
  perform mkt_audit('report ' || case when p_approve then 'approved' else 'rejected' end, m.user_id, c.name || ' ' || z.day);
end;
$$;

-- ============ Pay (all amounts come from the database) ============
create or replace function mkt_pay_prepare(p_campaign uuid, p_from date, p_to date) returns json
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype; a record; k record; v_new integer := 0; v_upd integer := 0; v_skip integer := 0; v_ex mkt_pay%rowtype;
begin
  perform mkt_need_staff();
  select * into c from mkt_campaigns where id = p_campaign;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status not in ('active', 'completed') then raise exception 'The campaign has not started'; end if;
  if p_from is null or p_to is null or p_to < p_from then raise exception 'Check the dates'; end if;
  if p_from < c.start_date or p_to > c.end_date then raise exception 'Dates must be inside the campaign'; end if;
  if p_to > mkt_today() then raise exception 'You cannot pay for days that have not happened'; end if;

  for a in select member_id from mkt_assignments where campaign_id = p_campaign and status = 'active' loop
    select * into k from mkt_pay_calc(p_campaign, a.member_id, p_from, p_to);
    select * into v_ex from mkt_pay where campaign_id = p_campaign and member_id = a.member_id and period_start = p_from and period_end = p_to;
    if found then
      if v_ex.status = 'prepared' then
        update mkt_pay set days_present = k.days, base_kobo = k.base, bonus_kobo = k.bonus, total_kobo = k.base + k.bonus + manual_bonus_kobo where id = v_ex.id;
        v_upd := v_upd + 1;
      else
        v_skip := v_skip + 1;
      end if;
    elsif exists (select 1 from mkt_pay where campaign_id = p_campaign and member_id = a.member_id and status <> 'withheld'
                  and period_start <= p_to and period_end >= p_from) then
      v_skip := v_skip + 1;
    elsif k.days = 0 and k.bonus = 0 then
      v_skip := v_skip + 1;
    else
      insert into mkt_pay (campaign_id, member_id, period_start, period_end, days_present, base_kobo, bonus_kobo, total_kobo, prepared_by)
      values (p_campaign, a.member_id, p_from, p_to, k.days, k.base, k.bonus, k.base + k.bonus, auth.uid());
      v_new := v_new + 1;
    end if;
  end loop;
  perform mkt_audit('prepared pay', null, c.name || ' ' || p_from || ' to ' || p_to || ': ' || v_new || ' new, ' || v_upd || ' updated');
  return json_build_object('created', v_new, 'updated', v_upd, 'skipped', v_skip);
end;
$$;

create or replace function mkt_pay_list(p_campaign uuid) returns json
language plpgsql security definer set search_path = public as $$
declare v_fin boolean := admin_can('finance');
begin
  if not (mkt_staff() or v_fin) then raise exception 'Not allowed'; end if;
  return (select coalesce(json_agg(x order by x.name, x.period_start), '[]'::json) from (
    select p.id, p.member_id, public.display_name(m.user_id) as name, d.title as role_title, p.period_start, p.period_end, p.days_present,
           p.base_kobo, p.bonus_kobo, p.manual_bonus_kobo, p.manual_bonus_reason, p.total_kobo, p.status,
           public.display_name(p.prepared_by) as prepared_by_name, public.display_name(p.approved_by) as approved_by_name, p.approved_at, p.paid_at, p.payment_reference, p.withheld_reason,
           case when v_fin then b.bank_name else null end as bank_name,
           case when v_fin then b.account_number else null end as account_number,
           case when v_fin then b.account_name else null end as account_name
    from mkt_pay p join mkt_members m on m.id = p.member_id join mkt_roles d on d.key = m.role_key
    left join mkt_bank b on b.user_id = m.user_id
    where p.campaign_id = p_campaign) x);
end;
$$;

create or replace function mkt_pay_bonus(p_id uuid, p_amount_kobo bigint, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p mkt_pay%rowtype; m mkt_members%rowtype;
begin
  perform mkt_need_staff();
  select * into p from mkt_pay where id = p_id;
  if not found then raise exception 'Pay record not found'; end if;
  if p.status <> 'prepared' then raise exception 'Only a record that is not yet approved can be changed'; end if;
  if p_amount_kobo is null or p_amount_kobo < 0 or p_amount_kobo > greatest(p.base_kobo, 100000) * 1 then raise exception 'A manual bonus cannot be more than the base pay for the period'; end if;
  if p_amount_kobo > 0 and length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Write the reason for the bonus'; end if;
  update mkt_pay set manual_bonus_kobo = p_amount_kobo, manual_bonus_reason = left(p_reason, 200), total_kobo = base_kobo + bonus_kobo + p_amount_kobo, prepared_by = auth.uid() where id = p_id;
  select * into m from mkt_members where id = p.member_id;
  perform mkt_audit('manual bonus', m.user_id, mkt_naira(p_amount_kobo) || ': ' || coalesce(p_reason, ''));
end;
$$;

create or replace function mkt_pay_approve(p_ids uuid[]) returns integer
language plpgsql security definer set search_path = public as $$
declare p mkt_pay%rowtype; v_n integer := 0; v_total bigint := 0; v_id uuid;
begin
  if auth.uid() is null or not (is_super_admin() or admin_can('finance')) then raise exception 'Only Finance or the Super Admin can approve pay'; end if;
  if not admin_mfa_ok() then raise exception 'Confirm your 2-step login first'; end if;
  if p_ids is null or cardinality(p_ids) = 0 then raise exception 'Choose at least one record'; end if;
  foreach v_id in array p_ids loop
    select * into p from mkt_pay where id = v_id for update;
    if not found or p.status <> 'prepared' then continue; end if;
    if p.total_kobo <= 0 then continue; end if;
    if p.prepared_by = auth.uid() and not is_super_admin() then raise exception 'Someone else prepared this. A different person must approve it.'; end if;
    update mkt_pay set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = v_id;
    v_n := v_n + 1; v_total := v_total + p.total_kobo;
  end loop;
  if v_n > 0 then
    perform mkt_audit('approved pay', null, v_n || ' records, ' || mkt_naira(v_total));
    begin perform sec_log_event('marketing_pay', 'info', 'Marketing pay approved: ' || mkt_naira(v_total), v_n || ' records'); exception when others then null; end;
  end if;
  return v_n;
end;
$$;

create or replace function mkt_pay_mark_paid(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare p mkt_pay%rowtype; m mkt_members%rowtype;
begin
  if auth.uid() is null or not (is_super_admin() or admin_can('finance')) then raise exception 'Only Finance or the Super Admin can mark pay as paid'; end if;
  if not admin_mfa_ok() then raise exception 'Confirm your 2-step login first'; end if;
  if length(btrim(coalesce(p_reference, ''))) < 3 then raise exception 'Write the transfer reference'; end if;
  select * into p from mkt_pay where id = p_id for update;
  if not found then raise exception 'Pay record not found'; end if;
  if p.status <> 'approved' then raise exception 'Only approved pay can be marked paid'; end if;
  update mkt_pay set status = 'paid', paid_by = auth.uid(), paid_at = now(), payment_reference = left(btrim(p_reference), 80) where id = p_id;
  select * into m from mkt_members where id = p.member_id;
  perform mkt_audit('paid', m.user_id, mkt_naira(p.total_kobo) || ' ref ' || left(btrim(p_reference), 80));
  begin perform sec_log_event('marketing_pay', 'info', 'Marketing pay paid: ' || mkt_naira(p.total_kobo), 'ref ' || left(btrim(p_reference), 40)); exception when others then null; end;
  begin perform notify(m.user_id, 'admin', 'Marketing pay sent', 'Your marketing pay of ' || mkt_naira(p.total_kobo) || ' was marked as paid.', 'marketing.html', auth.uid()); exception when others then null; end;
end;
$$;

create or replace function mkt_pay_withhold(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare p mkt_pay%rowtype; m mkt_members%rowtype;
begin
  if auth.uid() is null or not (is_super_admin() or admin_can('finance')) then raise exception 'Only Finance or the Super Admin can withhold pay'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Write the reason'; end if;
  select * into p from mkt_pay where id = p_id for update;
  if not found or p.status not in ('prepared', 'approved') then raise exception 'Only pay that is not yet paid can be withheld'; end if;
  update mkt_pay set status = 'withheld', withheld_reason = left(p_reason, 200) where id = p_id;
  select * into m from mkt_members where id = p.member_id;
  perform mkt_audit('withheld pay', m.user_id, left(p_reason, 200));
end;
$$;

create or replace function mkt_pay_release(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare p mkt_pay%rowtype; m mkt_members%rowtype;
begin
  if auth.uid() is null or not (is_super_admin() or admin_can('finance')) then raise exception 'Only Finance or the Super Admin can release pay'; end if;
  select * into p from mkt_pay where id = p_id for update;
  if not found or p.status <> 'withheld' then raise exception 'This pay is not withheld'; end if;
  update mkt_pay set status = 'prepared', withheld_reason = null, prepared_by = auth.uid() where id = p_id;
  select * into m from mkt_members where id = p.member_id;
  perform mkt_audit('released pay', m.user_id, mkt_naira(p.total_kobo));
end;
$$;

-- ============ Central dashboard ============
create or replace function mkt_dashboard() returns json
language plpgsql security definer set search_path = public as $$
declare v_res json;
begin
  perform mkt_need_staff();
  with a as (
    select c.institution_id, c.id as cid, s.member_id
    from mkt_campaigns c join mkt_assignments s on s.campaign_id = c.id
    where c.status in ('active', 'completed') and s.status = 'active'),
  res as (
    select a.institution_id, r.student_regs, r.business_regs, r.verified, r.active_members
    from a cross join lateral mkt_member_results(a.cid, a.member_id) r),
  per as (
    select i.id, i.name, i.status,
      (select count(*)::int from mkt_members m where m.institution_id = i.id and m.status = 'active') as promoters,
      (select count(*)::int from mkt_campaigns c where c.institution_id = i.id and c.status = 'active') as campaigns_active,
      (select count(*)::int from mkt_campaigns c where c.institution_id = i.id and c.status = 'completed') as campaigns_done,
      coalesce((select sum(student_regs) from res where res.institution_id = i.id), 0)::int as student_regs,
      coalesce((select sum(business_regs) from res where res.institution_id = i.id), 0)::int as business_regs,
      coalesce((select sum(verified) from res where res.institution_id = i.id), 0)::int as verified,
      coalesce((select sum(active_members) from res where res.institution_id = i.id), 0)::int as active_members,
      coalesce((select sum(p.total_kobo) from mkt_pay p join mkt_campaigns c on c.id = p.campaign_id where c.institution_id = i.id and p.status in ('prepared', 'approved', 'paid')), 0)::bigint as spend_kobo
    from mkt_institutions i)
  select json_build_object(
    'institutions', (select count(*)::int from mkt_institutions where status = 'active'),
    'promoters', (select count(*)::int from mkt_members where status = 'active'),
    'campaigns_active', (select count(*)::int from mkt_campaigns where status = 'active'),
    'campaigns_completed', (select count(*)::int from mkt_campaigns where status = 'completed'),
    'spend_paid_kobo', (select coalesce(sum(total_kobo), 0) from mkt_pay where status = 'paid'),
    'spend_approved_kobo', (select coalesce(sum(total_kobo), 0) from mkt_pay where status = 'approved'),
    'spend_prepared_kobo', (select coalesce(sum(total_kobo), 0) from mkt_pay where status = 'prepared'),
    'student_regs', (select coalesce(sum(student_regs), 0) from res),
    'business_regs', (select coalesce(sum(business_regs), 0) from res),
    'verified', (select coalesce(sum(verified), 0) from res),
    'active_members', (select coalesce(sum(active_members), 0) from res),
    'by_institution', (select coalesce(json_agg(per order by per.name), '[]'::json) from per))
  into v_res;
  return v_res;
end;
$$;

-- ============ For coordinators and promoters (own data only) ============
create or replace function mkt_my_context() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  return json_build_object(
    'is_staff', mkt_staff(),
    'places', (select coalesce(json_agg(x), '[]'::json) from (
      select m.id as member_id, m.institution_id, i.name as institution, m.role_key, d.title as role_title, m.status, (m.role_key = 'coordinator') as is_coordinator
      from mkt_members m join mkt_institutions i on i.id = m.institution_id join mkt_roles d on d.key = m.role_key
      where m.user_id = auth.uid() and m.status in ('active', 'suspended')) x));
end;
$$;

create or replace function mkt_my_work() returns json
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  begin v_code := my_referral_code(); exception when others then v_code := null; end;
  return json_build_object(
    'referral_code', v_code,
    'campaigns', (select coalesce(json_agg(x order by x.start_date desc), '[]'::json) from (
      select c.id as campaign_id, c.name, c.instructions, c.start_date, c.end_date, c.status, c.pay_basis,
             c.target_student_regs, c.target_verified, c.target_business_regs, c.target_active_members,
             m.id as member_id, d.title as role_title,
             coalesce(a.rate_kobo, c.rate_kobo) as my_rate_kobo,
             (select count(*)::int from mkt_attendance t where t.campaign_id = c.id and t.member_id = m.id and t.status = 'present') as days_present,
             (select count(*)::int from mkt_activity z where z.campaign_id = c.id and z.member_id = m.id and z.status = 'approved') as reports_approved,
             (select count(*)::int from mkt_activity z where z.campaign_id = c.id and z.member_id = m.id and z.status = 'submitted') as reports_waiting,
             r.student_regs, r.business_regs, r.verified, r.active_members,
             (select e.base + e.bonus from mkt_pay_calc(c.id, m.id, c.start_date, least(c.end_date, mkt_today())) e) as earned_so_far_kobo
      from mkt_members m
      join mkt_assignments a on a.member_id = m.id and a.status = 'active'
      join mkt_campaigns c on c.id = a.campaign_id and c.status in ('active', 'completed')
      join mkt_roles d on d.key = m.role_key
      cross join lateral mkt_member_results(c.id, m.id) r
      where m.user_id = auth.uid() and m.status = 'active') x),
    'pay', (select coalesce(json_agg(y order by y.period_start desc), '[]'::json) from (
      select p.id, c.name as campaign, p.period_start, p.period_end, p.days_present, p.base_kobo, p.bonus_kobo, p.manual_bonus_kobo, p.total_kobo, p.status, p.paid_at, p.payment_reference
      from mkt_pay p join mkt_members m on m.id = p.member_id join mkt_campaigns c on c.id = p.campaign_id
      where m.user_id = auth.uid()) y));
end;
$$;

create or replace function mkt_my_activity_submit(p_campaign uuid, p_day date, p_kind text, p_summary text, p_contacts integer, p_students integer, p_business integer, p_evidence text) returns uuid
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype; m mkt_members%rowtype; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  select * into m from mkt_members where user_id = auth.uid() and status = 'active';
  if not found then raise exception 'You are not on an active marketing team'; end if;
  select * into c from mkt_campaigns where id = p_campaign;
  if not found or c.institution_id <> m.institution_id then raise exception 'Campaign not found'; end if;
  if c.status <> 'active' then raise exception 'This campaign is not running'; end if;
  if not exists (select 1 from mkt_assignments where campaign_id = p_campaign and member_id = m.id and status = 'active') then raise exception 'You are not assigned to this campaign'; end if;
  if p_day is null or p_day < c.start_date or p_day > c.end_date then raise exception 'That day is outside the campaign dates'; end if;
  if p_day > mkt_today() or p_day < mkt_today() - 3 then raise exception 'You can report today or the last 3 days only'; end if;
  if p_kind not in ('outreach', 'registration_drive', 'business_visit', 'event', 'digital_post', 'other') then raise exception 'Choose the type of work'; end if;
  if length(btrim(coalesce(p_summary, ''))) < 10 or length(p_summary) > 1000 then raise exception 'Describe what you did (10 to 1000 letters)'; end if;
  if (select count(*) from mkt_activity where campaign_id = p_campaign and member_id = m.id and day = p_day) >= 5 then raise exception 'You already sent 5 reports for that day'; end if;
  insert into mkt_activity (campaign_id, member_id, day, kind, summary, contacts, student_regs_claimed, business_regs_claimed, evidence_note)
  values (p_campaign, m.id, p_day, p_kind, btrim(p_summary), least(greatest(coalesce(p_contacts, 0), 0), 5000), least(greatest(coalesce(p_students, 0), 0), 2000),
          least(greatest(coalesce(p_business, 0), 0), 2000), left(p_evidence, 300))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function mkt_my_activity_list(p_campaign uuid) returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  return (select coalesce(json_agg(x order by x.day desc, x.created_at desc), '[]'::json) from (
    select z.id, z.day, z.kind, z.summary, z.contacts, z.student_regs_claimed, z.business_regs_claimed, z.status, z.review_note, z.created_at
    from mkt_activity z join mkt_members m on m.id = z.member_id
    where m.user_id = auth.uid() and z.campaign_id = p_campaign order by z.day desc, z.created_at desc limit 100) x);
end;
$$;

create or replace function mkt_my_bank_get() returns json
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  return (select row_to_json(b) from (select bank_name, account_number, account_name from mkt_bank where user_id = auth.uid()) b);
end;
$$;

create or replace function mkt_my_bank_set(p_bank text, p_number text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Please log in'; end if;
  if not exists (select 1 from mkt_members where user_id = auth.uid() and status in ('active', 'suspended')) then raise exception 'You are not on a marketing team'; end if;
  if length(btrim(coalesce(p_bank, ''))) < 2 or length(btrim(coalesce(p_name, ''))) < 3 then raise exception 'Fill in the bank and the account name'; end if;
  if btrim(coalesce(p_number, '')) !~ '^[0-9]{10}$' then raise exception 'The account number must be 10 digits'; end if;
  insert into mkt_bank (user_id, bank_name, account_number, account_name) values (auth.uid(), left(btrim(p_bank), 60), btrim(p_number), left(btrim(p_name), 80))
  on conflict (user_id) do update set bank_name = excluded.bank_name, account_number = excluded.account_number, account_name = excluded.account_name, updated_at = now();
  perform mkt_audit('changed bank details', auth.uid(), 'bank details updated');
end;
$$;

-- ============ Standby teams: call the team only when you run a campaign ============
-- Teams stay in place all year. Nobody is paid between campaigns. When you want to promote, create a campaign for the dates you choose.
create or replace function mkt_assign_team(p_campaign uuid) returns json
language plpgsql security definer set search_path = public as $$
declare c mkt_campaigns%rowtype; m record; v_n integer := 0; v_skip integer := 0;
begin
  perform mkt_need_staff();
  select * into c from mkt_campaigns where id = p_campaign;
  if not found then raise exception 'Campaign not found'; end if;
  if c.status not in ('draft', 'active') then raise exception 'This campaign is finished'; end if;
  for m in select id, user_id from mkt_members where institution_id = c.institution_id and status = 'active' loop
    if exists (select 1 from mkt_assignments a join mkt_campaigns o on o.id = a.campaign_id
               where a.member_id = m.id and a.status = 'active' and o.id <> p_campaign and o.status in ('draft', 'active')
                 and o.start_date <= c.end_date and o.end_date >= c.start_date) then
      v_skip := v_skip + 1;
    else
      insert into mkt_assignments (campaign_id, member_id, assigned_by) values (p_campaign, m.id, auth.uid())
      on conflict (campaign_id, member_id) do update set status = 'active', assigned_by = auth.uid();
      v_n := v_n + 1;
      begin perform notify(m.user_id, 'admin', 'New marketing campaign', 'You were assigned to: ' || c.name, 'marketing.html', auth.uid()); exception when others then null; end;
    end if;
  end loop;
  perform mkt_audit('assigned whole team', null, c.name || ': ' || v_n || ' people, ' || v_skip || ' skipped');
  return json_build_object('assigned', v_n, 'skipped', v_skip);
end;
$$;

create or replace function mkt_call_team(p_inst uuid, p_message text) returns integer
language plpgsql security definer set search_path = public as $$
declare m record; v_n integer := 0; v_msg text := btrim(coalesce(p_message, ''));
begin
  perform mkt_need_staff();
  if length(v_msg) < 5 or length(v_msg) > 200 then raise exception 'Write a short message (5 to 200 letters)'; end if;
  for m in select user_id from mkt_members where institution_id = p_inst and status = 'active' loop
    begin perform notify(m.user_id, 'admin', 'LBN marketing team', v_msg, 'marketing.html', auth.uid()); v_n := v_n + 1; exception when others then null; end;
  end loop;
  perform mkt_audit('called the team', null, (select name from mkt_institutions where id = p_inst) || ': ' || v_msg);
  return v_n;
end;
$$;

-- ============ New admin permission "marketing" (replaces the earlier definitions, keeps everything else) ============
create or replace function admin_appoint(p_user uuid, p_title text, p_permissions text[], p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['members','finance','support','content','marketplace','education','security','marketing'];
  ttl text := btrim(coalesce(p_title, ''));
begin
  if not is_super_admin() then raise exception 'Only the Super Admin can do this'; end if;
  if p_user = auth.uid() then raise exception 'You are already the Super Admin'; end if;
  if exists (select 1 from profiles where id = p_user and is_super_admin) then raise exception 'That account is a Super Admin'; end if;
  if not exists (select 1 from profiles where id = p_user) then raise exception 'Account not found'; end if;
  if length(ttl) < 2 or length(ttl) > 40 then raise exception 'Give the role a name of 2 to 40 characters'; end if;
  if p_permissions is null or cardinality(p_permissions) = 0 then raise exception 'Choose at least one permission'; end if;
  if not (p_permissions <@ allowed) then raise exception 'Unknown permission'; end if;

  insert into admin_staff (user_id, title, permissions, status, appointed_by, note)
  values (p_user, ttl, p_permissions, 'active', auth.uid(), left(p_note, 300))
  on conflict (user_id) do update
    set title = excluded.title, permissions = excluded.permissions, status = 'active',
        note = excluded.note, suspended_at = null, suspended_reason = null, updated_at = now();

  update profiles set is_admin = true where id = p_user;

  insert into admin_audit (actor_id, action, target_id, details)
  values (auth.uid(), 'appointed', p_user, ttl || ': ' || array_to_string(p_permissions, ', '));

  begin
    perform notify(p_user, 'admin', 'You are now an admin', 'You were appointed as ' || ttl || '. Open Admin to start.', 'admin.html', auth.uid());
  exception when others then null;
  end;
end;
$$;
create or replace function admin_update_staff(p_user uuid, p_title text, p_permissions text[], p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  allowed text[] := array['members','finance','support','content','marketplace','education','security','marketing'];
  ttl text := btrim(coalesce(p_title, ''));
begin
  if not is_super_admin() then raise exception 'Only the Super Admin can do this'; end if;
  if not exists (select 1 from admin_staff where user_id = p_user) then raise exception 'That person is not on the admin team'; end if;
  if length(ttl) < 2 or length(ttl) > 40 then raise exception 'Give the role a name of 2 to 40 characters'; end if;
  if p_permissions is null or cardinality(p_permissions) = 0 then raise exception 'Choose at least one permission'; end if;
  if not (p_permissions <@ allowed) then raise exception 'Unknown permission'; end if;

  update admin_staff
  set title = ttl, permissions = p_permissions, note = left(p_note, 300), updated_at = now()
  where user_id = p_user;

  insert into admin_audit (actor_id, action, target_id, details)
  values (auth.uid(), 'changed access', p_user, ttl || ': ' || array_to_string(p_permissions, ', '));
end;
$$;
create or replace function my_admin_access()
returns table (is_super boolean, title text, permissions text[], status text)
language sql security definer set search_path = public stable as $$
  select coalesce(pr.is_super_admin, false),
         case when pr.is_super_admin then 'Super Admin' else s.title end,
         case when pr.is_super_admin then array['members','finance','support','content','marketplace','education','security','marketing','admins']
              else coalesce(s.permissions, '{}') end,
         case when pr.is_super_admin then 'active' else coalesce(s.status, 'none') end
  from profiles pr
  left join admin_staff s on s.user_id = pr.id
  where pr.id = auth.uid();
$$;
create or replace function admin_home_counts() returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb := '{}'::jsonb;
begin
  if not (is_admin() or is_super_admin()) then raise exception 'Not allowed'; end if;

  if admin_can('members') then
    res := res || jsonb_build_object('members', jsonb_build_array(
      jsonb_build_object('label', 'seller ID checks', 'n', home_count($q$select count(*)::int from seller_verifications where status = 'pending'$q$)),
      jsonb_build_object('label', 'rider applications', 'n', home_count($q$select count(*)::int from riders where status = 'pending'$q$))));
    res := res || jsonb_build_object('ambassadors', jsonb_build_array(
      jsonb_build_object('label', 'ambassador applications', 'n', home_count($q$select count(*)::int from ambassador_applications where status in ('submitted', 'reviewing')$q$)),
      jsonb_build_object('label', 'monitoring applications', 'n', home_count($q$select count(*)::int from monitoring_applications where status in ('submitted', 'reviewing')$q$))));
    res := res || jsonb_build_object('representatives', jsonb_build_array(
      jsonb_build_object('label', 'open applications', 'n', home_count($q$select count(*)::int from rep_applications where status in ('submitted', 'reviewing', 'interview')$q$))));
  end if;

  if admin_can('finance') then
    res := res || jsonb_build_object('finance', jsonb_build_array(
      jsonb_build_object('label', 'marketing pay waiting approval', 'n', home_count($q$select count(*)::int from mkt_pay where status = 'prepared'$q$)),
      jsonb_build_object('label', 'streamer payout requests', 'n', home_count($q$select count(*)::int from creator_payouts where status = 'requested'$q$)),
      jsonb_build_object('label', 'referral payout requests', 'n', home_count($q$select count(*)::int from referral_payouts where status = 'requested'$q$))));
  end if;

  if admin_can('marketplace') then
    res := res || jsonb_build_object('marketplace', jsonb_build_array(
      jsonb_build_object('label', 'open disputes', 'n', home_count($q$select count(*)::int from disputes where status = 'open'$q$)),
      jsonb_build_object('label', 'reported reviews', 'n', home_count($q$select count(*)::int from reviews where reported$q$)),
      jsonb_build_object('label', 'escalated returns', 'n', home_count($q$select count(*)::int from trade_returns where status = 'escalated'$q$))));
  end if;

  if admin_can('education') then
    res := res || jsonb_build_object('education', jsonb_build_array(
      jsonb_build_object('label', 'graduation requests', 'n', home_count($q$select count(*)::int from graduation_requests where status = 'pending'$q$))));
  end if;

  if admin_can('support') then
    res := res || jsonb_build_object('support', jsonb_build_array(
      jsonb_build_object('label', 'unresolved messages', 'n', home_count($q$select count(*)::int from support_messages where not resolved$q$)),
      jsonb_build_object('label', 'new feedback', 'n', home_count($q$select count(*)::int from feedback where status = 'new'$q$))));
  end if;

  if admin_can('marketing') then
    res := res || jsonb_build_object('marketing', jsonb_build_array(
      jsonb_build_object('label', 'daily reports to review', 'n', home_count($q$select count(*)::int from mkt_activity where status = 'submitted'$q$))));
  end if;

  return res;
end;
$$;

-- ============ Who may call what ============
revoke all on function mkt_today() from public, anon, authenticated;
revoke all on function mkt_staff() from public, anon, authenticated;
revoke all on function mkt_coord_of(uuid) from public, anon, authenticated;
revoke all on function mkt_can_view(uuid) from public, anon, authenticated;
revoke all on function mkt_audit(text, uuid, text) from public, anon, authenticated;
revoke all on function mkt_need_staff() from public, anon, authenticated;
revoke all on function mkt_need_super() from public, anon, authenticated;
revoke all on function mkt_naira(bigint) from public, anon, authenticated;
revoke all on function mkt_member_results(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function mkt_pay_calc(uuid, uuid, date, date) from public, anon, authenticated;
revoke all on function mkt_roles_list() from public, anon;
revoke all on function mkt_settings_get() from public, anon;
revoke all on function mkt_role_template_set(text, integer, text) from public, anon;
revoke all on function mkt_settings_set(bigint, integer) from public, anon;
revoke all on function mkt_institution_create(text, text, text, text, text) from public, anon;
revoke all on function mkt_institution_update(uuid, text, text, text, text, text, text, text) from public, anon;
revoke all on function mkt_institution_list() from public, anon;
revoke all on function mkt_team_get(uuid) from public, anon;
revoke all on function mkt_slots_set(uuid, text, integer, text) from public, anon;
revoke all on function mkt_find_account(text) from public, anon;
revoke all on function mkt_member_add(uuid, uuid, text, text) from public, anon;
revoke all on function mkt_member_set_status(uuid, text, text) from public, anon;
revoke all on function mkt_member_change_role(uuid, text) from public, anon;
revoke all on function mkt_member_transfer(uuid, uuid, text, text) from public, anon;
revoke all on function mkt_transfers_list() from public, anon;
revoke all on function mkt_campaign_save(uuid, uuid, text, text, date, date, text, bigint, integer, integer, integer, integer, integer, integer, bigint, integer) from public, anon;
revoke all on function mkt_campaign_set_status(uuid, text) from public, anon;
revoke all on function mkt_campaign_list(uuid) from public, anon;
revoke all on function mkt_campaign_get(uuid) from public, anon;
revoke all on function mkt_assign(uuid, uuid, bigint) from public, anon;
revoke all on function mkt_unassign(uuid, uuid) from public, anon;
revoke all on function mkt_attendance_mark(uuid, uuid, date, text) from public, anon;
revoke all on function mkt_attendance_list(uuid, date) from public, anon;
revoke all on function mkt_activity_list(uuid, text) from public, anon;
revoke all on function mkt_activity_review(uuid, boolean, text) from public, anon;
revoke all on function mkt_pay_prepare(uuid, date, date) from public, anon;
revoke all on function mkt_pay_list(uuid) from public, anon;
revoke all on function mkt_pay_bonus(uuid, bigint, text) from public, anon;
revoke all on function mkt_pay_approve(uuid[]) from public, anon;
revoke all on function mkt_pay_mark_paid(uuid, text) from public, anon;
revoke all on function mkt_pay_withhold(uuid, text) from public, anon;
revoke all on function mkt_pay_release(uuid) from public, anon;
revoke all on function mkt_dashboard() from public, anon;
revoke all on function mkt_my_context() from public, anon;
revoke all on function mkt_my_work() from public, anon;
revoke all on function mkt_my_activity_submit(uuid, date, text, text, integer, integer, integer, text) from public, anon;
revoke all on function mkt_my_activity_list(uuid) from public, anon;
revoke all on function mkt_my_bank_get() from public, anon;
revoke all on function mkt_my_bank_set(text, text, text) from public, anon;
revoke all on function mkt_assign_team(uuid) from public, anon;
revoke all on function mkt_call_team(uuid, text) from public, anon;
revoke all on function admin_appoint(uuid, text, text[], text) from public, anon;
revoke all on function admin_update_staff(uuid, text, text[], text) from public, anon;
revoke all on function my_admin_access() from public, anon;
revoke all on function admin_home_counts() from public, anon;

grant execute on function mkt_roles_list() to authenticated;
grant execute on function mkt_settings_get() to authenticated;
grant execute on function mkt_role_template_set(text, integer, text) to authenticated;
grant execute on function mkt_settings_set(bigint, integer) to authenticated;
grant execute on function mkt_institution_create(text, text, text, text, text) to authenticated;
grant execute on function mkt_institution_update(uuid, text, text, text, text, text, text, text) to authenticated;
grant execute on function mkt_institution_list() to authenticated;
grant execute on function mkt_team_get(uuid) to authenticated;
grant execute on function mkt_slots_set(uuid, text, integer, text) to authenticated;
grant execute on function mkt_find_account(text) to authenticated;
grant execute on function mkt_member_add(uuid, uuid, text, text) to authenticated;
grant execute on function mkt_member_set_status(uuid, text, text) to authenticated;
grant execute on function mkt_member_change_role(uuid, text) to authenticated;
grant execute on function mkt_member_transfer(uuid, uuid, text, text) to authenticated;
grant execute on function mkt_transfers_list() to authenticated;
grant execute on function mkt_campaign_save(uuid, uuid, text, text, date, date, text, bigint, integer, integer, integer, integer, integer, integer, bigint, integer) to authenticated;
grant execute on function mkt_campaign_set_status(uuid, text) to authenticated;
grant execute on function mkt_campaign_list(uuid) to authenticated;
grant execute on function mkt_campaign_get(uuid) to authenticated;
grant execute on function mkt_assign(uuid, uuid, bigint) to authenticated;
grant execute on function mkt_unassign(uuid, uuid) to authenticated;
grant execute on function mkt_attendance_mark(uuid, uuid, date, text) to authenticated;
grant execute on function mkt_attendance_list(uuid, date) to authenticated;
grant execute on function mkt_activity_list(uuid, text) to authenticated;
grant execute on function mkt_activity_review(uuid, boolean, text) to authenticated;
grant execute on function mkt_pay_prepare(uuid, date, date) to authenticated;
grant execute on function mkt_pay_list(uuid) to authenticated;
grant execute on function mkt_pay_bonus(uuid, bigint, text) to authenticated;
grant execute on function mkt_pay_approve(uuid[]) to authenticated;
grant execute on function mkt_pay_mark_paid(uuid, text) to authenticated;
grant execute on function mkt_pay_withhold(uuid, text) to authenticated;
grant execute on function mkt_pay_release(uuid) to authenticated;
grant execute on function mkt_dashboard() to authenticated;
grant execute on function mkt_my_context() to authenticated;
grant execute on function mkt_my_work() to authenticated;
grant execute on function mkt_my_activity_submit(uuid, date, text, text, integer, integer, integer, text) to authenticated;
grant execute on function mkt_my_activity_list(uuid) to authenticated;
grant execute on function mkt_my_bank_get() to authenticated;
grant execute on function mkt_my_bank_set(text, text, text) to authenticated;
grant execute on function mkt_assign_team(uuid) to authenticated;
grant execute on function mkt_call_team(uuid, text) to authenticated;
grant execute on function admin_appoint(uuid, text, text[], text) to authenticated;
grant execute on function admin_update_staff(uuid, text, text[], text) to authenticated;
grant execute on function my_admin_access() to authenticated;
grant execute on function admin_home_counts() to authenticated;
