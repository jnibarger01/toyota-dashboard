import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { projectRepairOrder } from "@/lib/ro-projection";
import { buildFollowUpTriage } from "@/lib/follow-up-triage";

const reason = z.enum(["update_overdue", "authorization", "parts_eta", "diagnosis_done", "ready", "declined", "manual", "deferred_maintenance", "post_service", "unsold_recommendation", "appointment_needed", "parts_arrival", "customer_callback", "internal_follow_up"]);
const outcome = z.enum(["open", "called", "texted", "voicemail", "responded", "later", "completed"]);
const text = (max: number) => z.string().trim().min(1).max(max);

export const getServiceFollowUps = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => (await FollowUpRepository.connect()).list(context.userId));
export const getServiceFollowUpTriage = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => {
  const [lane, followUps] = await Promise.all([(await RepairOrderRepository.connect()).listForLane(context.userId), (await FollowUpRepository.connect()).list(context.userId)]);
  return buildFollowUpTriage(followUps, lane.map((item) => projectRepairOrder(item.record, item.recommendations, item.blockers)), Date.now());
});
export const createServiceFollowUp = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.string().min(1).max(120).optional(), roId: z.string().uuid(), reason, label: text(500), callbackAt: z.string().datetime().nullable().optional(), estimatedOpportunity: z.number().min(0).max(1_000_000).optional(), note: z.string().trim().max(4000).optional(), createdManually: z.boolean().optional() })).handler(async ({ data, context }) => (await FollowUpRepository.connect()).create({ ...data, userId: context.userId }));
export const setServiceFollowUpOutcome = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.string().min(1).max(120), outcome })).handler(async ({ data, context }) => (await FollowUpRepository.connect()).setOutcome(context.userId, data.id, data.outcome));
