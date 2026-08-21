import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { WORKFLOW_STATES } from "@/lib/ro-domain";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const shape = {
  ro_number: z.string().trim().min(1).max(40), customer_id: z.string().min(1).max(120).optional(), vehicle_id: z.string().min(1).max(120).optional(),
  customer_name: z.string().trim().min(1).max(200).optional(), year: z.number().int().min(1900).max(2200).optional(), make: z.string().trim().min(1).max(80).optional(), model: z.string().trim().min(1).max(120).optional(), trim: z.string().trim().max(120).optional(), mileage: z.number().int().min(0).max(2_000_000).optional(), concern: z.string().trim().max(4000).optional(), status: z.enum(WORKFLOW_STATES).optional(), appointment_at: z.string().datetime().optional(), promise_at: z.string().datetime().optional(), notes: z.string().trim().max(4000).optional(), transportation: z.string().trim().max(40).optional(), waiting_customer: z.boolean().optional(),
};

export function registerCreateRepairOrder(server: McpServer): void {
  server.registerTool("create_repair_order", { title: "Create repair order", description: "Creates a Toyota Dashboard-owned repair order. Reuses existing customer_id and vehicle_id when supplied; otherwise creates the missing owned customer/vehicle intake records. Does not connect to Reynolds or any external DMS.", inputSchema: z.strictObject(shape), annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } }, (args, extra) => {
    const denied = checkScope(extra, SCOPES.RO_WRITE); if (denied) return denied;
    return safeToolCall("create_repair_order", async () => {
      const { userId, tokenId, requestId } = requireWriteContext(extra); const sql = await (await import("../../db.ts")).getSql();
      try {
        const record = await new RepairOrderRepository(sql).createRepairOrder({ userId, actorId: userId, roNumber: args.ro_number, customerId: args.customer_id, vehicleId: args.vehicle_id, customerName: args.customer_name, year: args.year, make: args.make, model: args.model, trim: args.trim, mileage: args.mileage, concern: args.concern, workflowState: args.status, appointmentAt: args.appointment_at, promiseAt: args.promise_at, notes: args.notes, transportation: args.transportation, waitingCustomer: args.waiting_customer });
        await recordMcpAudit(sql, { userId, tokenId, requestId, toolName: "create_repair_order", entityType: "repair_order", entityId: record.id, previousValue: null, newValue: { roNumber: record.roNumber, state: record.state, concern: record.concern } });
        return textResult({ roId: record.id, roNumber: record.roNumber, customer: record.customerName.split(/\s+/)[0], vehicle: record.vehicle, status: record.state, version: record.version });
      } catch (err) { return domainErrorResult(err, ["Customer not found", "Vehicle not found", "customer_name or customer_id is required", "model or vehicle_id is required"]); }
    });
  });
}
