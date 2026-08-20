alter table service_advisor_settings
  add column if not exists ai_default_tone text not null default 'concise',
  add column if not exists ai_enabled_modes jsonb not null default '["update_technical","update_simple","update_text","update_phone","update_recommend","update_declined","note_ro","note_customer","note_internal","concern"]'::jsonb;

alter table service_advisor_settings
  add constraint service_advisor_settings_ai_tone_check check (ai_default_tone in ('concise', 'warm'));
