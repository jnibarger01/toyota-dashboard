import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { DEFAULT_SETTINGS } from "@/lib/types";
import type { LaneSnapshot } from "@/lib/store";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { projectRepairOrder } from "@/lib/ro-projection";
import { AdvisorSettingsRepository } from "@/lib/advisor-settings-repository.server";
import { ScratchRepository } from "@/lib/scratch-repository.server";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";

function emptySnapshot(): LaneSnapshot { return { ros: [], followUps: [], scratch: [], settings: { ...DEFAULT_SETTINGS }, seededAt: Date.now() }; }

export const loadLane = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const repository = await RepairOrderRepository.connect();
  const normalized = await repository.listForLane(context.userId);
  const baseline = emptySnapshot();
  const sql = await (await import("@/lib/db")).getSql();
  const settings = await new AdvisorSettingsRepository(sql).get(context.userId, baseline.settings);
  const scratchRepository = new ScratchRepository(sql);
  const scratch = await scratchRepository.list(context.userId);
  const followUpsRepository = new FollowUpRepository(sql);
  const followUps = await followUpsRepository.list(context.userId);
  return { ...baseline, settings, scratch, followUps, ros: normalized.map(({ record, recommendations, blockers }) => projectRepairOrder(record, recommendations, blockers)) };
});
