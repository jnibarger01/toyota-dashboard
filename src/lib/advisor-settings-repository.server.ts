import type { AiDraftingMode, AppSettings, TransportType } from "@/lib/types";
import { AI_DRAFTING_MODES, DEFAULT_SETTINGS, TRANSPORT_TYPES } from "@/lib/types";
import type { Sql } from "@/lib/db";

type SettingsRow = {
  advisor_name: string; store_name: string; update_interval_minutes: number; waiting_update_interval_minutes: number;
  approval_delay_warning_minutes: number; promise_risk_warning_minutes: number; high_dollar_threshold: string | number; default_transportation: string; ai_default_tone: string; ai_enabled_modes: unknown; appearance: string;
};

function transport(value: string): TransportType { return (TRANSPORT_TYPES as readonly string[]).includes(value) ? value as TransportType : DEFAULT_SETTINGS.defaultTransportation; }
function draftingModes(value: unknown): AiDraftingMode[] { const raw = typeof value === "string" ? (() => { try { return JSON.parse(value); } catch { return null; } })() : value; if (!Array.isArray(raw)) return [...DEFAULT_SETTINGS.aiEnabledModes]; const modes = raw.filter((mode): mode is AiDraftingMode => typeof mode === "string" && (AI_DRAFTING_MODES as readonly string[]).includes(mode)); return modes.length ? modes : [...DEFAULT_SETTINGS.aiEnabledModes]; }
function map(row: SettingsRow): AppSettings {
  return {
    advisorName: row.advisor_name, storeName: row.store_name, updateIntervalMin: row.update_interval_minutes,
    waitingUpdateIntervalMin: row.waiting_update_interval_minutes, approvalDelayWarningMin: row.approval_delay_warning_minutes,
    promiseRiskWarningMin: row.promise_risk_warning_minutes, highDollarThreshold: Number(row.high_dollar_threshold),
    defaultTransportation: transport(row.default_transportation), aiDefaultTone: row.ai_default_tone === "warm" ? "warm" : "concise", aiEnabledModes: draftingModes(row.ai_enabled_modes), appearance: row.appearance === "dark" || row.appearance === "light" ? row.appearance : "system", stallMinutes: { ...DEFAULT_SETTINGS.stallMinutes },
  };
}

export class AdvisorSettingsRepository {
  constructor(private readonly sql: Sql) {}

  async get(userId: string, initial: AppSettings = DEFAULT_SETTINGS): Promise<AppSettings> {
    const rows = await this.sql.query<SettingsRow>(
      "select advisor_name, store_name, update_interval_minutes, waiting_update_interval_minutes, approval_delay_warning_minutes, promise_risk_warning_minutes, high_dollar_threshold, default_transportation, ai_default_tone, ai_enabled_modes, appearance from service_advisor_settings where user_id = $1",
      [userId],
    );
    if (rows[0]) return map(rows[0]);
    return this.save(userId, initial);
  }

  async save(userId: string, settings: AppSettings): Promise<AppSettings> {
    const rows = await this.sql.query<SettingsRow>(
      `insert into service_advisor_settings (user_id, advisor_name, store_name, update_interval_minutes, waiting_update_interval_minutes, approval_delay_warning_minutes, promise_risk_warning_minutes, high_dollar_threshold, default_transportation, ai_default_tone, ai_enabled_modes, appearance)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
       on conflict (user_id) do update set advisor_name = excluded.advisor_name, store_name = excluded.store_name,
         update_interval_minutes = excluded.update_interval_minutes, waiting_update_interval_minutes = excluded.waiting_update_interval_minutes,
         approval_delay_warning_minutes = excluded.approval_delay_warning_minutes, promise_risk_warning_minutes = excluded.promise_risk_warning_minutes,
         high_dollar_threshold = excluded.high_dollar_threshold, default_transportation = excluded.default_transportation, ai_default_tone = excluded.ai_default_tone, ai_enabled_modes = excluded.ai_enabled_modes, appearance = excluded.appearance, updated_at = now()
       returning advisor_name, store_name, update_interval_minutes, waiting_update_interval_minutes,
         approval_delay_warning_minutes, promise_risk_warning_minutes, high_dollar_threshold, default_transportation, ai_default_tone, ai_enabled_modes, appearance`,
      [userId, settings.advisorName, settings.storeName, settings.updateIntervalMin, settings.waitingUpdateIntervalMin, settings.approvalDelayWarningMin, settings.promiseRiskWarningMin, settings.highDollarThreshold, settings.defaultTransportation, settings.aiDefaultTone, JSON.stringify(settings.aiEnabledModes), settings.appearance],
    );
    return map(rows[0]!);
  }
}
