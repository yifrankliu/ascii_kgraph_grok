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
  "When the user asks about Yale courses, catalogs, prerequisites, or what to take next, use web search and prefer current pages on catalog.yale.edu, courses.yale.edu, ocs.yale.edu, registrar.yale.edu, and yale.edu. Cite course codes and source URLs when you find them.",
  "Keep replies concise and plain text (no markdown tables). Use short paragraphs or bullet lines with '- '.",
  "Tone: helpful, direct, a little dry — matching a terminal UI.",
].join(" ");

export async function POST(request: Request): Promise<Response> {
  try {
    const apiKey = process.env.XAI_API_KEY;
    const model = process.env.XAI_MODEL;
    if (!apiKey || !model) {
      return Response.json(
        { error: "Set XAI_API_KEY and XAI_MODEL on the Vercel project." },
        { status: 503 },
      );
    }

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

    const payload = {
      model,
      reasoning: { effort: "low" },
      tools: [{ type: "web_search" }],
      input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    };

    let upstream = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!upstream.ok) {
      // Retry without web_search if the model/tool combo is rejected.
      upstream = await fetch("https://api.x.ai/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${apiKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          reasoning: { effort: "low" },
          input: payload.input,
        }),
      });
    }

    const raw = await upstream.text();
    if (!upstream.ok) {
      return Response.json(
        { error: `Grok request failed (${upstream.status}).` },
        { status: 502 },
      );
    }

    let parsed: { output_text?: string; citations?: unknown; output?: unknown } = {};
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      return Response.json({ error: "Grok returned invalid JSON." }, { status: 502 });
    }

    const reply = (parsed.output_text ?? extractOutputText(parsed.output) ?? "").trim();
    if (!reply) return Response.json({ error: "Grok returned an empty reply." }, { status: 502 });
    return Response.json({ reply, citations: collectCitations(parsed) });
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

function extractOutputText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  const parts: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const content = "content" in item ? (item as { content?: unknown }).content : undefined;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (
        block &&
        typeof block === "object" &&
        "text" in block &&
        typeof (block as { text: unknown }).text === "string"
      ) {
        parts.push((block as { text: string }).text);
      }
    }
  }
  return parts.join("\n");
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
