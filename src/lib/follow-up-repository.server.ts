import type { Sql } from "./db.ts";
import type { FollowUp, FollowUpOutcome, FollowUpReason } from "./types.ts";

type FollowUpRow = { id: string; ro_id: string; reason: FollowUpReason; label: string; outcome: FollowUpOutcome; due_at: string | null; estimated_opportunity: string | number; note: string; created_manually: boolean; created_at: string };

function mapRow(row: FollowUpRow): FollowUp {
  return { id: row.id, roId: row.ro_id, reason: row.reason, label: row.label, outcome: row.outcome, callbackAt: row.due_at, note: row.note, createdAt: row.created_at, estimatedOpportunity: Number(row.estimated_opportunity), createdManually: row.created_manually };
}

export class FollowUpRepository {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  static async connect(): Promise<FollowUpRepository> {
    const { getSql } = await import("./db.ts");
    return new FollowUpRepository(await getSql());
  }

  async list(userId: string): Promise<FollowUp[]> {
    const rows = await this.sql.query<FollowUpRow>("select id, ro_id, reason, label, outcome, due_at, estimated_opportunity, note, created_manually, created_at from service_follow_ups where user_id = $1 order by due_at nulls last, created_at desc", [userId]);
    return rows.map(mapRow);
  }

  /** Imports only valid legacy records once, after their RO ownership exists. */
  async importIfEmpty(userId: string, legacy: FollowUp[]): Promise<void> {
    const [{ count }] = await this.sql.query<{ count: number }>("select count(*)::int as count from service_follow_ups where user_id = $1", [userId]);
    if (count || !legacy.length) return;
    const reasons = new Set<FollowUpReason>(["update_overdue", "authorization", "parts_eta", "diagnosis_done", "ready", "declined", "manual", "deferred_maintenance", "post_service", "unsold_recommendation", "appointment_needed", "parts_arrival", "customer_callback", "internal_follow_up"]);
    const outcomes = new Set<FollowUpOutcome>(["open", "called", "texted", "voicemail", "responded", "later", "completed"]);
    for (const item of legacy) {
      if (!reasons.has(item.reason) || !outcomes.has(item.outcome) || !item.id || item.id.length > 120 || !item.label.trim() || item.label.length > 500 || item.note.length > 4000) continue;
      const ro = await this.sql.query<{ id: string }>("select id from repair_orders where id = $1 and user_id = $2", [item.roId, userId]);
      if (!ro[0]) continue;
      await this.sql.query("insert into service_follow_ups (id, user_id, ro_id, reason, label, outcome, due_at, estimated_opportunity, note, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [item.id, userId, item.roId, item.reason, item.label.trim(), item.outcome, item.callbackAt, item.estimatedOpportunity, item.note, item.createdAt]);
    }
  }

  async create(input: { id?: string; userId: string; roId: string; reason: FollowUpReason; label: string; outcome?: FollowUpOutcome; callbackAt?: string | null; estimatedOpportunity?: number; note?: string; createdManually?: boolean }): Promise<FollowUp> {
    const id = input.id ?? crypto.randomUUID();
    const exists = await this.sql.query<{ id: string }>("select id from repair_orders where id = $1 and user_id = $2", [input.roId, input.userId]);
    if (!exists[0]) throw new Error("Repair order not found");
    const rows = await this.sql.query<FollowUpRow>("insert into service_follow_ups (id, user_id, ro_id, reason, label, outcome, due_at, estimated_opportunity, note, created_manually) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) returning id, ro_id, reason, label, outcome, due_at, estimated_opportunity, note, created_manually, created_at", [id, input.userId, input.roId, input.reason, input.label, input.outcome ?? "open", input.callbackAt ?? null, input.estimatedOpportunity ?? 0, input.note ?? "", input.createdManually ?? false]);
    if (!rows[0]) throw new Error("Follow-up could not be created");
    await this.recordEvent(input.roId, input.userId, "follow_up_created", null, { id, reason: input.reason, label: input.label });
    return mapRow(rows[0]);
  }

  async setOutcome(userId: string, id: string, outcome: FollowUpOutcome): Promise<FollowUp> {
    const before = await this.sql.query<{ ro_id: string; outcome: FollowUpOutcome; label: string }>("select ro_id, outcome, label from service_follow_ups where id = $1 and user_id = $2", [id, userId]);
    if (!before[0]) throw new Error("Follow-up not found");
    const rows = await this.sql.query<FollowUpRow>("update service_follow_ups set outcome = $1, updated_at = now() where id = $2 and user_id = $3 returning id, ro_id, reason, label, outcome, due_at, estimated_opportunity, note, created_manually, created_at", [outcome, id, userId]);
    if (!rows[0]) throw new Error("Follow-up not found");
    await this.recordEvent(rows[0].ro_id, userId, "follow_up_outcome_changed", before[0].outcome, outcome);
    const contact = contactForOutcome(outcome);
    if (contact) {
      const occurredAt = new Date().toISOString();
      const updated = await this.sql.query<{ id: string }>(
        `with updated as (
          update repair_orders set last_customer_contact_at = $1, next_update_due_at = $1::timestamptz + update_interval_minutes * interval '1 minute',
            pending_callback = false, local_changed_at = $1, updated_at = $1, version = version + 1, sync_status = 'pending'
          where id = $2 and user_id = $3 returning id
        ), communication as (
          insert into ro_communications (id, ro_id, occurred_at, method, direction, advisor_id, summary, outcome, source, ai_generated, sent)
          select $4, $2, $1, $5, $6, $3, $7, $8, 'manual', false, $9 where exists (select 1 from updated)
          returning id
        ) select id from updated`,
        [occurredAt, rows[0].ro_id, userId, crypto.randomUUID(), contact.method, contact.direction, `Follow-up: ${before[0].label}`, outcome, contact.sent],
      );
      if (!updated[0]) throw new Error("Repair order changed before customer contact was recorded");
      await this.recordEvent(rows[0].ro_id, userId, "customer_contacted", null, { method: contact.method, outcome, followUpId: id });
    }
    return mapRow(rows[0]);
  }

  private async recordEvent(roId: string, actorId: string, eventType: string, previousValue: unknown, newValue: unknown): Promise<void> {
    await this.sql.query("insert into ro_events (id, ro_id, event_type, actor_id, source, previous_value, new_value) values ($1,$2,$3,$4,'manual',$5::jsonb,$6::jsonb)", [crypto.randomUUID(), roId, eventType, actorId, JSON.stringify(previousValue), JSON.stringify(newValue)]);
  }
}

function contactForOutcome(outcome: FollowUpOutcome): { method: string; direction: string; sent: boolean } | null {
  if (outcome === "called") return { method: "phone", direction: "outgoing", sent: true };
  if (outcome === "texted") return { method: "sms", direction: "outgoing", sent: true };
  if (outcome === "voicemail") return { method: "voicemail", direction: "outgoing", sent: true };
  if (outcome === "responded") return { method: "phone", direction: "incoming", sent: false };
  return null;
}
