import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.MCP_URL;
const fullToken = process.env.MCP_TOKEN;
const readToken = process.env.MCP_READONLY_TOKEN;
const otherToken = process.env.MCP_OTHER_USER_TOKEN;
let failures = 0;
function check(label, ok) { if (ok) console.log(`ok - ${label}`); else { console.error(`FAIL - ${label}`); failures += 1; } }
function clientFor(token) { const client = new Client({ name: "toyota-v03-http-smoke", version: "1.0.0" }); const transport = new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${token}` } } }); return { client, transport }; }
async function call(client, name, args = {}) { const result = await client.callTool({ name, arguments: args }); check(`${name} returned a protocol result`, Array.isArray(result.content)); return result; }
function data(result) { return JSON.parse(result.content?.find((item) => item.type === "text")?.text ?? "{}"); }
async function main() {
  const { client, transport } = clientFor(fullToken); await client.connect(transport);
  const listed = await client.listTools(); const names = new Set(listed.tools.map((tool) => tool.name));
  const expected = ["get_lane_summary","list_repair_orders","get_repair_order","list_blocked_repair_orders","list_follow_ups","get_recommendations","search_repair_orders","create_repair_order","update_repair_order","update_repair_order_status","update_repair_order_notes","close_repair_order","assign_repair_order","add_ro_blocker","resolve_ro_blocker","add_ro_communication","create_follow_up","complete_follow_up","add_recommendation","update_recommendation","update_recommendation_status"];
  check("tools/list exposes all 21 read/write tools", expected.every((name) => names.has(name)));
  check("get_lane_summary is read-only annotated", listed.tools.find((tool) => tool.name === "get_lane_summary")?.annotations?.readOnlyHint === true);
  check("create_repair_order is mutating annotated", listed.tools.find((tool) => tool.name === "create_repair_order")?.annotations?.readOnlyHint === false);
  const resources = await client.listResources();
  check("Apps SDK lane resource is listed", resources.resources.some((resource) => resource.uri === "ui://toyota-dashboard/service-lane.html"));
  const widget = await client.readResource({ uri: "ui://toyota-dashboard/service-lane.html" });
  check("Apps SDK lane resource loads with the required MIME type", widget.contents.some((content) => content.mimeType === "text/html;profile=mcp-app" && String(content.text ?? "").includes("Create repair order")));
  const lane = await call(client, "get_lane_summary"); check("lane summary is usable", !lane.isError && typeof data(lane).activeCount === "number");

  const created = await call(client, "create_repair_order", { ro_number: "SMOKE-CREATED", customer_name: "Created Customer", model: "Camry", year: 2025, mileage: 1200, concern: "Oil service", promise_at: new Date(Date.now() + 3600000).toISOString(), waiting_customer: true });
  check("create_repair_order succeeds", !created.isError); const createdData = data(created); const roId = createdData.roId; let version = createdData.version;
  const detail = await call(client, "get_repair_order", { ro_id: roId }); const detailData = data(detail); check("created RO reads back", detailData.roId === roId && detailData.roNumber === "SMOKE-CREATED");
  const updated = await call(client, "update_repair_order", { repair_order_id: roId, expected_version: version, diagnosis: "Service due" }); check("update_repair_order succeeds", !updated.isError); version = data(updated).version;
  const noted = await call(client, "update_repair_order_notes", { repair_order_id: roId, note: "Smoke note" }); check("update_repair_order_notes succeeds", !noted.isError);
  const blocked = await call(client, "add_ro_blocker", { repair_order_id: roId, expected_version: version, type: "parts", description: "Smoke parts blocker", severity: "medium" }); check("add_ro_blocker succeeds", !blocked.isError); const blockedData = data(blocked); version = blockedData.version;
  const resolved = await call(client, "resolve_ro_blocker", { repair_order_id: roId, blocker_id: blockedData.blocker.id, expected_version: version }); check("resolve_ro_blocker succeeds", !resolved.isError); version = data(resolved).version;
  const contact = await call(client, "add_ro_communication", { repair_order_id: roId, expected_version: version, method: "phone", summary: "Smoke documentation", outcome: "approved" }); check("add_ro_communication succeeds without outbound side effect", !contact.isError); version = data(contact).version;
  const rec = await call(client, "add_recommendation", { repair_order_id: roId, expected_version: version, description: "Smoke tire rotation", amount: 80 }); check("add_recommendation succeeds", !rec.isError); const recData = data(rec); version = recData.version;
  const recUpdate = await call(client, "update_recommendation", { repair_order_id: roId, recommendation_id: recData.recommendationId, expected_version: version, amount: 95 }); check("update_recommendation succeeds", !recUpdate.isError); version = data(recUpdate).version;
  const recStatus = await call(client, "update_recommendation_status", { repair_order_id: roId, recommendation_id: recData.recommendationId, expected_version: version, status: "approved" }); check("update_recommendation_status succeeds", !recStatus.isError); version = data(recStatus).version;
  const follow = await call(client, "create_follow_up", { repair_order_id: roId, reason: "customer_callback", label: "Smoke callback", due_at: new Date(Date.now() + 3600000).toISOString() }); check("create_follow_up succeeds", !follow.isError); const followData = data(follow);
  const complete = await call(client, "complete_follow_up", { follow_up_id: followData.followUpId }); check("complete_follow_up succeeds", !complete.isError);
  const statusPath = ["dispatched","diagnosing","estimate_ready","awaiting_approval","approved","repairing","qc","ready"];
  for (const status of statusPath) { const result = await call(client, "update_repair_order_status", { repair_order_id: roId, status, expected_version: version }); check(`status transition to ${status} succeeds`, !result.isError); if (!result.isError) version = data(result).version; }
  const closed = await call(client, "close_repair_order", { repair_order_id: roId, expected_version: version }); check("close_repair_order succeeds", !closed.isError && data(closed).status === "delivered");
  const reread = await call(client, "get_repair_order", { ro_id: roId }); check("final state is visible through read tool", data(reread).status.state === "delivered");
  const secondClose = await call(client, "close_repair_order", { repair_order_id: roId, expected_version: data(reread).version }); check("already closed RO is rejected", secondClose.isError === true);
  await client.close();

  const roClient = clientFor(readToken); await roClient.client.connect(roClient.transport); const deniedScope = await call(roClient.client, "create_repair_order", { ro_number: "SHOULD-NOT-CREATE", customer_name: "Nope", model: "Corolla" }); check("read-only token cannot mutate", deniedScope.isError === true && /scope/i.test(deniedScope.content?.[0]?.text ?? "")); await roClient.client.close();
  const otherClient = clientFor(otherToken); await otherClient.client.connect(otherClient.transport); const deniedOwner = await call(otherClient.client, "update_repair_order_notes", { repair_order_id: roId, note: "Cross-user attempt" }); check("other user cannot mutate owned RO", deniedOwner.isError === true); await otherClient.client.close();
  process.exitCode = failures ? 1 : 0;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
