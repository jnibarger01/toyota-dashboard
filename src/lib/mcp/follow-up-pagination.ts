import { z } from "zod";
import { FOLLOW_UP_OUTCOMES } from "./domain-constants.ts";

export const FOLLOW_UP_PAGE_DEFAULT_LIMIT = 20;
export const FOLLOW_UP_PAGE_MAX_LIMIT = 50;
export const FOLLOW_UP_PAGE_MAX_OFFSET = 10_000;

export const listFollowUpsInputSchema = z.strictObject({
  due_before: z.string().datetime().optional().describe("ISO 8601 timestamp; only follow-ups due at or before this time."),
  status: z.enum(FOLLOW_UP_OUTCOMES).optional().describe("Filter to one outcome; omit for all."),
  limit: z.number().int().min(1).max(FOLLOW_UP_PAGE_MAX_LIMIT).optional().describe(`Max rows to return (default ${FOLLOW_UP_PAGE_DEFAULT_LIMIT}, hard max ${FOLLOW_UP_PAGE_MAX_LIMIT}).`),
  offset: z.number().int().min(0).max(FOLLOW_UP_PAGE_MAX_OFFSET).optional().describe(`Rows to skip (default 0, hard max ${FOLLOW_UP_PAGE_MAX_OFFSET}).`),
});

export function paginateFollowUps<T>(items: T[], offset: number, limit: number): { page: T[]; total: number; returned: number; hasMore: boolean; nextOffset: number | null } {
  const page = items.slice(offset, offset + limit);
  const hasMore = offset + page.length < items.length;
  return { page, total: items.length, returned: page.length, hasMore, nextOffset: hasMore ? offset + page.length : null };
}
