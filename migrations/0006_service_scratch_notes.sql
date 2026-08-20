create table if not exists service_scratch_notes (
  id text primary key,
  user_id text not null,
  text text not null,
  created_at timestamptz not null default now(),
  check (char_length(trim(text)) between 1 and 2000)
);
create index if not exists service_scratch_notes_user_created_idx on service_scratch_notes (user_id, created_at desc);
