import assert from "node:assert/strict";
import test from "node:test";
import { DemoAdapter, ManualAdapter, NotConnectedAdapter, type ExternalRepairOrder } from "../src/lib/integrations.ts";

const sample: ExternalRepairOrder = {
  externalId: "demo-ro-1",
  sourceSystem: "demo",
  updatedAt: "2026-08-20T12:00:00.000Z",
  payload: { roNumber: "DEMO-1" },
};

test("demo and manual adapters are explicit local modes, not provider connections", async () => {
  const demo = new DemoAdapter([sample]);
  const manual = new ManualAdapter(async () => [sample]);
  assert.equal(demo.mode, "demo");
  assert.equal(manual.mode, "manual");
  assert.equal(demo.status, "not_connected");
  assert.deepEqual(await demo.fetchRepairOrder("demo-ro-1"), sample);
  assert.deepEqual(await manual.fetchOpenRepairOrders(), [sample]);
});

test("unconfigured provider adapters fail closed rather than returning fabricated records", async () => {
  const adapter = new NotConnectedAdapter("xtime", "Xtime");
  await assert.rejects(() => adapter.fetchOpenRepairOrders(), /not connected/);
});
