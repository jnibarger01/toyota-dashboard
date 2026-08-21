/**
 * Vocabularies mirrored from `src/lib/types.ts` (`FollowUpReason`,
 * `FollowUpOutcome`) which has no runtime const array to import — these are
 * the single shared copy used by both the follow-up read and write tools.
 */
export const FOLLOW_UP_REASONS = [
  "update_overdue",
  "authorization",
  "parts_eta",
  "diagnosis_done",
  "ready",
  "declined",
  "manual",
  "deferred_maintenance",
  "post_service",
  "unsold_recommendation",
  "appointment_needed",
  "parts_arrival",
  "customer_callback",
  "internal_follow_up",
] as const;

export const FOLLOW_UP_OUTCOMES = ["open", "called", "texted", "voicemail", "responded", "later", "completed"] as const;
