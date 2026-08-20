-- Authoritative Service Advisor Operating System data. Customer, vehicle,
-- RO, communications, blockers, recommendations, and audit records are
-- separate relational entities; JSON is only used for immutable value snapshots.
create table if not exists service_customers (
  id text primary key,
  user_id text not null,
  preferred_name text,
  full_name text not null,
  phone text,
  email text,
  preferred_contact_method text not null default 'phone',
  communication_consent text not null default 'unknown',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_customers_user_name_idx on service_customers (user_id, full_name);

create table if not exists service_vehicles (
  id text primary key,
  user_id text not null,
  customer_id text not null references service_customers(id),
  vin text,
  model_year integer,
  make text,
  model text,
  trim text,
  mileage integer,
  license_plate text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_vehicles_user_vin_idx on service_vehicles (user_id, vin);

create table if not exists repair_orders (
  id text primary key,
  user_id text not null,
  dealership_id text not null default 'default',
  ro_number text not null,
  external_id text,
  source_system text not null default 'manual',
  customer_id text not null references service_customers(id),
  vehicle_id text not null references service_vehicles(id),
  advisor_id text,
  technician_name text,
  technician_team text,
  dispatcher_name text,
  appointment_at timestamptz,
  arrived_at timestamptz,
  written_at timestamptz,
  promised_at timestamptz,
  estimated_completion_at timestamptz,
  waiting_customer boolean not null default false,
  walk_in boolean not null default false,
  carryover boolean not null default false,
  comeback boolean not null default false,
  transportation text not null default 'unknown',
  workflow_state text not null,
  previous_state text,
  state_entered_at timestamptz not null default now(),
  concern text,
  verified_concern text,
  technician_findings text,
  diagnosis text,
  parts_status text not null default 'unknown',
  parts_eta_at timestamptz,
  labor_estimate_hours numeric,
  recommended_total numeric not null default 0,
  approved_total numeric not null default 0,
  declined_total numeric not null default 0,
  customer_pay_total numeric not null default 0,
  warranty_total numeric not null default 0,
  internal_total numeric not null default 0,
  last_customer_contact_at timestamptz,
  next_update_due_at timestamptz,
  update_interval_minutes integer not null default 90,
  pending_callback boolean not null default false,
  source_synced_at timestamptz,
  local_changed_at timestamptz not null default now(),
  sync_status text not null default 'local-only',
  sync_error text,
  conflict_state text,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dealership_id, ro_number)
);
create index if not exists repair_orders_user_state_idx on repair_orders (user_id, workflow_state, promised_at);
create index if not exists repair_orders_user_update_idx on repair_orders (user_id, next_update_due_at);

create table if not exists ro_status_history (
  id text primary key,
  ro_id text not null references repair_orders(id),
  previous_state text,
  new_state text not null,
  occurred_at timestamptz not null default now(),
  source text not null,
  actor_id text,
  reason text,
  notes text
);
create index if not exists ro_status_history_ro_time_idx on ro_status_history (ro_id, occurred_at);

create table if not exists ro_communications (
  id text primary key,
  ro_id text not null references repair_orders(id),
  occurred_at timestamptz not null default now(),
  method text not null,
  direction text not null,
  advisor_id text,
  summary text not null,
  message text,
  outcome text,
  customer_response text,
  source text not null default 'manual',
  ai_generated boolean not null default false,
  sent boolean not null default false
);
create index if not exists ro_communications_ro_time_idx on ro_communications (ro_id, occurred_at desc);

create table if not exists ro_blockers (
  id text primary key,
  ro_id text not null references repair_orders(id),
  blocker_type text not null,
  description text not null,
  severity text not null default 'medium',
  owner text,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists ro_blockers_open_idx on ro_blockers (ro_id, resolved_at);

create table if not exists ro_recommendations (
  id text primary key,
  ro_id text not null references repair_orders(id),
  description text not null,
  amount numeric not null default 0,
  labor_hours numeric,
  state text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists ro_events (
  id text primary key,
  ro_id text not null references repair_orders(id),
  event_type text not null,
  occurred_at timestamptz not null default now(),
  actor_id text,
  source text not null,
  previous_value jsonb,
  new_value jsonb,
  notes text
);
create index if not exists ro_events_ro_time_idx on ro_events (ro_id, occurred_at desc);

create table if not exists service_lane_snapshots (
  user_id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);
