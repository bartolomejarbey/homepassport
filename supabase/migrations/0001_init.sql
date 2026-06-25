-- ============================================================================
-- Home Passport + Home OS — initial schema
-- Principle (locked w/ gpt-5.5 review): hard separation Property (transferable)
-- vs Household/Person (private). RLS-first. Document = source of truth.
-- AI outputs are drafts w/ confidence + source + status.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists vector;

-- ---------- enums ----------
create type org_role        as enum ('owner','admin','member');
create type household_role   as enum ('owner','admin','member','viewer');
create type property_type    as enum ('apartment','house','unit','land','commercial');
create type property_status  as enum ('draft','active','transferred','archived');
create type org_relation     as enum ('builder','manager','agent');
create type owner_scope       as enum ('property','household','organization');
create type doc_category      as enum ('contract','invoice','penb','inspection','manual','warranty','plan','insurance','other');
create type extraction_status as enum ('draft','confirmed','rejected');
create type asset_source      as enum ('manual','document','photo','ai');
create type reminder_type     as enum ('warranty','inspection','service','insurance','task');
create type reminder_status   as enum ('open','done','dismissed','snoozed');
create type wording_type      as enum ('legal_required','recommended','insurance_recommended');
create type usage_context     as enum ('owner_occupied','rental','svj','business');
create type system_type       as enum ('chimney','gas','electrical','lps','boiler','pv','pressure');
create type handover_status   as enum ('pending','accepted','expired','revoked');
create type ai_job_type       as enum ('ocr','extraction','vision','valuation','embedding','rag');
create type ai_job_status     as enum ('queued','running','done','error');

-- ---------- identity / access ----------
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text,
  phone         text,
  locale        text default 'cs',
  marketing_opt_in boolean default false,
  created_at    timestamptz default now()
);

create table organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table organization_members (
  organization_id uuid references organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  role            org_role not null default 'member',
  created_at      timestamptz default now(),
  primary key (organization_id, user_id)
);

create table households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'Moje domácnost',
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

create table household_members (
  household_id uuid references households(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  role         household_role not null default 'member',
  created_at   timestamptz default now(),
  primary key (household_id, user_id)
);

-- ---------- property (transferable layer) ----------
create table properties (
  id            uuid primary key default gen_random_uuid(),
  type          property_type not null default 'house',
  title         text,
  street        text, city text, postal_code text, country text default 'CZ',
  cadastral_id  text,
  status        property_status not null default 'draft',
  created_by_org_id uuid references organizations(id),
  created_at    timestamptz default now()
);

-- owning household(s)
create table property_owners (
  property_id  uuid references properties(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  primary key (property_id, household_id)
);

-- org relation (builder/manager) — keeps B2B access without ownership
create table property_org_links (
  property_id     uuid references properties(id) on delete cascade,
  organization_id uuid references organizations(id) on delete cascade,
  relation        org_relation not null default 'builder',
  primary key (property_id, organization_id)
);

create table property_contexts (
  property_id   uuid primary key references properties(id) on delete cascade,
  owner_occupied boolean default true,
  rental        boolean default false,
  svj           boolean default false,
  business_use  boolean default false,
  has_chimney   boolean default false,
  chimney_fuel  text,                 -- 'solid' | 'liquid' | 'gas'
  has_gas       boolean default false,
  has_electrical boolean default true,
  has_lps       boolean default false,
  has_pv        boolean default false
);

create table passport_sections (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  kind        text not null,          -- construction|technology|penb|inspections|warranties|manuals|equipment
  title       text,
  data        jsonb default '{}'::jsonb,
  created_at  timestamptz default now()
);

-- ---------- documents (source of truth) ----------
create table documents (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  asset_id     uuid,
  category     doc_category not null default 'other',
  title        text,
  file_path    text not null,         -- private Storage path; served via signed URL
  mime         text, size_bytes bigint,
  owner_scope  owner_scope not null default 'household',
  transferable boolean not null default false,  -- true => moves with the property on sale
  uploaded_by  uuid references auth.users(id),
  created_at   timestamptz default now()
);

create table document_extractions (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid references documents(id) on delete cascade,
  extracted   jsonb not null default '{}'::jsonb,
  confidence  numeric,
  provider    text, model text,
  status      extraction_status not null default 'draft',
  reviewed_by uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- ---------- assets (Home OS) ----------
create table assets (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid references households(id) on delete cascade,
  property_id   uuid references properties(id),
  name          text not null,
  category      text, room text,
  brand text, model text, serial text,
  purchase_date date, purchase_price numeric, currency text default 'CZK',
  estimated_value numeric, estimated_value_confidence numeric,
  warranty_until date,
  source        asset_source not null default 'manual',
  created_by    uuid references auth.users(id),
  created_at    timestamptz default now()
);
alter table documents add constraint documents_asset_fk
  foreign key (asset_id) references assets(id) on delete set null;

create table asset_photos (
  id        uuid primary key default gen_random_uuid(),
  asset_id  uuid references assets(id) on delete cascade,
  file_path text not null,
  created_at timestamptz default now()
);

-- ---------- reminders + contextual revision engine ----------
create table reminders (
  id           uuid primary key default gen_random_uuid(),
  property_id  uuid references properties(id) on delete cascade,
  household_id uuid references households(id) on delete cascade,
  asset_id     uuid references assets(id) on delete cascade,
  document_id  uuid references documents(id) on delete set null,
  type         reminder_type not null,
  title        text not null,
  due_date     date,
  wording_type wording_type not null default 'recommended',
  legal_basis  text,
  status       reminder_status not null default 'open',
  created_at   timestamptz default now()
);

-- reference data: revision rules per country/context/system (NOT hardcoded in app)
create table revision_rules (
  id             uuid primary key default gen_random_uuid(),
  country        text not null default 'CZ',
  property_type  property_type,
  usage_context  usage_context not null,
  system_type    system_type not null,
  interval_months int,
  interval_note  text,
  wording_type   wording_type not null,
  legal_basis    text,
  message        text not null
);

-- ---------- B2B handover ----------
create table handover_invitations (
  id          uuid primary key default gen_random_uuid(),
  property_id uuid references properties(id) on delete cascade,
  buyer_email text not null,
  token       text not null unique default encode(gen_random_bytes(24),'hex'),
  status      handover_status not null default 'pending',
  expires_at  timestamptz default (now() + interval '30 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);

-- ---------- AI infra ----------
create table ai_jobs (
  id          uuid primary key default gen_random_uuid(),
  type        ai_job_type not null,
  status      ai_job_status not null default 'queued',
  input_ref   jsonb, result jsonb,
  provider    text, model text, cost_estimate numeric, error text,
  created_by  uuid references auth.users(id),
  household_id uuid references households(id) on delete cascade,
  created_at  timestamptz default now()
);

create table embeddings (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid references households(id) on delete cascade,
  document_id  uuid references documents(id) on delete cascade,
  asset_id     uuid references assets(id) on delete cascade,
  chunk_text   text,
  embedding    vector(1536),
  metadata     jsonb default '{}'::jsonb,
  created_at   timestamptz default now()
);

create table audit_events (
  id              uuid primary key default gen_random_uuid(),
  actor_id        uuid references auth.users(id),
  household_id    uuid references households(id) on delete set null,
  organization_id uuid references organizations(id) on delete set null,
  property_id     uuid references properties(id) on delete set null,
  action          text not null,
  target          jsonb,
  created_at      timestamptz default now()
);
