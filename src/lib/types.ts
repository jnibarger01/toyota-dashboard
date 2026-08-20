export const RO_STATUSES = [
  "checked_in",
  "waiting_technician",
  "diagnosing",
  "waiting_video",
  "recommendations_ready",
  "waiting_approval",
  "approved",
  "waiting_parts",
  "repair_in_progress",
  "quality_check",
  "ready_for_pickup",
  "completed",
] as const;

export type RoStatus = (typeof RO_STATUSES)[number];

export const STATUS_LABELS: Record<RoStatus, string> = {
  checked_in: "Checked In",
  waiting_technician: "Waiting for Technician",
  diagnosing: "Diagnosing",
  waiting_video: "Waiting for Video",
  recommendations_ready: "Recommendations Ready",
  waiting_approval: "Waiting for Customer Approval",
  approved: "Approved",
  waiting_parts: "Waiting for Parts",
  repair_in_progress: "Repair in Progress",
  quality_check: "Quality Check",
  ready_for_pickup: "Ready for Pickup",
  completed: "Completed",
};

export const TRANSPORT_TYPES = ["waiting", "shuttle", "rental", "loaner", "dropoff"] as const;
export type TransportType = (typeof TRANSPORT_TYPES)[number];

export const TRANSPORT_LABELS: Record<TransportType, string> = {
  waiting: "Waiting",
  shuttle: "Shuttle",
  rental: "Rental",
  loaner: "Loaner",
  dropoff: "Drop-off",
};

export const CONTACT_PREFS = ["call", "text", "email"] as const;
export type ContactPref = (typeof CONTACT_PREFS)[number];

export const CONTACT_PREF_LABELS: Record<ContactPref, string> = {
  call: "Call",
  text: "Text",
  email: "Email",
};

export const LINE_STATES = ["recommended", "approved", "declined"] as const;
export type LineState = (typeof LINE_STATES)[number];

export type RepairLine = {
  id: string;
  description: string;
  amount: number;
  hours: number;
  state: LineState;
};

export type TimelineEvent = {
  id: string;
  at: string;
  label: string;
  kind: "status" | "contact" | "approval" | "note" | "assign" | "intake" | "parts" | "other";
};

export type FollowUpOutcome =
  | "open"
  | "called"
  | "texted"
  | "voicemail"
  | "responded"
  | "later"
  | "completed";

export type FollowUpReason =
  | "update_overdue"
  | "authorization"
  | "parts_eta"
  | "diagnosis_done"
  | "ready"
  | "declined"
  | "manual"
  | "deferred_maintenance"
  | "post_service"
  | "unsold_recommendation"
  | "appointment_needed"
  | "parts_arrival"
  | "customer_callback"
  | "internal_follow_up";

export type FollowUp = {
  id: string;
  roId: string;
  reason: FollowUpReason;
  label: string;
  outcome: FollowUpOutcome;
  callbackAt: string | null;
  createdAt: string;
  note: string;
  estimatedOpportunity: number;
  createdManually?: boolean;
};

export type ScratchNote = {
  id: string;
  text: string;
  createdAt: string;
};

export type RepairOrder = {
  id: string;
  roNumber: string;
  customerName: string;
  customerPhone: string;
  vehicle: string;
  year: number;
  mileage: number;
  vin: string;
  technician: string;
  advisor: string;
  appointmentTime: string;
  status: RoStatus;
  statusChangedAt: string;
  concern: string;
  diagnosis: string;
  lines: RepairLine[];
  contactPref: ContactPref;
  lastCustomerUpdate: string | null;
  nextUpdateDue: string | null;
  notes: string;
  transportation: TransportType;
  promiseTime: string;
  timeline: TimelineEvent[];
  createdAt: string;
  techNotes: string;
  carryover?: boolean;
  comeback?: boolean;
  /** Open blocker types from the authoritative RO record. */
  blockers?: string[];
};

export type AppSettings = {
  advisorName: string;
  storeName: string;
  updateIntervalMin: number;
  waitingUpdateIntervalMin: number;
  approvalDelayWarningMin: number;
  promiseRiskWarningMin: number;
  defaultTransportation: TransportType;
  aiDefaultTone: "concise" | "warm";
  aiEnabledModes: AiDraftingMode[];
  appearance: "system" | "light" | "dark";
  stallMinutes: Partial<Record<RoStatus, number>>;
  highDollarThreshold: number;
};

export const AI_DRAFTING_MODES = ["update_technical", "update_simple", "update_text", "update_phone", "update_recommend", "update_declined", "note_ro", "note_customer", "note_internal", "concern"] as const;
export type AiDraftingMode = (typeof AI_DRAFTING_MODES)[number];

export type BoardFilter =
  | "all"
  | "waiting_customers"
  | "updates_overdue"
  | "approval_pending"
  | "parts_pending"
  | "blockers"
  | "ready"
  | "high_dollar"
  | "stalled"
  | "promise_risk"
  | "declined_work"
  | "waiting_technician"
  | "carryovers"
  | "comebacks"
  | "delivered";

export const TECHNICIANS = [
  "Diego Ruiz",
  "Priya Shah",
  "Marcus Hale",
  "Jordan Blake",
  "Chris Nguyen",
  "Unassigned",
] as const;

export const DEFAULT_SETTINGS: AppSettings = {
  advisorName: "Service Advisor",
  storeName: "Service Drive",
  updateIntervalMin: 90,
  waitingUpdateIntervalMin: 25,
  approvalDelayWarningMin: 25,
  promiseRiskWarningMin: 30,
  defaultTransportation: "dropoff",
  aiDefaultTone: "concise",
  aiEnabledModes: [...AI_DRAFTING_MODES],
  appearance: "system",
  highDollarThreshold: 1500,
  stallMinutes: {
    checked_in: 20,
    waiting_technician: 35,
    diagnosing: 70,
    waiting_video: 40,
    recommendations_ready: 20,
    waiting_approval: 25,
    approved: 20,
    waiting_parts: 90,
    repair_in_progress: 180,
    quality_check: 25,
    ready_for_pickup: 30,
  },
};

export type ComposerTool = "update" | "cleaner" | "concern" | "scratch";

export type ComposerState = {
  tool: ComposerTool;
  roId: string | null;
  source: string;
} | null;
