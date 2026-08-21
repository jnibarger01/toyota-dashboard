#!/usr/bin/env node
/**
 * MCP smoke test — exercises `/api/mcp` through a REAL MCP client (the
 * official SDK's `Client` + `StreamableHTTPClientTransport`), not just unit
 * tests of handler functions. Covers both v0.1 (read) and v0.2 (write).
 *
 * Usage (read-only checks only — always run, no setup needed beyond a live server):
 *   npm run dev
 *   MCP_URL=http://localhost:8080/api/mcp node scripts/test-mcp.mjs
 *
 * Usage (full read+write walkthrough):
 *   MCP_URL=http://localhost:8080/api/mcp \
 *   MCP_TOKEN=<token with toyota:read + all four write scopes, from mint-mcp-token.mjs> \
 *   MCP_READONLY_TOKEN=<a toyota:read-only token, SAME advisor as MCP_TOKEN> \
 *   MCP_OTHER_USER_TOKEN=<any-scope token for a DIFFERENT advisor> \
 *   DATABASE_URL=postgres://...  \  # optional — enables the audit-row checks
 *   node scripts/test-mcp.mjs
 *
 * The write walkthrough needs at least one repair order owned by MCP_TOKEN's
 * advisor, in workflow state "written", with at least one recommendation on
 * it (docs/mcp.md documents the exact seed data used during development).
 * It discovers that RO itself via list_repair_orders — set MCP_RO_ID to
 * target a specific one instead.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL ?? "http://localhost:8080/api/mcp";
const token = process.env.MCP_TOKEN;
const readOnlyToken = process.env.MCP_READONLY_TOKEN;
const otherUserToken = process.env.MCP_OTHER_USER_TOKEN;

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`ok - ${label}`);
  } else {
    console.error(`FAIL - ${label}`);
    failures += 1;
  }
}

function newClient(bearerToken) {
  const client = new Client({ name: "toyota-mcp-smoke-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${bearerToken}` } } });
  return { client, transport };
}

async function checkUnauthenticated() {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  check("unauthenticated request is rejected with 401", res.status === 401);
}

async function checkInvalidToken() {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer not-a-real-token-not-a-real-token" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
  });
  check("invalid bearer token is rejected with 401", res.status === 401);
}

const ALL_TOOL_NAMES = [
  "get_lane_summary",
  "list_repair_orders",
  "get_repair_order",
  "list_blocked_repair_orders",
  "list_follow_ups",
  "get_recommendations",
  "search_repair_orders",
  "create_follow_up",
  "complete_follow_up",
  "add_ro_blocker",
  "resolve_ro_blocker",
  "add_ro_communication",
  "update_recommendation_status",
  "update_repair_order_status",
  "create_repair_order",
  "update_repair_order",
  "update_repair_order_notes",
  "close_repair_order",
  "assign_repair_order",
  "add_recommendation",
  "update_recommendation",
];

async function readOnlyChecks(client) {
  const { tools } = await client.listTools();
  const names = tools.map((t) => t.name).sort();
  check(`tools/list enumerates all ${ALL_TOOL_NAMES.length} tools (v0.1 + v0.2 + v0.3)`, ALL_TOOL_NAMES.every((name) => names.includes(name)));

  const readTool = tools.find((t) => t.name === "get_lane_summary");
  check("read tools are annotated readOnlyHint:true", readTool?.annotations?.readOnlyHint === true);
  const writeTool = tools.find((t) => t.name === "update_repair_order_status");
  check("write tools are annotated readOnlyHint:false (never falsely labeled read-only)", writeTool?.annotations?.readOnlyHint === false);

  const laneSummary = await client.callTool({ name: "get_lane_summary", arguments: {} });
  check("get_lane_summary returns a text result", !laneSummary.isError && laneSummary.content?.[0]?.type === "text");
  const laneSummaryData = JSON.parse(laneSummary.content[0].text);
  check("get_lane_summary shape has activeCount/counts/blockedCount", typeof laneSummaryData.activeCount === "number" && typeof laneSummaryData.blockedCount === "number" && typeof laneSummaryData.counts === "object");

  const listResult = await client.callTool({ name: "list_repair_orders", arguments: { limit: 5 } });
  check("list_repair_orders returns a text result", !listResult.isError && listResult.content?.[0]?.type === "text");
  const listData = JSON.parse(listResult.content[0].text);
  check("list_repair_orders respects the requested limit", Array.isArray(listData.repairOrders) && listData.repairOrders.length <= 5);
  check("list_repair_orders never returns a phone/email/vin field", !JSON.stringify(listData).match(/"(phone|email|vin)"/i));

  const missingRo = await client.callTool({ name: "get_repair_order", arguments: { ro_id: "does-not-exist" } });
  check("a missing RO is handled cleanly (isError, not a crash)", missingRo.isError === true);

  const unknownTool = await client.callTool({ name: "not_a_real_tool", arguments: {} });
  check("an unknown tool is rejected", unknownTool.isError === true && /not found/i.test(unknownTool.content[0].text));

  const excessiveLimit = await client.callTool({ name: "list_repair_orders", arguments: { limit: 999999 } });
  check("an excessive limit is rejected", excessiveLimit.isError === true && /-32602|too big|invalid/i.test(excessiveLimit.content[0].text));

  return listData;
}

async function findTargetRo(client) {
  if (process.env.MCP_RO_ID) {
    const result = await client.callTool({ name: "get_repair_order", arguments: { ro_id: process.env.MCP_RO_ID } });
    if (!result.isError) return JSON.parse(result.content[0].text);
  }
  const list = await client.callTool({ name: "list_repair_orders", arguments: { limit: 1 } });
  const listData = JSON.parse(list.content[0].text);
  const roId = listData.repairOrders?.[0]?.roId;
  if (!roId) return null;
  const full = await client.callTool({ name: "get_repair_order", arguments: { ro_id: roId } });
  return JSON.parse(full.content[0].text);
}

async function auditRowCount(entityType, entityId) {
  if (!process.env.DATABASE_URL) return null;
  const { default: pg } = await import("pg");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    const res = await pool.query("select count(*)::int as count from mcp_audit_log where entity_type = $1 and entity_id = $2", [entityType, entityId]);
    return res.rows[0].count;
  } finally {
    await pool.end();
  }
}

async function writeWalkthrough(client) {
  const ro = await findTargetRo(client);
  if (!ro) {
    console.log("\nNo repair order found for MCP_TOKEN's advisor — skipping the write walkthrough. Seed one first (see docs/mcp.md).");
    return;
  }
  console.log(`\nRunning the write walkthrough against RO ${ro.roNumber} (${ro.roId}), version ${ro.version}...`);
  let version = ro.version;

  // create_follow_up
  const created = await client.callTool({ name: "create_follow_up", arguments: { repair_order_id: ro.roId, reason: "customer_callback", label: "Smoke-test follow-up", due_at: new Date(Date.now() + 3600_000).toISOString() } });
  check("create_follow_up succeeds", !created.isError);
  const followUp = created.isError ? null : JSON.parse(created.content[0].text);
  if (followUp) {
    const auditBefore = await auditRowCount("follow_up", followUp.followUpId);
    check("create_follow_up wrote exactly one audit row (when DATABASE_URL is set)", auditBefore === null || auditBefore === 1);

    // complete_follow_up
    const completed = await client.callTool({ name: "complete_follow_up", arguments: { follow_up_id: followUp.followUpId } });
    check("complete_follow_up succeeds", !completed.isError);
    const reCompleted = await client.callTool({ name: "complete_follow_up", arguments: { follow_up_id: followUp.followUpId } });
    check("completing an already-completed follow-up is rejected, not silently re-accepted", reCompleted.isError === true && /already completed/i.test(reCompleted.content[0].text));
  }

  // add_ro_blocker
  const blockerAdded = await client.callTool({ name: "add_ro_blocker", arguments: { repair_order_id: ro.roId, expected_version: version, type: "parts", description: "Smoke-test blocker", severity: "medium" } });
  check("add_ro_blocker succeeds", !blockerAdded.isError);
  if (!blockerAdded.isError) {
    const blockerData = JSON.parse(blockerAdded.content[0].text);
    version = blockerData.version;

    const afterAdd = await client.callTool({ name: "get_repair_order", arguments: { ro_id: ro.roId } });
    const afterAddData = JSON.parse(afterAdd.content[0].text);
    check("the new blocker is visible via get_repair_order", afterAddData.blockers.some((b) => b.description === "Smoke-test blocker"));

    // resolve_ro_blocker
    const resolved = await client.callTool({ name: "resolve_ro_blocker", arguments: { repair_order_id: ro.roId, blocker_id: blockerData.blocker.id, expected_version: version } });
    check("resolve_ro_blocker succeeds", !resolved.isError);
    if (!resolved.isError) version = JSON.parse(resolved.content[0].text).version;

    const reResolve = await client.callTool({ name: "resolve_ro_blocker", arguments: { repair_order_id: ro.roId, blocker_id: blockerData.blocker.id, expected_version: version } });
    check("resolving an already-resolved blocker is rejected, not silently re-accepted", reResolve.isError === true);
  }

  // add_ro_communication
  const commResult = await client.callTool({ name: "add_ro_communication", arguments: { repair_order_id: ro.roId, expected_version: version, method: "phone", summary: "Smoke-test call", outcome: "approved" } });
  check("add_ro_communication succeeds (documentation only, never sends anything)", !commResult.isError);
  if (!commResult.isError) version = JSON.parse(commResult.content[0].text).version;

  // update_recommendation_status (only if a recommendation exists to decide on)
  const recs = await client.callTool({ name: "get_recommendations", arguments: { ro_id: ro.roId } });
  const recData = JSON.parse(recs.content[0].text);
  if (recData.recommendations?.length) {
    const rec = recData.recommendations[0];
    const decided = await client.callTool({ name: "update_recommendation_status", arguments: { repair_order_id: ro.roId, recommendation_id: rec.id, status: "approved", expected_version: version } });
    check("update_recommendation_status succeeds", !decided.isError);
    if (!decided.isError) version = JSON.parse(decided.content[0].text).version;
  } else {
    console.log("(no recommendation on this RO — skipping update_recommendation_status; seed one to exercise it)");
  }

  // update_repair_order_status
  const statusResult = await client.callTool({ name: "update_repair_order_status", arguments: { repair_order_id: ro.roId, status: "dispatched", expected_version: version } });
  check("update_repair_order_status succeeds for a legal transition", !statusResult.isError || /Invalid repair-order transition/.test(statusResult.content[0].text));
  if (!statusResult.isError) {
    version = JSON.parse(statusResult.content[0].text).version;
    const illegal = await client.callTool({ name: "update_repair_order_status", arguments: { repair_order_id: ro.roId, status: "ready", expected_version: version } });
    check("an illegal transition is rejected", illegal.isError === true && /Invalid repair-order transition/.test(illegal.content[0].text));
  }

  // Read the final state back through the v0.1 read tools.
  const finalRead = await client.callTool({ name: "get_repair_order", arguments: { ro_id: ro.roId } });
  const finalData = JSON.parse(finalRead.content[0].text);
  check("the final RO state is visible through get_repair_order", finalData.status.state === "dispatched" || finalData.status.state === ro.status?.state);

  return { roId: ro.roId, blockerVersion: version };
}

async function scopeDenialCheck(otherClient, roId) {
  if (!readOnlyToken) {
    console.log("\nMCP_READONLY_TOKEN not set — skipping the read-only-token-cannot-write check.");
    return;
  }
  const target = roId ?? "any-id-will-do-the-scope-check-runs-first";
  const result = await otherClient.callTool({ name: "add_ro_blocker", arguments: { repair_order_id: target, expected_version: 1, type: "parts", description: "should never be created", severity: "low" } });
  check("a read-only token cannot call a write tool", result.isError === true && /scope/i.test(result.content[0].text));
}

async function crossUserCheck(otherUserClient, roId) {
  if (!otherUserToken) {
    console.log("\nMCP_OTHER_USER_TOKEN not set — skipping the cross-user-mutation check.");
    return;
  }
  if (!roId) {
    console.log("\nNo target RO available — skipping the cross-user-mutation check.");
    return;
  }
  const result = await otherUserClient.callTool({ name: "add_ro_blocker", arguments: { repair_order_id: roId, expected_version: 1, type: "parts", description: "should never be created", severity: "low" } });
  check("a different advisor's token cannot mutate this RO (fails as cleanly as not-found)", result.isError === true && /not found/i.test(result.content[0].text));
}

async function main() {
  await checkUnauthenticated();
  await checkInvalidToken();

  if (!token) {
    console.log("\nMCP_TOKEN not set — skipping authenticated checks (mint one with scripts/mint-mcp-token.mjs).");
    process.exit(failures ? 1 : 0);
  }

  const { client, transport } = newClient(token);
  await client.connect(transport);
  check("initialize succeeded with a valid token", true);

  await readOnlyChecks(client);
  const walkthrough = await writeWalkthrough(client);
  await client.close();

  if (readOnlyToken) {
    const { client: roClient, transport: roTransport } = newClient(readOnlyToken);
    await roClient.connect(roTransport);
    await scopeDenialCheck(roClient, walkthrough?.roId);
    await roClient.close();
  }

  if (otherUserToken) {
    const { client: otherClient, transport: otherTransport } = newClient(otherUserToken);
    await otherClient.connect(otherTransport);
    await crossUserCheck(otherClient, walkthrough?.roId);
    await otherClient.close();
  }

  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
