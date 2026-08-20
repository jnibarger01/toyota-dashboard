import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("advisor settings migration supplies operational defaults and persists rule updates", async (t) => {
  const db = new PGlite();
  t.after(async () => db.close());
  await db.waitReady;
  await db.exec(await readFile(new URL("../migrations/0005_advisor_settings.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/0007_advisor_ai_settings.sql", import.meta.url), "utf8"));
  await db.exec(await readFile(new URL("../migrations/0009_advisor_appearance.sql", import.meta.url), "utf8"));
  await db.query("insert into service_advisor_settings (user_id) values ('advisor-1')");
  await db.query("update service_advisor_settings set approval_delay_warning_minutes = 40, promise_risk_warning_minutes = 45, default_transportation = 'loaner' where user_id = 'advisor-1'");
  const [settings] = (await db.query<{ update_interval_minutes: number; waiting_update_interval_minutes: number; approval_delay_warning_minutes: number; promise_risk_warning_minutes: number; default_transportation: string; ai_default_tone: string; ai_enabled_modes: string[]; appearance: string }>("select update_interval_minutes, waiting_update_interval_minutes, approval_delay_warning_minutes, promise_risk_warning_minutes, default_transportation, ai_default_tone, ai_enabled_modes, appearance from service_advisor_settings where user_id = 'advisor-1'")).rows;
  assert.equal(settings?.update_interval_minutes, 90);
  assert.equal(settings?.waiting_update_interval_minutes, 25);
  assert.equal(settings?.approval_delay_warning_minutes, 40);
  assert.equal(settings?.promise_risk_warning_minutes, 45);
  assert.equal(settings?.default_transportation, "loaner");
  assert.equal(settings?.ai_default_tone, "concise");
  assert.ok(settings?.ai_enabled_modes.includes("update_simple"));
  assert.equal(settings?.appearance, "system");
});
