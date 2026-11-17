import { grokClient, grokJson } from "./grok";

export const maxDuration = 60;

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["edges"],
  properties: {
    edges: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["source", "target", "note"],
        properties: {
          source: { type: "string" },
          target: { type: "string" },
          note: { type: "string" },
        },
      },
    },
  },
};

interface LinkFile {
  id: string;
  label: string;
  concepts: string[];
}

export async function POST(request: Request): Promise<Response> {
  const client = grokClient();
  if (client instanceof Response) return client;
  const body = (await request.json()) as { files?: LinkFile[] };
  const files = (body.files ?? []).filter((file) => file.id && Array.isArray(file.concepts));
  const known = new Set(files.map((file) => file.id));
  const prompt = [
    "Find pairs of notes that are meaningfully related, preferring pairs in different folders.",
    "At most 2 links per note. note says in under 12 words why they connect.",
    "Only use ids from the input.",
    JSON.stringify(files.map((file) => ({ id: file.id, label: file.label, concepts: file.concepts }))),
  ].join("\n\n");

  try {
    const parsed = await grokJson(client.model, client.openai, "link", schema, [
      { type: "input_text", text: prompt },
    ]);
    const edges = validate(parsed, known);
    if (!edges) return Response.json({ error: "Grok returned unusable links." }, { status: 502 });
    return Response.json({ edges });
  } catch {
    return Response.json({ error: "Grok request failed." }, { status: 502 });
  }
}

function validate(
  value: unknown,
  known: Set<string>,
): { source: string; target: string; note: string }[] | null {
  if (!value || typeof value !== "object" || !("edges" in value) || !Array.isArray(value.edges)) return null;
  const edges = [];
  for (const edge of value.edges) {
    if (!edge || typeof edge !== "object") continue;
    const source = "source" in edge ? edge.source : undefined;
    const target = "target" in edge ? edge.target : undefined;
    const note = "note" in edge ? edge.note : undefined;
    if (typeof source !== "string" || typeof target !== "string" || typeof note !== "string") continue;
    if (!known.has(source) || !known.has(target) || source === target) continue;
    edges.push({ source, target, note: note.trim() });
  }
  return edges;
}
