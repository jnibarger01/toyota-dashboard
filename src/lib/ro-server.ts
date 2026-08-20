import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { BLOCKER_TYPES, WORKFLOW_STATES } from "@/lib/ro-domain";
import { RepairOrderRepository } from "@/lib/ro-repository.server";

const trim = (max: number) => z.string().trim().max(max);

/** Authenticated query surface used by the advisor lane and copilot tools. */
export const getActiveRepairOrders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => (await RepairOrderRepository.connect()).listActive(context.userId));

export const getRepairOrderHistory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).getOperationalHistory(context.userId, data.roId));

export const getRepairOrderRecommendations = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).listRecommendations(context.userId, data.roId));

export const addRepairOrderRecommendation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), description: trim(500).min(1), amount: z.number().finite().min(0).max(100_000), laborHours: z.number().finite().min(0).max(100).optional(), expectedVersion: z.number().int().positive() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).addRecommendation({ ...data, userId: context.userId, actorId: context.userId }));

export const decideRepairOrderRecommendation = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), id: z.string().min(1).max(300), state: z.enum(["recommended", "approved", "declined"]), expectedVersion: z.number().int().positive() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).decideRecommendation({ ...data, userId: context.userId, actorId: context.userId }));

export const getRecentLaneChanges = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ since: z.string().datetime() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).recentChanges(context.userId, data.since));

export const createManualRepairOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({
    id: z.string().uuid().optional(),
    roNumber: trim(40).min(1), customerName: trim(160).min(1),
    year: z.number().int().min(1900).max(2100).optional(), make: trim(80).optional(), model: trim(100).min(1), trim: trim(100).optional(), concern: trim(4000).optional(),
    technicianName: trim(120).optional(), transportation: trim(40), waitingCustomer: z.boolean(), promiseAt: z.string().datetime(),
    updateIntervalMinutes: z.number().int().min(1).max(24 * 60),
  }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).createManual({ ...data, userId: context.userId, actorId: context.userId }));

export const transitionRepairOrder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), to: z.enum(WORKFLOW_STATES), expectedVersion: z.number().int().positive(), reason: trim(600).optional(), notes: trim(4000).optional(), override: z.boolean().optional() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).transition({ ...data, userId: context.userId, actorId: context.userId, source: "manual" }));

export const updateRepairOrderOperationalFields = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), expectedVersion: z.number().int().positive(), promiseAt: z.string().datetime().nullable().optional(), technicianName: trim(120).nullable().optional(), technicianFindings: trim(4000).nullable().optional(), diagnosis: trim(4000).nullable().optional(), partsStatus: trim(80).optional(), partsEtaAt: z.string().datetime().nullable().optional() }).refine((data) => [data.promiseAt, data.technicianName, data.technicianFindings, data.diagnosis, data.partsStatus, data.partsEtaAt].some((value) => value !== undefined), "At least one operational field is required"))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).updateOperational({ ...data, userId: context.userId, actorId: context.userId }));

export const setRepairOrderUpdateInterval = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), expectedVersion: z.number().int().positive(), intervalMinutes: z.number().int().min(1).max(24 * 60) }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).setUpdateInterval({ ...data, userId: context.userId, actorId: context.userId }));

/** Acknowledge a detected source conflict while retaining the local copy. */
export const resolveRepairOrderSyncConflict = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), expectedVersion: z.number().int().positive() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).resolveSyncConflict({ ...data, userId: context.userId, actorId: context.userId }));

export const recordCustomerContact = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), expectedVersion: z.number().int().positive(), method: z.enum(["phone", "sms", "email", "in_person", "voicemail"]), summary: trim(1000).min(1), message: trim(4000).optional(), outcome: trim(500).optional(), intervalMinutes: z.number().int().min(1).max(24 * 60) }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).recordContact({ ...data, userId: context.userId, actorId: context.userId }));

export const recordInternalRepairOrderNote = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), note: trim(4000).min(1) }))
  .handler(async ({ data, context }) => {
    await (await RepairOrderRepository.connect()).recordInternalNote({ ...data, userId: context.userId, actorId: context.userId });
    return { ok: true };
  });

export const addRepairOrderBlocker = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), type: z.enum(BLOCKER_TYPES), description: trim(2000).min(1), severity: z.enum(["low", "medium", "high", "critical"]), owner: trim(120).optional(), expectedVersion: z.number().int().positive() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).addBlocker({ ...data, userId: context.userId, actorId: context.userId }));

export const resolveRepairOrderBlocker = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ roId: z.string().uuid(), blockerId: z.string().uuid(), expectedVersion: z.number().int().positive() }))
  .handler(async ({ data, context }) => (await RepairOrderRepository.connect()).resolveBlocker({ ...data, userId: context.userId, actorId: context.userId }));
