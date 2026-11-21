// AI coach for the trading journal. Runs on Supabase so the AI key never reaches the browser.
// Callers must present the journal's sync key; only a key that has a journal in the database is served.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SYSTEM = `You are a trading performance coach inside a personal trading journal. The trader shares their journal data (statistics, recent trades, notes, tagged mistakes, account rules) as JSON.

How to respond:
- Talk like an experienced, supportive human coach: direct, warm, specific. No lectures, no generic trading clichés.
- Ground every observation in the numbers or notes you were given, and quote the figure. If the sample is too small to conclude something (for example fewer than ~20 trades), say so plainly and treat patterns as early signals, not facts.
- Focus on behaviour, risk management, execution, discipline and psychology: sizing, stop discipline, trading after losses, time of day, rule breaks, holding losers versus winners, proximity to account limits.
- When something went wrong, explain what happened, why it likely happened, and give one to three concrete, testable actions for the next session.
- Notice what the trader did well too.
- Never give investment advice: no predictions, no telling the trader what or when to buy or sell, no price targets. You coach the process, not the market.
- Keep it concise: short paragraphs or a few bullets. Plain text with simple "-" bullets; no tables.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const { key, messages, journal, language } = await req.json();
    if (typeof key !== "string" || key.length < 40 || key.length > 200) return json({ error: "Turn on sync in Settings to use the coach." }, 401);
    if (!Array.isArray(messages) || messages.length === 0 || messages.length > 40) return json({ error: "Invalid conversation." }, 400);

    // Only serve keys that own a journal.
    const check = await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/rpc/sj_get`, {
      method: "POST",
      headers: {
        apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_key: key }),
    });
    const rows = check.ok ? await check.json() : [];
    if (!Array.isArray(rows) || rows.length === 0) return json({ error: "This journal is not synced yet. Turn on sync in Settings first." }, 401);

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "not_configured" }, 503);

    const journalText = JSON.stringify(journal ?? {}).slice(0, 60000);
    const clean = messages
      .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 6000) }));

    const ai = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: Deno.env.get("COACH_MODEL") || "claude-sonnet-5-5",
        max_tokens: 1400,
        system: `${SYSTEM}\n\nAlways answer in ${language === "en" ? "English" : "Hebrew"}.\n\nThe trader's journal data:\n${journalText}`,
        messages: clean,
      }),
    });
    const data = await ai.json();
    if (!ai.ok) return json({ error: data?.error?.message || `AI service error (${ai.status})` }, 502);
    const text = (data.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n");
    return json({ text });
  } catch (e) {
    return json({ error: (e as Error).message || "Unexpected error" }, 500);
  }
});
