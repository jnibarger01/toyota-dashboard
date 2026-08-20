import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { FollowUpRepository } from "@/lib/follow-up-repository.server";

const reason = z.enum(["update_overdue", "authorization", "parts_eta", "diagnosis_done", "ready", "declined", "manual", "deferred_maintenance", "post_service", "unsold_recommendation", "appointment_needed", "parts_arrival", "customer_callback", "internal_follow_up"]);
const outcome = z.enum(["open", "called", "texted", "voicemail", "responded", "later", "completed"]);
const text = (max: number) => z.string().trim().min(1).max(max);

export const getServiceFollowUps = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => (await FollowUpRepository.connect()).list(context.userId));
export const createServiceFollowUp = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.string().min(1).max(120).optional(), roId: z.string().uuid(), reason, label: text(500), callbackAt: z.string().datetime().nullable().optional(), estimatedOpportunity: z.number().min(0).max(1_000_000).optional(), note: z.string().trim().max(4000).optional(), createdManually: z.boolean().optional() })).handler(async ({ data, context }) => (await FollowUpRepository.connect()).create({ ...data, userId: context.userId }));
export const setServiceFollowUpOutcome = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.string().min(1).max(120), outcome })).handler(async ({ data, context }) => (await FollowUpRepository.connect()).setOutcome(context.userId, data.id, data.outcome));
