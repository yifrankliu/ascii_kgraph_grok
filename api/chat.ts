import { grokClient } from "./grok";

export const maxDuration = 60;

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

interface KnowledgeNote {
  path: string;
  label: string;
  summary?: string;
  concepts?: string[];
}

interface ChatBody {
  message?: string;
  history?: ChatTurn[];
  knowledge?: {
    title?: string;
    notes?: KnowledgeNote[];
    folders?: string[];
  };
}

const SYSTEM = [
  "You are grokbot, the study assistant inside kgraph — an ASCII knowledge graph of a Yale student's notes.",
  "Help them recall what they have learned, summarize specific notes, give short refreshers on topics in their graph, and suggest what to study or which Yale course to take next.",
  "Ground answers in the knowledge-base JSON when it is relevant. If a note is thin or missing, say so.",
  "When the user asks about Yale courses, catalogs, prerequisites, or what to take next, search current pages on catalog.yale.edu, courses.yale.edu, ocs.yale.edu, registrar.yale.edu, and yale.edu. Cite course codes and source URLs when you find them.",
  "Keep replies concise and plain text (no markdown tables). Use short paragraphs or bullet lines with '- '.",
  "Tone: helpful, direct, a little dry — matching a terminal UI.",
].join(" ");

export async function POST(request: Request): Promise<Response> {
  try {
    const client = grokClient();
    if (client instanceof Response) return client;

    const body = (await request.json()) as ChatBody;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) return Response.json({ error: "Expected a message." }, { status: 400 });

    const history = (body.history ?? [])
      .filter(
        (turn): turn is ChatTurn =>
          !!turn &&
          (turn.role === "user" || turn.role === "assistant") &&
          typeof turn.content === "string" &&
          turn.content.trim().length > 0,
      )
      .slice(-8);

    const transcript = history
      .map((turn) => `${turn.role === "user" ? "Student" : "Grokbot"}: ${turn.content.trim()}`)
      .join("\n");

    const prompt = [
      SYSTEM,
      "",
      "Student knowledge base (JSON):",
      serializeKnowledge(body.knowledge),
      transcript ? `\nRecent chat:\n${transcript}` : "",
      "",
      `Student: ${message}`,
      "Grokbot:",
    ]
      .filter((line) => line !== "")
      .join("\n");

    const input = [{ role: "user" as const, content: [{ type: "input_text" as const, text: prompt }] }];
    const createArgs = {
      model: client.model,
      reasoning: { effort: "low" as const },
      input,
    };
    let response: { output_text?: string; citations?: unknown };
    try {
      response = (await client.openai.responses.create({
        ...createArgs,
        tools: [{ type: "web_search" }],
      } as Parameters<typeof client.openai.responses.create>[0])) as {
        output_text?: string;
        citations?: unknown;
      };
    } catch {
      response = (await client.openai.responses.create(createArgs)) as {
        output_text?: string;
        citations?: unknown;
      };
    }

    const reply = String(response.output_text ?? "").trim();
    if (!reply) return Response.json({ error: "Grok returned an empty reply." }, { status: 502 });
    return Response.json({
      reply,
      citations: collectCitations(response),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Grok request failed.";
    return Response.json({ error: detail.slice(0, 240) }, { status: 502 });
  }
}

function serializeKnowledge(knowledge: ChatBody["knowledge"]): string {
  if (!knowledge) return JSON.stringify({ title: null, folders: [], notes: [] });
  const notes = (knowledge.notes ?? [])
    .filter((note) => note && typeof note.path === "string")
    .slice(0, 80)
    .map((note) => ({
      path: note.path.slice(0, 160),
      label: (note.label ?? note.path).slice(0, 80),
      summary: note.summary?.slice(0, 400),
      concepts: (note.concepts ?? []).slice(0, 8).map((item) => item.slice(0, 48)),
    }));
  const folders = (knowledge.folders ?? [])
    .filter((item): item is string => typeof item === "string")
    .slice(0, 40)
    .map((item) => item.slice(0, 80));
  return JSON.stringify({
    title: knowledge.title?.slice(0, 80) ?? null,
    folders,
    notes,
  });
}

function collectCitations(response: { citations?: unknown }): string[] {
  const urls = new Set<string>();
  if (Array.isArray(response.citations)) {
    for (const item of response.citations) {
      if (typeof item === "string" && /^https?:\/\//i.test(item)) urls.add(item);
      else if (
        item &&
        typeof item === "object" &&
        "url" in item &&
        typeof (item as { url: unknown }).url === "string"
      ) {
        urls.add((item as { url: string }).url);
      }
    }
  }
  return [...urls].slice(0, 8);
}
