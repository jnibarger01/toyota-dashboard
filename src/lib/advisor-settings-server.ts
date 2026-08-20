import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { AdvisorSettingsRepository } from "@/lib/advisor-settings-repository.server";
import { AI_DRAFTING_MODES, TRANSPORT_TYPES } from "@/lib/types";

const settingsInput = z.object({
  advisorName: z.string().trim().min(1).max(120), storeName: z.string().trim().min(1).max(160),
  updateIntervalMin: z.number().int().min(1).max(1440), waitingUpdateIntervalMin: z.number().int().min(1).max(1440),
  approvalDelayWarningMin: z.number().int().min(1).max(1440), promiseRiskWarningMin: z.number().int().min(1).max(1440),
  highDollarThreshold: z.number().min(0).max(1_000_000), defaultTransportation: z.enum(TRANSPORT_TYPES),
  aiDefaultTone: z.enum(["concise", "warm"]), aiEnabledModes: z.array(z.enum(AI_DRAFTING_MODES)).min(1).max(AI_DRAFTING_MODES.length), appearance: z.enum(["system", "light", "dark"]),
});

export const getAdvisorSettings = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => new AdvisorSettingsRepository(await getSql()).get(context.userId));
export const saveAdvisorSettings = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(settingsInput).handler(async ({ context, data }) => new AdvisorSettingsRepository(await getSql()).save(context.userId, { ...data, stallMinutes: {} }));
