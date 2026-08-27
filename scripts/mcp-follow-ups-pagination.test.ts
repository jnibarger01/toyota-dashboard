import assert from "node:assert/strict";
import test from "node:test";
import { listFollowUpsInputSchema, paginateFollowUps } from "../src/lib/mcp/follow-up-pagination.ts";

test("list_follow_ups validates bounded pagination strictly", () => {
  assert.deepEqual(listFollowUpsInputSchema.parse({ limit: 2, offset: 3 }), { limit: 2, offset: 3 });
  assert.throws(() => listFollowUpsInputSchema.parse({ limit: 0 }), /too_small/);
  assert.throws(() => listFollowUpsInputSchema.parse({ limit: 51 }), /too_big/);
  assert.throws(() => listFollowUpsInputSchema.parse({ offset: -1 }), /too_small/);
  assert.throws(() => listFollowUpsInputSchema.parse({ offset: 10_001 }), /too_big/);
  assert.throws(() => listFollowUpsInputSchema.parse({ unexpected: true }), /Unrecognized key/);
});

test("paginateFollowUps returns deterministic page metadata", () => {
  assert.deepEqual(paginateFollowUps(["a", "b", "c"], 1, 1), { page: ["b"], total: 3, returned: 1, hasMore: true, nextOffset: 2 });
  assert.deepEqual(paginateFollowUps(["a", "b", "c"], 2, 2), { page: ["c"], total: 3, returned: 1, hasMore: false, nextOffset: null });
});
