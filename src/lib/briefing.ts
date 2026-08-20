import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

type BriefInput = {
  orgName: string;
  summary: string;
};

export const writeShiftBriefing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator((input: BriefInput) => ({
    orgName: (input.orgName ?? "").slice(0, 80),
    summary: (input.summary ?? "").slice(0, 4000),
  }))
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available in this environment" };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 420,
        messages: [
          {
            role: "system",
            content:
              "You write night-shift fleet dispatch briefings. Tone: calm, specific, operational. No fluff, no emoji. 4 short sections: Attention, Rolling, Yard, Ask. Use only facts in the user payload. 140-200 words.",
          },
          {
            role: "user",
            content: `Org: ${data.orgName}\n\nLive board:\n${data.summary}`,
          },
        ],
      }),
    });
    if (!res.ok) return { ok: false as const, error: `xAI API error ${res.status}` };
    const body = (await res.json()) as { choices: { message: { content: string } }[] };
    return { ok: true as const, text: body.choices[0]?.message.content ?? "" };
  });
