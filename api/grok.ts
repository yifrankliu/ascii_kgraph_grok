import OpenAI from "openai";

const missing = "Set XAI_API_KEY and XAI_MODEL on the Vercel project.";

export function grokClient(): { openai: OpenAI; model: string } | Response {
  const apiKey = process.env.XAI_API_KEY;
  const model = process.env.XAI_MODEL;
  if (!apiKey || !model) return Response.json({ error: missing }, { status: 503 });
  return {
    model,
    openai: new OpenAI({ apiKey, baseURL: "https://api.x.ai/v1", timeout: 55_000 }),
  };
}

export async function grokJson(
  model: string,
  openai: OpenAI,
  name: string,
  schema: Record<string, unknown>,
  content: OpenAI.Responses.ResponseInputContent[],
): Promise<unknown> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await openai.responses.create({
        model,
        reasoning: { effort: "low" },
        text: { format: { type: "json_schema", name, strict: true, schema } },
        input: [{ role: "user", content }],
      });
      return JSON.parse(response.output_text);
    } catch (error) {
      last = error;
    }
  }
  throw last;
}
