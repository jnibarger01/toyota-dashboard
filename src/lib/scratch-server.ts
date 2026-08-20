import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";
import { ScratchRepository } from "@/lib/scratch-repository.server";

export const getScratchNotes = createServerFn({ method: "GET" }).middleware([authMiddleware]).handler(async ({ context }) => new ScratchRepository(await getSql()).list(context.userId));
export const createScratchNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.string().min(1).max(200), text: z.string().trim().min(1).max(2000) })).handler(async ({ context, data }) => new ScratchRepository(await getSql()).create({ ...data, userId: context.userId }));
export const removeScratchNote = createServerFn({ method: "POST" }).middleware([authMiddleware]).validator(z.object({ id: z.string().min(1).max(200) })).handler(async ({ context, data }) => {
  await new ScratchRepository(await getSql()).remove({ ...data, userId: context.userId });
  return { ok: true as const };
});
