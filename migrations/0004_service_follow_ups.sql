create table if not exists service_follow_ups (
  id text primary key,
  user_id text not null,
  ro_id text not null references repair_orders(id),
  reason text not null,
  label text not null,
  outcome text not null default 'open',
  due_at timestamptz,
  estimated_opportunity numeric not null default 0,
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists service_follow_ups_user_outcome_due_idx on service_follow_ups (user_id, outcome, due_at);
create index if not exists service_follow_ups_ro_idx on service_follow_ups (ro_id, created_at desc);
