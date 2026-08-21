import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { RepairOrderRepository } from "@/lib/ro-repository.server";
import { buildVerifiedRoFacts } from "@/lib/ro-ai-context";

export const REWRITE_MODES = [
  "update_technical",
  "update_simple",
  "update_text",
  "update_phone",
  "update_recommend",
  "update_declined",
  "note_ro",
  "note_customer",
  "note_internal",
  "concern",
] as const;

export type RewriteMode = (typeof REWRITE_MODES)[number];

const MODE_INSTRUCTIONS: Record<RewriteMode, string> = {
  update_technical:
    "Write a precise technical explanation suitable for a knowledgeable customer. Keep part names, positions (RF/LF), measurements, and codes exactly as given. 2–4 sentences.",
  update_simple:
    "Write a plain-language customer explanation. Avoid jargon; if a technical term is required, briefly explain it. 2–4 sentences. Warm, calm, not salesy.",
  update_text:
    "Write a concise SMS (max 320 characters) a service advisor can send. No greeting essay. Include the finding and the ask (approval, pickup, or update) only if present in the source.",
  update_phone:
    "Write short phone-call talking points as 4–7 bullet lines (use • ). Start with the finding, then the recommendation, then the ask. Spoken cadence, not a script dump.",
  update_recommend:
    "Write a repair recommendation the advisor can read or send. State what should be done and why, using only facts in the source. Do not invent labor times, prices, or failure risks that are not stated.",
  update_declined:
    "Write a declined-service explanation the advisor can put on the RO and share with the customer: what was found, what was recommended, and that the customer declined, without pressure or invented consequences.",
  note_ro:
    "Rewrite as a professional repair-order concern/diagnosis note. Dealership documentation tone. Complete sentences. Preserve every fact, code, measurement, and position.",
  note_customer:
    "Rewrite as a plain-language customer version of the same facts. No extra technical detail that was not in the source.",
  note_internal:
    "Rewrite as a short internal operational summary for the advisor (1–2 sentences). Keep the action implied by the source.",
  concern:
    "Convert the customer's description into a clean diagnostic concern in service-advisor style, starting with 'Customer states' when appropriate. Preserve intermittence, speeds, temperatures, and frequencies. Do not diagnose.",
};

type Input = {
  mode: RewriteMode;
  source: string;
  tone?: "concise" | "warm";
  vehicle?: string;
  concern?: string;
};

export const rewriteAdvisorText = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: Input) => {
    const source = (input.source ?? "").trim();
    return {
      mode: input.mode,
      source,
      tone: input.tone === "warm" ? "warm" : "concise",
      vehicle: input.vehicle?.trim() || undefined,
      concern: input.concern?.trim() || undefined,
    };
  })
  .handler(async ({ data }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available in this environment" };
    if (!data.source) return { ok: false as const, error: "Nothing to rewrite" };
    const mode = MODE_INSTRUCTIONS[data.mode];
    if (!mode) return { ok: false as const, error: "Unknown mode" };

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "You write for a Toyota dealership service advisor. Never invent findings, parts, prices, times, or risks that are not in the source. If the source is thin, say so briefly rather than filling gaps. No emoji. No sales language.",
          },
          {
            role: "user",
            content: `${mode}\n\nPreferred tone: ${data.tone}\nVehicle: ${data.vehicle ?? "—"}\nConcern: ${data.concern ?? "—"}\n\nSource:\n${data.source}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `OpenAI API error ${res.status}` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return { ok: true as const, text: body.choices[0]?.message.content ?? "" };
  });

/**
 * Customer drafts may only use a server-loaded, allowlisted RO fact object.
 * Creating a draft never records contact or implies that a message was sent.
 */
export const draftVerifiedCustomerUpdate = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: { roId?: string; tone?: "concise" | "warm"; mode?: RewriteMode }) => ({
    roId: String(input.roId ?? ""),
    tone: input.tone === "warm" ? "warm" : "concise",
    mode: input.mode && input.mode.startsWith("update_") ? input.mode : "update_simple" as RewriteMode,
  }))
  .handler(async ({ data, context }) => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available in this environment" };
    const ro = await (await RepairOrderRepository.connect()).getById(context.userId, data.roId);
    if (!ro) return { ok: false as const, error: "Repair order not found" };
    const facts = buildVerifiedRoFacts(ro);
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "gpt-4.1-mini", max_tokens: 220,
        messages: [
          { role: "system", content: `Draft one customer-safe dealership update. ${MODE_INSTRUCTIONS[data.mode] ?? MODE_INSTRUCTIONS.update_simple} Use only the supplied JSON facts. Never infer or invent diagnoses, parts, prices, labor, availability, completion times, safety consequences, warranties, discounts, or policy. Omit missing fields. This is a draft only; do not claim it was sent.` },
          { role: "user", content: JSON.stringify({ tone: data.tone, facts }) },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `OpenAI API error ${res.status}` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return { ok: true as const, text: body.choices[0]?.message.content ?? "", facts };
  });
