import type { Sql } from "./db.ts";
import { assertTransition, type WorkflowState } from "./ro-domain.ts";

export type RepairOrderRecord = {
  id: string;
  roNumber: string;
  customerName: string;
  preferredName: string | null;
  phone: string | null;
  email: string | null;
  preferredContactMethod: string;
  communicationConsent: string;
  vehicle: { vin: string | null; year: number | null; make: string | null; model: string | null; trim: string | null; mileage: number | null; licensePlate: string | null };
  state: WorkflowState;
  previousState: WorkflowState | null;
  stateEnteredAt: string;
  appointmentAt: string | null;
  promiseAt: string | null;
  technicianName: string | null;
  waitingCustomer: boolean;
  carryover: boolean;
  comeback: boolean;
  transportation: string;
  concern: string | null;
  technicianFindings: string | null;
  diagnosis: string | null;
  partsStatus: string;
  partsEtaAt: string | null;
  recommendedTotal: number;
  approvedTotal: number;
  declinedTotal: number;
  lastCustomerContactAt: string | null;
  nextUpdateDueAt: string | null;
  updateIntervalMinutes: number;
  version: number;
  externalId: string | null;
  sourceSystem: string;
  sourceSyncedAt: string | null;
  localChangedAt: string;
  syncStatus: "synced" | "pending" | "failed" | "conflict" | "local-only";
  syncError: string | null;
  conflictState: string | null;
};

export type OperationalEvent = { id: string; roId: string; roNumber?: string; customerName?: string; type: string; occurredAt: string; source: string; notes: string | null; previousValue: string | null; newValue: string | null };
export type StatusTransitionRecord = { id: string; previousState: WorkflowState | null; newState: WorkflowState; occurredAt: string; source: string; actorId: string | null; reason: string | null; notes: string | null };
export type CommunicationRecord = { id: string; occurredAt: string; method: string; direction: string; advisorId: string | null; summary: string; message: string | null; outcome: string | null; customerResponse: string | null; source: string; sent: boolean; aiGenerated: boolean };
export type BlockerRecord = { id: string; type: string; description: string; severity: string; owner: string | null; createdAt: string; resolvedAt: string | null };
export type RecommendationRecord = { id: string; description: string; amount: number; laborHours: number | null; state: "recommended" | "approved" | "declined"; createdAt: string; decidedAt: string | null };
export type LaneRepairOrder = { record: RepairOrderRecord; recommendations: RecommendationRecord[]; blockers: BlockerRecord[] };

type RoRow = {
  id: string; ro_number: string; full_name: string; preferred_name: string | null; phone: string | null; email: string | null; preferred_contact_method: string; communication_consent: string;
  vin: string | null; model_year: number | null; make: string | null; model: string | null; trim: string | null; mileage: number | null; license_plate: string | null;
  workflow_state: WorkflowState; previous_state: WorkflowState | null; state_entered_at: string; appointment_at: string | null; promised_at: string | null;
  technician_name: string | null; waiting_customer: boolean; carryover: boolean; comeback: boolean; transportation: string;
  concern: string | null; technician_findings: string | null; diagnosis: string | null; parts_status: string; parts_eta_at: string | null;
  recommended_total: string | number; approved_total: string | number; declined_total: string | number;
  last_customer_contact_at: string | null; next_update_due_at: string | null; update_interval_minutes: number; version: number;
  external_id: string | null; source_system: string; source_synced_at: string | null; local_changed_at: string;
  sync_status: "synced" | "pending" | "failed" | "conflict" | "local-only"; sync_error: string | null; conflict_state: string | null;
};

function number(value: string | number): number { return typeof value === "number" ? value : Number(value); }

function mapRow(row: RoRow): RepairOrderRecord {
  return {
    id: row.id, roNumber: row.ro_number, customerName: row.full_name, preferredName: row.preferred_name, phone: row.phone,
    email: row.email, preferredContactMethod: row.preferred_contact_method, communicationConsent: row.communication_consent,
    vehicle: { vin: row.vin, year: row.model_year, make: row.make, model: row.model, trim: row.trim, mileage: row.mileage, licensePlate: row.license_plate },
    state: row.workflow_state, previousState: row.previous_state, stateEnteredAt: row.state_entered_at, appointmentAt: row.appointment_at,
    promiseAt: row.promised_at, technicianName: row.technician_name, waitingCustomer: row.waiting_customer, carryover: row.carryover,
    comeback: row.comeback, transportation: row.transportation, concern: row.concern, technicianFindings: row.technician_findings,
    diagnosis: row.diagnosis, partsStatus: row.parts_status, partsEtaAt: row.parts_eta_at, recommendedTotal: number(row.recommended_total),
    approvedTotal: number(row.approved_total), declinedTotal: number(row.declined_total), lastCustomerContactAt: row.last_customer_contact_at,
    nextUpdateDueAt: row.next_update_due_at, updateIntervalMinutes: row.update_interval_minutes, version: row.version, externalId: row.external_id, sourceSystem: row.source_system,
    sourceSyncedAt: row.source_synced_at, localChangedAt: row.local_changed_at, syncStatus: row.sync_status,
    syncError: row.sync_error, conflictState: row.conflict_state,
  };
}

const SELECT_RO = `select ro.id, ro.ro_number, c.full_name, c.preferred_name, c.phone, c.email, c.preferred_contact_method, c.communication_consent,
  v.vin, v.model_year, v.make, v.model, v.trim, v.mileage, v.license_plate,
  ro.workflow_state, ro.previous_state, ro.state_entered_at, ro.appointment_at, ro.promised_at,
  ro.technician_name, ro.waiting_customer, ro.carryover, ro.comeback, ro.transportation,
  ro.concern, ro.technician_findings, ro.diagnosis, ro.parts_status, ro.parts_eta_at,
  ro.recommended_total, ro.approved_total, ro.declined_total, ro.last_customer_contact_at,
  ro.next_update_due_at, ro.update_interval_minutes, ro.version, ro.external_id, ro.source_system, ro.source_synced_at, ro.local_changed_at,
  ro.sync_status, ro.sync_error, ro.conflict_state
  from repair_orders ro join service_customers c on c.id = ro.customer_id
  join service_vehicles v on v.id = ro.vehicle_id`;

export class RepairOrderRepository {
  private readonly sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  static async connect(): Promise<RepairOrderRepository> {
    const { getSql } = await import("./db.ts");
    return new RepairOrderRepository(await getSql());
  }

  async listActive(userId: string): Promise<RepairOrderRecord[]> {
    const rows = await this.sql.query<RoRow>(`${SELECT_RO} where ro.user_id = $1 and ro.workflow_state <> 'delivered' order by ro.promised_at nulls last, ro.updated_at desc`, [userId]);
    return rows.map(mapRow);
  }

  /** Returns normalized lane records, including delivered work for optional history views. */
  async listForLane(userId: string): Promise<LaneRepairOrder[]> {
    const rows = await this.sql.query<RoRow>(`${SELECT_RO} where ro.user_id = $1 order by ro.promised_at nulls last, ro.updated_at desc`, [userId]);
    const records = rows.map(mapRow);
    if (!records.length) return [];
    const recommendationRows = await this.sql.query<{ id: string; ro_id: string; description: string; amount: string | number; labor_hours: string | number | null; state: "recommended" | "approved" | "declined"; created_at: string; decided_at: string | null }>(
      "select id, ro_id, description, amount, labor_hours, state, created_at, decided_at from ro_recommendations where ro_id = any($1::text[]) order by created_at, id",
      [records.map((record) => record.id)],
    );
    const recommendationsByRo = new Map<string, RecommendationRecord[]>();
    for (const row of recommendationRows) {
      const list = recommendationsByRo.get(row.ro_id) ?? [];
      list.push({ id: row.id, description: row.description, amount: number(row.amount), laborHours: row.labor_hours == null ? null : number(row.labor_hours), state: row.state, createdAt: row.created_at, decidedAt: row.decided_at });
      recommendationsByRo.set(row.ro_id, list);
    }
    const blockerRows = await this.sql.query<{ id: string; ro_id: string; blocker_type: string; description: string; severity: string; owner: string | null; created_at: string }>(
      "select id, ro_id, blocker_type, description, severity, owner, created_at from ro_blockers where ro_id = any($1::text[]) and resolved_at is null order by created_at desc",
      [records.map((record) => record.id)],
    );
    const blockersByRo = new Map<string, BlockerRecord[]>();
    for (const row of blockerRows) {
      const list = blockersByRo.get(row.ro_id) ?? [];
      list.push({ id: row.id, type: row.blocker_type, description: row.description, severity: row.severity, owner: row.owner, createdAt: row.created_at, resolvedAt: null });
      blockersByRo.set(row.ro_id, list);
    }
    return records.map((record) => ({ record, recommendations: recommendationsByRo.get(record.id) ?? [], blockers: blockersByRo.get(record.id) ?? [] }));
  }

  async getByNumber(userId: string, roNumber: string): Promise<RepairOrderRecord | null> {
    const rows = await this.sql.query<RoRow>(`${SELECT_RO} where ro.user_id = $1 and ro.ro_number = $2`, [userId, roNumber]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  /**
   * Matches only approved, allowlisted fields (RO number, customer name,
   * vehicle make/model) — never free-text fields like `concern` or
   * `diagnosis`. Callers must pre-escape LIKE metacharacters in `query`
   * (see `escapeLikePattern`) so a search term can't widen its own match.
   */
  async search(userId: string, likePattern: string, limit: number): Promise<RepairOrderRecord[]> {
    const rows = await this.sql.query<RoRow>(
      `${SELECT_RO} where ro.user_id = $1 and (ro.ro_number ilike $2 or c.full_name ilike $2 or v.make ilike $2 or v.model ilike $2)
       order by ro.promised_at nulls last, ro.updated_at desc limit $3`,
      [userId, likePattern, limit],
    );
    return rows.map(mapRow);
  }

  async listRecommendations(userId: string, roId: string): Promise<RecommendationRecord[]> {
    if (!(await this.getById(userId, roId))) throw new Error("Repair order not found");
    const rows = await this.sql.query<{ id: string; description: string; amount: string | number; labor_hours: string | number | null; state: "recommended" | "approved" | "declined"; created_at: string; decided_at: string | null }>("select id, description, amount, labor_hours, state, created_at, decided_at from ro_recommendations where ro_id = $1 order by created_at, id", [roId]);
    return rows.map((row) => ({ id: row.id, description: row.description, amount: number(row.amount), laborHours: row.labor_hours == null ? null : number(row.labor_hours), state: row.state, createdAt: row.created_at, decidedAt: row.decided_at }));
  }

  /** Adds a verified advisor-entered estimate line under the RO optimistic lock. */
  async addRecommendation(input: { userId: string; roId: string; description: string; amount: number; laborHours?: number; expectedVersion: number; actorId: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before adding the estimate");
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const updated = await this.sql.query<{ id: string }>(
      `with target as (
        select id from repair_orders where id = $1 and user_id = $2 and version = $3 for update
      ), inserted as (
        insert into ro_recommendations (id, ro_id, description, amount, labor_hours, state, created_at)
        select $4, $1, $5, $6, $7, 'recommended', $8 where exists (select 1 from target) returning id
      )
      update repair_orders set recommended_total = recommended_total + $6, local_changed_at = $8, updated_at = $8,
        version = version + 1, sync_status = 'pending'
      where id = $1 and user_id = $2 and version = $3 and exists (select 1 from inserted) returning id`,
      [input.roId, input.userId, input.expectedVersion, id, input.description, input.amount, input.laborHours ?? null, now],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before adding the estimate");
    await this.recordEvent(input.roId, "recommendation_added", input.actorId, "manual", null, { id, description: input.description, amount: input.amount, laborHours: input.laborHours ?? null });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after adding the estimate");
    return record;
  }

  async updateRecommendation(input: { userId: string; roId: string; id: string; expectedVersion: number; actorId: string; description?: string; amount?: number; laborHours?: number | null }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before updating the recommendation");
    const before = await this.sql.query<{ description: string; amount: string | number; labor_hours: string | number | null }>("select description, amount, labor_hours from ro_recommendations where id = $1 and ro_id = $2", [input.id, input.roId]);
    if (!before[0]) throw new Error("Recommendation not found");
    const updated = await this.sql.query<{ id: string }>("update ro_recommendations set description = coalesce($1, description), amount = coalesce($2, amount), labor_hours = case when $3::boolean then $4 else labor_hours end where id = $5 and ro_id = $6 returning id", [input.description ?? null, input.amount ?? null, input.laborHours !== undefined, input.laborHours ?? null, input.id, input.roId]);
    if (!updated[0]) throw new Error("Recommendation not found");
    const changed = await this.sql.query<{ id: string }>("update repair_orders set local_changed_at = now(), updated_at = now(), version = version + 1, sync_status = 'pending' where id = $1 and user_id = $2 and version = $3 returning id", [input.roId, input.userId, input.expectedVersion]);
    if (!changed[0]) throw new Error("Repair order changed elsewhere; refresh before updating the recommendation");
    await this.recordEvent(input.roId, "recommendation_updated", input.actorId, "mcp", before[0], { description: input.description, amount: input.amount, laborHours: input.laborHours });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after recommendation update");
    return record;
  }

  async decideRecommendation(input: { userId: string; roId: string; id: string; state: "recommended" | "approved" | "declined"; expectedVersion: number; actorId: string; source?: string }): Promise<RepairOrderRecord> {
    const updated = await this.sql.query<{ id: string }>(
      `with target as (
        select id from repair_orders where id = $3 and user_id = $4 and version = $5 for update
      ), decision as (
        update ro_recommendations recommendation set state = $1, decided_at = case when $1 = 'recommended' then null else now() end
        where recommendation.id = $2 and recommendation.ro_id = (select id from target)
        returning recommendation.id
      ), totals as (
        -- A data-modifying CTE's table effects are not visible to a sibling
        -- base-table scan. Project this decision into each aggregate instead.
        select coalesce(sum(amount) filter (where case when id = $2 then $1 else state end = 'recommended'), 0) as recommended_total,
               coalesce(sum(amount) filter (where case when id = $2 then $1 else state end = 'approved'), 0) as approved_total,
               coalesce(sum(amount) filter (where case when id = $2 then $1 else state end = 'declined'), 0) as declined_total
        from ro_recommendations where ro_id = $3
      )
      update repair_orders ro set recommended_total = totals.recommended_total, approved_total = totals.approved_total,
        declined_total = totals.declined_total, local_changed_at = now(), updated_at = now(), version = version + 1, sync_status = 'pending'
      from totals where ro.id = $3 and ro.user_id = $4 and ro.version = $5 and exists (select 1 from decision)
      returning ro.id`,
      [input.state, input.id, input.roId, input.userId, input.expectedVersion],
    );
    if (!updated[0]) throw new Error("Recommendation changed elsewhere; refresh before trying again");
    await this.recordEvent(input.roId, "recommendation_state_changed", input.actorId, input.source ?? "manual", { id: input.id }, { id: input.id, state: input.state });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after recommendation update");
    return record;
  }

  /** Creates an RO using existing customer/vehicle records when supplied. */
  async createRepairOrder(input: {
    userId: string; actorId: string; roNumber: string; customerId?: string; vehicleId?: string;
    customerName?: string; year?: number; make?: string; model?: string; trim?: string; mileage?: number;
    concern?: string; workflowState?: WorkflowState; appointmentAt?: string | null; promiseAt?: string | null;
    notes?: string; transportation?: string; waitingCustomer?: boolean;
  }): Promise<RepairOrderRecord> {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    let customerId = input.customerId;
    let vehicleId = input.vehicleId;
    if (customerId) {
      if (!(await this.sql.query<{ id: string }>("select id from service_customers where id = $1 and user_id = $2", [customerId, input.userId]))[0]) throw new Error("Customer not found");
    } else {
      if (!input.customerName?.trim()) throw new Error("customer_name or customer_id is required");
      customerId = crypto.randomUUID();
      await this.sql.query("insert into service_customers (id, user_id, full_name) values ($1,$2,$3)", [customerId, input.userId, input.customerName.trim()]);
    }
    if (vehicleId) {
      if (!(await this.sql.query<{ id: string }>("select id from service_vehicles where id = $1 and user_id = $2 and customer_id = $3", [vehicleId, input.userId, customerId]))[0]) throw new Error("Vehicle not found");
    } else {
      if (!input.model?.trim()) throw new Error("model or vehicle_id is required");
      vehicleId = crypto.randomUUID();
      await this.sql.query("insert into service_vehicles (id, user_id, customer_id, model_year, make, model, trim, mileage) values ($1,$2,$3,$4,$5,$6,$7,$8)", [vehicleId, input.userId, customerId, input.year ?? null, input.make ?? "Toyota", input.model.trim(), input.trim ?? null, input.mileage ?? null]);
    }
    const state = input.workflowState ?? "written";
    await this.sql.query(`insert into repair_orders (id,user_id,ro_number,customer_id,vehicle_id,advisor_id,appointment_at,arrived_at,written_at,promised_at,waiting_customer,transportation,workflow_state,state_entered_at,concern,local_changed_at,version) values ($1,$2,$3,$4,$5,$6,$7,$7,$7,$8,$9,$10,$11,$7,$12,$7,1)`, [id, input.userId, input.roNumber.trim(), customerId, vehicleId, input.actorId, input.appointmentAt ?? now, input.promiseAt ?? null, input.waitingCustomer ?? false, input.transportation ?? "unknown", state, input.concern?.trim() ?? null]);
    await this.sql.query("insert into ro_status_history (id,ro_id,previous_state,new_state,occurred_at,source,actor_id,notes) values ($1,$2,null,$3,$4,'mcp',$5,'Created through Toyota Dashboard MCP')", [crypto.randomUUID(), id, state, now, input.actorId]);
    if (input.notes?.trim()) await this.recordInternalNote({ userId: input.userId, roId: id, actorId: input.actorId, note: input.notes.trim(), source: "mcp" });
    await this.recordEvent(id, "ro_created", input.actorId, "mcp", null, { roNumber: input.roNumber.trim(), state });
    const record = await this.getById(input.userId, id);
    if (!record) throw new Error("Repair order could not be created");
    return record;
  }

  async createManual(input: { id?: string; userId: string; actorId: string; roNumber: string; customerName: string; preferredName?: string; phone?: string; email?: string; preferredContactMethod?: string; communicationConsent?: string; year?: number; make?: string; model: string; trim?: string; vin?: string; mileage?: number; licensePlate?: string; concern?: string; technicianName?: string; transportation: string; waitingCustomer: boolean; promiseAt: string; updateIntervalMinutes: number }): Promise<RepairOrderRecord> {
    const id = input.id ?? crypto.randomUUID();
    const customerId = crypto.randomUUID();
    const vehicleId = crypto.randomUUID();
    const now = new Date().toISOString();
    await this.sql.query(
      "insert into service_customers (id, user_id, full_name, preferred_name, phone, email, preferred_contact_method, communication_consent) values ($1,$2,$3,$4,$5,$6,$7,$8)",
      [customerId, input.userId, input.customerName, input.preferredName ?? null, input.phone ?? null, input.email ?? null, input.preferredContactMethod ?? "phone", input.communicationConsent ?? "unknown"],
    );
    await this.sql.query(
      "insert into service_vehicles (id, user_id, customer_id, vin, model_year, make, model, trim, mileage, license_plate) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [vehicleId, input.userId, customerId, input.vin ?? null, input.year ?? null, input.make ?? "Toyota", input.model, input.trim ?? null, input.mileage ?? null, input.licensePlate ?? null],
    );
    const due = new Date(Date.parse(now) + input.updateIntervalMinutes * 60_000).toISOString();
    await this.sql.query(
      `insert into repair_orders (id, user_id, ro_number, customer_id, vehicle_id, advisor_id, technician_name, appointment_at, arrived_at, written_at, promised_at, waiting_customer, transportation, workflow_state, state_entered_at, concern, next_update_due_at, update_interval_minutes, local_changed_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$8,$8,$9,$10,$11,'written',$8,$12,$13,$14,$8)`,
      [id, input.userId, input.roNumber, customerId, vehicleId, input.actorId, input.technicianName ?? null, now, input.promiseAt, input.waitingCustomer, input.transportation, input.concern ?? null, due, input.updateIntervalMinutes],
    );
    await this.sql.query(
      "insert into ro_status_history (id, ro_id, previous_state, new_state, occurred_at, source, actor_id, notes) values ($1,$2,null,'written',$3,'manual',$4,'Manual quick intake')",
      [crypto.randomUUID(), id, now, input.actorId],
    );
    await this.recordEvent(id, "ro_created", input.actorId, "manual", null, { roNumber: input.roNumber, source: "manual" });
    const record = await this.getById(input.userId, id);
    if (!record) throw new Error("Repair order could not be created");
    return record;
  }

  async transition(input: { userId: string; roId: string; to: WorkflowState; expectedVersion: number; actorId: string; source: string; reason?: string; notes?: string; override?: boolean }): Promise<RepairOrderRecord> {
    const currentRows = await this.sql.query<{ workflow_state: WorkflowState; version: number }>(
      "select workflow_state, version from repair_orders where id = $1 and user_id = $2", [input.roId, input.userId],
    );
    const current = currentRows[0];
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before trying again");
    assertTransition(current.workflow_state, input.to, input.override);
    const now = new Date().toISOString();
    const updated = await this.sql.query<{ id: string }>(
      `update repair_orders set previous_state = $1, workflow_state = $2, state_entered_at = $3,
       local_changed_at = $3, updated_at = $3, version = version + 1, sync_status = 'pending'
       where id = $4 and user_id = $5 and version = $6 returning id`,
      [current.workflow_state, input.to, now, input.roId, input.userId, input.expectedVersion],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before trying again");
    await this.recordEvent(input.roId, "status_changed", input.actorId, input.source, current.workflow_state, input.to, input.notes);
    await this.sql.query(
      "insert into ro_status_history (id, ro_id, previous_state, new_state, occurred_at, source, actor_id, reason, notes) values ($1,$2,$3,$4,$5,$6,$7,$8,$9)",
      [crypto.randomUUID(), input.roId, current.workflow_state, input.to, now, input.source, input.actorId, input.reason ?? null, input.notes ?? null],
    );
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after update");
    return record;
  }

  /**
   * Applies a small allowlisted set of operational fields under the same
   * optimistic lock as workflow changes. Callers never choose SQL columns.
   */
  async updateOperational(input: { userId: string; roId: string; expectedVersion: number; actorId: string; promiseAt?: string | null; appointmentAt?: string | null; technicianName?: string | null; technicianFindings?: string | null; diagnosis?: string | null; concern?: string | null; partsStatus?: string; partsEtaAt?: string | null; source?: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before trying again");
    const fields: Array<[keyof Pick<typeof input, "promiseAt" | "appointmentAt" | "technicianName" | "technicianFindings" | "diagnosis" | "concern" | "partsStatus" | "partsEtaAt">, string, keyof RepairOrderRecord]> = [
      ["promiseAt", "promised_at", "promiseAt"], ["appointmentAt", "appointment_at", "appointmentAt"], ["technicianName", "technician_name", "technicianName"], ["technicianFindings", "technician_findings", "technicianFindings"], ["diagnosis", "diagnosis", "diagnosis"], ["concern", "concern", "concern"], ["partsStatus", "parts_status", "partsStatus"], ["partsEtaAt", "parts_eta_at", "partsEtaAt"],
    ];
    const changed = fields.filter(([key, , recordKey]) => input[key] !== undefined && input[key] !== current[recordKey]);
    if (!changed.length) return current;
    const values = changed.map(([key]) => input[key]);
    const assignments = changed.map(([, column], index) => `${column} = $${index + 1}`);
    const nowIndex = values.length + 1;
    const updated = await this.sql.query<{ id: string }>(`update repair_orders set ${assignments.join(", ")}, local_changed_at = $${nowIndex}, updated_at = $${nowIndex}, version = version + 1, sync_status = 'pending' where id = $${nowIndex + 1} and user_id = $${nowIndex + 2} and version = $${nowIndex + 3} returning id`, [...values, new Date().toISOString(), input.roId, input.userId, input.expectedVersion]);
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before trying again");
    const previous = Object.fromEntries(changed.map(([key, , recordKey]) => [key, current[recordKey]]));
    const next = Object.fromEntries(changed.map(([key]) => [key, input[key]]));
    await this.recordEvent(input.roId, "operational_fields_updated", input.actorId, input.source ?? "manual", previous, next);
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after update");
    return record;
  }

  /** Sets the per-RO customer update cadence and immediately recalculates its due time. */
  async setUpdateInterval(input: { userId: string; roId: string; expectedVersion: number; intervalMinutes: number; actorId: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before changing the update interval");
    if (current.updateIntervalMinutes === input.intervalMinutes) return current;
    const nextDue = current.lastCustomerContactAt
      ? new Date(Date.parse(current.lastCustomerContactAt) + input.intervalMinutes * 60_000).toISOString()
      : current.nextUpdateDueAt;
    const now = new Date().toISOString();
    const updated = await this.sql.query<{ id: string }>(
      `update repair_orders set update_interval_minutes = $1, next_update_due_at = $2,
       local_changed_at = $3, updated_at = $3, version = version + 1, sync_status = 'pending'
       where id = $4 and user_id = $5 and version = $6 returning id`,
      [input.intervalMinutes, nextDue, now, input.roId, input.userId, input.expectedVersion],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before changing the update interval");
    await this.recordEvent(input.roId, "customer_update_interval_changed", input.actorId, "manual", {
      intervalMinutes: current.updateIntervalMinutes, nextUpdateDueAt: current.nextUpdateDueAt,
    }, { intervalMinutes: input.intervalMinutes, nextUpdateDueAt: nextDue });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after update interval change");
    return record;
  }

  async recordContact(input: { userId: string; roId: string; expectedVersion: number; actorId: string; method: "phone" | "sms" | "email" | "in_person" | "voicemail"; summary: string; message?: string; outcome?: string; intervalMinutes: number; source?: string }): Promise<RepairOrderRecord> {
    const existing = await this.getById(input.userId, input.roId);
    if (!existing) throw new Error("Repair order not found");
    if (existing.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before recording contact");
    const now = new Date();
    const due = new Date(now.getTime() + input.intervalMinutes * 60_000);
    // Lock the timer update before inserting a sent communication, preventing
    // a stale inspector from creating a misleading confirmed-contact record.
    const updated = await this.sql.query<{ id: string }>(
      "update repair_orders set last_customer_contact_at = $1, next_update_due_at = $2, pending_callback = false, local_changed_at = $1, updated_at = $1, version = version + 1, sync_status = 'pending' where id = $3 and user_id = $4 and version = $5 returning id",
      [now.toISOString(), due.toISOString(), input.roId, input.userId, input.expectedVersion],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before recording contact");
    await this.sql.query(
      "insert into ro_communications (id, ro_id, occurred_at, method, direction, advisor_id, summary, message, outcome, source, ai_generated, sent) values ($1,$2,$3,$4,'outgoing',$5,$6,$7,$8,$9,false,true)",
      [crypto.randomUUID(), input.roId, now.toISOString(), input.method, input.actorId, input.summary, input.message ?? null, input.outcome ?? null, input.source ?? "manual"],
    );
    await this.recordEvent(input.roId, "customer_contacted", input.actorId, input.source ?? "manual", null, { method: input.method, summary: input.summary });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after contact");
    return record;
  }

  /** Stores an advisor-only note in the immutable RO activity stream. */
  async recordInternalNote(input: { userId: string; roId: string; actorId: string; note: string; source?: string }): Promise<void> {
    if (!(await this.getById(input.userId, input.roId))) throw new Error("Repair order not found");
    const now = new Date().toISOString();
    await this.sql.query(
      "insert into ro_communications (id, ro_id, occurred_at, method, direction, advisor_id, summary, source, ai_generated, sent) values ($1,$2,$3,'internal_note','internal',$4,$5,$6,false,false)",
      [crypto.randomUUID(), input.roId, now, input.actorId, input.note, input.source ?? "manual"],
    );
    await this.recordEvent(input.roId, "internal_note_added", input.actorId, input.source ?? "manual", null, { note: input.note });
  }

  async assign(input: { userId: string; roId: string; advisorId: string; actorId: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (!(await this.sql.query<{ id: string }>('select id from "user" where id = $1', [input.advisorId]))[0]) throw new Error("Assignee not found");
    const updated = await this.sql.query<{ id: string }>("update repair_orders set advisor_id = $1, local_changed_at = now(), updated_at = now(), version = version + 1, sync_status = 'pending' where id = $2 and user_id = $3 returning id", [input.advisorId, input.roId, input.userId]);
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before assigning");
    await this.recordEvent(input.roId, "advisor_assigned", input.actorId, "mcp", null, { advisorId: input.advisorId });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after assignment");
    return record;
  }

  async close(input: { userId: string; roId: string; expectedVersion: number; actorId: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.state === "delivered") throw new Error("Repair order is already closed");
    if (current.state !== "ready") throw new Error(`Cannot close repair order from ${current.state}; move it to ready first`);
    await this.transition({ userId: input.userId, roId: input.roId, to: "delivered", expectedVersion: input.expectedVersion, actorId: input.actorId, source: "mcp", reason: "Explicitly closed through Toyota Dashboard MCP" });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after closing");
    return record;
  }

  async addBlocker(input: { userId: string; roId: string; actorId: string; type: string; description: string; severity: string; owner?: string; expectedVersion: number; source?: string }): Promise<RepairOrderRecord> {
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order not found");
    if (record.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before adding a blocker");
    const now = new Date().toISOString();
    const blockerId = crypto.randomUUID();
    const updated = await this.sql.query<{ id: string }>(
      `with target as (
        select id from repair_orders where id = $1 and user_id = $2 and version = $3 for update
      ), inserted as (
        insert into ro_blockers (id, ro_id, blocker_type, description, severity, owner, source, created_at)
        select $4, $1, $5, $6, $7, $8, 'manual', $9 where exists (select 1 from target) returning id
      )
      update repair_orders set local_changed_at = $9, updated_at = $9, version = version + 1, sync_status = 'pending'
      where id = $1 and user_id = $2 and version = $3 and exists (select 1 from inserted) returning id`,
      [input.roId, input.userId, input.expectedVersion, blockerId, input.type, input.description, input.severity, input.owner ?? null, now],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before adding a blocker");
    await this.recordEvent(input.roId, "blocker_added", input.actorId, input.source ?? "manual", null, { type: input.type, description: input.description });
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order disappeared after adding a blocker");
    return current;
  }

  /** Resolves one active blocker without affecting other blockers on the RO. */
  async resolveBlocker(input: { userId: string; roId: string; blockerId: string; expectedVersion: number; actorId: string; source?: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before resolving the blocker");
    const openBlockers = await this.sql.query<{ blocker_type: string; description: string; severity: string }>(
      "select b.blocker_type, b.description, b.severity from ro_blockers b join repair_orders ro on ro.id = b.ro_id where b.id = $1 and b.ro_id = $2 and ro.user_id = $3 and b.resolved_at is null",
      [input.blockerId, input.roId, input.userId],
    );
    const blocker = openBlockers[0];
    if (!blocker) throw new Error("Active blocker not found");
    const now = new Date().toISOString();
    const updated = await this.sql.query<{ id: string }>(
      `with target as (
        select id from repair_orders where id = $1 and user_id = $2 and version = $3 for update
      ), resolved as (
        update ro_blockers set resolved_at = $4 where id = $5 and ro_id = $1 and resolved_at is null and exists (select 1 from target) returning id
      )
      update repair_orders set local_changed_at = $4, updated_at = $4, version = version + 1, sync_status = 'pending'
      where id = $1 and user_id = $2 and version = $3 and exists (select 1 from resolved) returning id`,
      [input.roId, input.userId, input.expectedVersion, now, input.blockerId],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before resolving the blocker");
    await this.recordEvent(input.roId, "blocker_resolved", input.actorId, input.source ?? "manual", blocker, { ...blocker, resolvedAt: now });
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after blocker resolution");
    return record;
  }

  /**
   * Resolves only the local conflict marker. It never writes an external copy,
   * so a connector must subsequently reconcile against the source using this
   * new version rather than overwriting data it has not re-read.
   */
  async resolveSyncConflict(input: { userId: string; roId: string; expectedVersion: number; actorId: string }): Promise<RepairOrderRecord> {
    const current = await this.getById(input.userId, input.roId);
    if (!current) throw new Error("Repair order not found");
    if (current.version !== input.expectedVersion) throw new Error("Repair order changed elsewhere; refresh before resolving the conflict");
    if (!current.conflictState) throw new Error("No sync conflict requires resolution");
    const nextSyncStatus = current.sourceSystem === "manual" ? "local-only" : "pending";
    const now = new Date().toISOString();
    const updated = await this.sql.query<{ id: string }>(
      `update repair_orders set conflict_state = null, sync_error = null, sync_status = $1,
       local_changed_at = $2, updated_at = $2, version = version + 1
       where id = $3 and user_id = $4 and version = $5 and conflict_state is not null returning id`,
      [nextSyncStatus, now, input.roId, input.userId, input.expectedVersion],
    );
    if (!updated[0]) throw new Error("Repair order changed elsewhere; refresh before resolving the conflict");
    await this.recordEvent(input.roId, "sync_conflict_resolved", input.actorId, "manual", {
      conflictState: current.conflictState, syncError: current.syncError, syncStatus: current.syncStatus,
    }, { strategy: "retain_local", syncStatus: nextSyncStatus }, "Local record retained; no external system was overwritten.");
    const record = await this.getById(input.userId, input.roId);
    if (!record) throw new Error("Repair order disappeared after sync conflict resolution");
    return record;
  }

  async getOperationalHistory(userId: string, roId: string): Promise<{ events: OperationalEvent[]; communications: CommunicationRecord[]; blockers: BlockerRecord[]; statusHistory: StatusTransitionRecord[] }> {
    if (!(await this.getById(userId, roId))) throw new Error("Repair order not found");
    const [events, communications, blockers, statusHistory] = await Promise.all([
      this.sql.query<{ id: string; event_type: string; occurred_at: string; source: string; notes: string | null; previous_value: unknown; new_value: unknown }>("select id, event_type, occurred_at, source, notes, previous_value, new_value from ro_events where ro_id = $1 order by occurred_at desc", [roId]),
      this.sql.query<{ id: string; occurred_at: string; method: string; direction: string; advisor_id: string | null; summary: string; message: string | null; outcome: string | null; customer_response: string | null; source: string; sent: boolean; ai_generated: boolean }>("select id, occurred_at, method, direction, advisor_id, summary, message, outcome, customer_response, source, sent, ai_generated from ro_communications where ro_id = $1 order by occurred_at desc", [roId]),
      this.sql.query<{ id: string; blocker_type: string; description: string; severity: string; owner: string | null; created_at: string; resolved_at: string | null }>("select id, blocker_type, description, severity, owner, created_at, resolved_at from ro_blockers where ro_id = $1 order by resolved_at nulls first, created_at desc", [roId]),
      this.sql.query<{ id: string; previous_state: WorkflowState | null; new_state: WorkflowState; occurred_at: string; source: string; actor_id: string | null; reason: string | null; notes: string | null }>("select id, previous_state, new_state, occurred_at, source, actor_id, reason, notes from ro_status_history where ro_id = $1 order by occurred_at asc", [roId]),
    ]);
    return { events: events.map((event) => ({ id: event.id, roId, type: event.event_type, occurredAt: event.occurred_at, source: event.source, notes: event.notes, previousValue: event.previous_value == null ? null : JSON.stringify(event.previous_value), newValue: event.new_value == null ? null : JSON.stringify(event.new_value) })), communications: communications.map((item) => ({ id: item.id, occurredAt: item.occurred_at, method: item.method, direction: item.direction, advisorId: item.advisor_id, summary: item.summary, message: item.message, outcome: item.outcome, customerResponse: item.customer_response, source: item.source, sent: item.sent, aiGenerated: item.ai_generated })), blockers: blockers.map((blocker) => ({ id: blocker.id, type: blocker.blocker_type, description: blocker.description, severity: blocker.severity, owner: blocker.owner, createdAt: blocker.created_at, resolvedAt: blocker.resolved_at })), statusHistory: statusHistory.map((item) => ({ id: item.id, previousState: item.previous_state, newState: item.new_state, occurredAt: item.occurred_at, source: item.source, actorId: item.actor_id, reason: item.reason, notes: item.notes })) };
  }

  async recentChanges(userId: string, since: string): Promise<OperationalEvent[]> {
    const events = await this.sql.query<{ id: string; ro_id: string; ro_number: string; full_name: string; event_type: string; occurred_at: string; source: string; notes: string | null; previous_value: unknown; new_value: unknown }>(
      "select e.id, e.ro_id, ro.ro_number, customer.full_name, e.event_type, e.occurred_at, e.source, e.notes, e.previous_value, e.new_value from ro_events e join repair_orders ro on ro.id = e.ro_id join service_customers customer on customer.id = ro.customer_id where ro.user_id = $1 and e.occurred_at >= $2 order by e.occurred_at asc", [userId, since],
    );
    return events.map((event) => ({ id: event.id, roId: event.ro_id, roNumber: event.ro_number, customerName: event.full_name, type: event.event_type, occurredAt: event.occurred_at, source: event.source, notes: event.notes, previousValue: event.previous_value == null ? null : JSON.stringify(event.previous_value), newValue: event.new_value == null ? null : JSON.stringify(event.new_value) }));
  }

  async getById(userId: string, roId: string): Promise<RepairOrderRecord | null> {
    const rows = await this.sql.query<RoRow>(`${SELECT_RO} where ro.user_id = $1 and ro.id = $2`, [userId, roId]);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  private async recordEvent(roId: string, eventType: string, actorId: string, source: string, previousValue: unknown, newValue: unknown, notes?: string): Promise<void> {
    await this.sql.query(
      "insert into ro_events (id, ro_id, event_type, actor_id, source, previous_value, new_value, notes) values ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)",
      [crypto.randomUUID(), roId, eventType, actorId, source, JSON.stringify(previousValue), JSON.stringify(newValue), notes ?? null],
    );
  }
}
