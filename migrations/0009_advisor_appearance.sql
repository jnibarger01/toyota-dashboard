alter table service_advisor_settings
  add column if not exists appearance text not null default 'system';

alter table service_advisor_settings
  add constraint service_advisor_settings_appearance_check check (appearance in ('system', 'light', 'dark'));
