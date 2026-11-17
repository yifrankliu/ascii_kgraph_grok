import { readCache, writeCache } from "../ingest/cache";
import type { NoteFile } from "./skeleton";
import { applyExtract, applyLinks, markFailed } from "./merge";
import type { ExtractResult, Graph, LinkEdge } from "./types";

interface Hooks {
  onStatus: (message: string) => void;
  onChange: () => void;
}

export async function enrich(graph: Graph, notes: NoteFile[], hooks: Hooks): Promise<void> {
  const files = graph.nodes.filter((node) => node.kind === "file");
  let done = 0;
  let grokDown = false;

  await pool(notes, 4, async (note) => {
    const cached = readCache(note);
    if (cached) {
      applyExtract(graph, note.path, cached);
    } else if (!grokDown) {
      const result = await extractNote(note);
      if (result === "down") {
        grokDown = true;
        markFailed(graph, note.path);
      } else if (result) {
        applyExtract(graph, note.path, result);
        writeCache(note, result);
      } else {
        markFailed(graph, note.path);
      }
    } else {
      markFailed(graph, note.path);
    }
    done += 1;
    hooks.onStatus(
      grokDown
        ? "Grok is not configured, so this is the folder structure only."
        : `Grok is reading notes · ${done}/${notes.length}`,
    );
    hooks.onChange();
  });

  if (grokDown || files.every((node) => node.status !== "ready")) {
    hooks.onStatus("Grok is not configured, so this is the folder structure only.");
    return;
  }

  hooks.onStatus("Linking related notes…");
  const linked = await linkNotes(graph);
  if (linked) {
    applyLinks(graph, linked);
    hooks.onChange();
    hooks.onStatus("Cross-links are in.");
  } else {
    hooks.onStatus("Summaries are in. Cross-links did not come back.");
  }
}

async function textPayload(path: string, file: File): Promise<{ name: string; text: string } | null> {
  const text = (await file.text()).slice(0, 8000).trim();
  return text ? { name: path, text } : null;
}

async function extractNote(note: NoteFile): Promise<ExtractResult | "down" | null> {
  try {
    const payload = /\.pdf$/i.test(note.path)
      ? await (await import("../ingest/pdf")).payloadFor(note.path, note.file)
      : await textPayload(note.path, note.file);
    if (!payload) return null;
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 503) return "down";
    if (!response.ok) return null;
    const body = (await response.json()) as ExtractResult;
    if (typeof body.summary !== "string" || !Array.isArray(body.concepts)) return null;
    return { summary: body.summary, concepts: body.concepts.filter((item) => typeof item === "string") };
  } catch {
    return null;
  }
}

async function linkNotes(graph: Graph): Promise<LinkEdge[] | null> {
  const files = graph.nodes
    .filter((node) => node.kind === "file" && node.concepts?.length)
    .map((node) => ({ id: node.id, label: node.label, concepts: node.concepts ?? [] }));
  if (files.length < 2) return [];
  try {
    const response = await fetch("/api/link", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ files }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { edges?: LinkEdge[] };
    if (!Array.isArray(body.edges)) return null;
    return body.edges.filter(
      (edge) =>
        typeof edge.source === "string" &&
        typeof edge.target === "string" &&
        typeof edge.note === "string",
    );
  } catch {
    return null;
  }
}

async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await task(current);
    }
  });
  await Promise.all(workers);
}
