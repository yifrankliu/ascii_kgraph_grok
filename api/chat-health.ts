import { grokClient } from "./grok";

export async function GET(): Promise<Response> {
  try {
    const client = grokClient();
    if (client instanceof Response) return client;
    return Response.json({
      ok: true,
      model: client.model,
      hasKey: Boolean(process.env.XAI_API_KEY),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "failed" },
      { status: 500 },
    );
  }
}
