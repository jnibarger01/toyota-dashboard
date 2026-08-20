create table if not exists service_advisor_settings (
  user_id text primary key,
  advisor_name text not null default 'Service Advisor',
  store_name text not null default 'Service Drive',
  update_interval_minutes integer not null default 90,
  waiting_update_interval_minutes integer not null default 25,
  approval_delay_warning_minutes integer not null default 25,
  promise_risk_warning_minutes integer not null default 30,
  high_dollar_threshold numeric not null default 1500,
  default_transportation text not null default 'dropoff',
  updated_at timestamptz not null default now(),
  check (update_interval_minutes between 1 and 1440),
  check (waiting_update_interval_minutes between 1 and 1440),
  check (approval_delay_warning_minutes between 1 and 1440),
  check (promise_risk_warning_minutes between 1 and 1440),
  check (high_dollar_threshold >= 0)
);
