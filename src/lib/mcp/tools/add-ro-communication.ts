import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { SCOPES } from "../scopes";
import { recordMcpAudit } from "../audit";
import { checkScope, domainErrorResult, errorResult, requireWriteContext, safeToolCall, textResult } from "../tool-helpers";

const inputShape = {
  repair_order_id: z.string().uuid(),
  expected_version: z.number().int().positive(),
  method: z.enum(["phone", "sms", "email", "in_person", "voicemail"]),
  summary: z.string().trim().min(1).max(1000).describe("Short internal summary of what was communicated, e.g. \"Called with brake estimate, approved.\""),
  outcome: z.string().trim().min(1).max(500).optional(),
  interval_minutes: z.number().int().min(1).max(24 * 60).optional().describe("Minutes until the next customer update is due. Defaults to the RO's own current update interval."),
};

export function registerAddRoCommunication(server: McpServer): void {
  server.registerTool(
    "add_ro_communication",
    {
      title: "Add repair order communication",
      description:
        "Records that a customer communication occurred and resets the RO's next-update timer. This is a DOCUMENTATION tool — it never sends an SMS, email, or call; it only logs that one already happened.",
      inputSchema: z.strictObject(inputShape),
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    (args, extra) => {
      const scopeError = checkScope(extra, SCOPES.COMMUNICATION_WRITE);
      if (scopeError) return scopeError;
      return safeToolCall("add_ro_communication", async () => {
        const { userId, tokenId, requestId } = requireWriteContext(extra);
        const { getSql } = await import("../../db.ts");
        const sql = await getSql();
        const repository = new RepairOrderRepository(sql);

        const current = await repository.getById(userId, args.repair_order_id);
        if (!current) return errorResult("Repair order not found");

        try {
          const updated = await repository.recordContact({
            userId,
            roId: args.repair_order_id,
            expectedVersion: args.expected_version,
            actorId: userId,
            method: args.method,
            summary: args.summary,
            outcome: args.outcome,
            intervalMinutes: args.interval_minutes ?? current.updateIntervalMinutes,
            source: "mcp",
          });

          const [newest] = await sql.query<{ id: string }>(
            "select id from ro_communications where ro_id = $1 order by occurred_at desc, id desc limit 1",
            [args.repair_order_id],
          );

          // Deliberately excludes `summary`/`outcome` free text from the audit
          // row — it's advisor shorthand about the conversation and may
          // reference customer-supplied details; keep the audit to structural
          // state only (matches how get_repair_order's `communication` field
          // is also state-only, never message content).
          await recordMcpAudit(sql, {
            userId,
            tokenId,
            requestId,
            toolName: "add_ro_communication",
            entityType: "ro_communication",
            entityId: newest?.id ?? args.repair_order_id,
            previousValue: null,
            newValue: { method: args.method, sent: true },
          });

          return textResult({
            roId: updated.id,
            roNumber: updated.roNumber,
            version: updated.version,
            method: args.method,
            lastCustomerContactAt: updated.lastCustomerContactAt,
            nextUpdateDueAt: updated.nextUpdateDueAt,
          });
        } catch (err) {
          return domainErrorResult(err, ["Repair order not found", "Repair order changed elsewhere; refresh before recording contact"]);
        }
      });
    },
  );
}
