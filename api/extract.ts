import type OpenAI from "openai";
import { grokClient, grokJson } from "./grok";

export const maxDuration = 60;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "concepts"],
  properties: {
    summary: { type: "string" },
    concepts: { type: "array", items: { type: "string" } },
  },
};

interface ExtractBody {
  name?: string;
  text?: string;
  images?: string[];
}

export async function POST(request: Request): Promise<Response> {
  const client = grokClient();
  if (client instanceof Response) return client;
  const body = (await request.json()) as ExtractBody;
  if (!body.name || (!body.text && !body.images?.length)) {
    return Response.json({ error: "Expected a name and text or images." }, { status: 400 });
  }

  const content: OpenAI.Responses.ResponseInputContent[] = [];
  for (const image of body.images ?? []) {
    content.push({ type: "input_image", image_url: image, detail: "high" });
  }
  content.push({
    type: "input_text",
    text: [
      "These are a student's notes.",
      "Give a 1–2 sentence summary of what the notes cover and 3–6 key concepts as short noun phrases.",
      `File: ${body.name}`,
      body.text ? `Notes:\n${body.text.slice(0, 8000)}` : "The notes are in the images.",
    ].join("\n\n"),
  });

  try {
    const parsed = await grokJson(client.model, client.openai, "extract", schema, content);
    const result = validate(parsed);
    if (!result) return Response.json({ error: "Grok returned an unusable summary." }, { status: 502 });
    return Response.json(result);
  } catch {
    return Response.json({ error: "Grok request failed." }, { status: 502 });
  }
}

function validate(value: unknown): { summary: string; concepts: string[] } | null {
  if (!value || typeof value !== "object") return null;
  const summary = "summary" in value ? value.summary : undefined;
  const concepts = "concepts" in value ? value.concepts : undefined;
  if (typeof summary !== "string" || summary.trim().length < 8) return null;
  if (!Array.isArray(concepts)) return null;
  const phrases = concepts.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  if (phrases.length < 3) return null;
  return { summary: summary.trim(), concepts: phrases.slice(0, 6).map((item) => item.trim()) };
}
