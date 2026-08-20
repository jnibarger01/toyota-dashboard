alter table service_follow_ups
  add column if not exists created_manually boolean not null default false;

create index if not exists service_follow_ups_user_manual_open_idx
  on service_follow_ups (user_id, created_manually, outcome, due_at);
