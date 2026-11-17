import type { ExtractResult, Graph, LinkEdge } from "./types";

export function applyExtract(graph: Graph, id: string, result: ExtractResult): void {
  const node = graph.nodes.find((item) => item.id === id);
  if (!node) return;
  node.summary = result.summary;
  node.concepts = result.concepts.slice(0, 6);
  node.status = "ready";
}

export function markFailed(graph: Graph, id: string): void {
  const node = graph.nodes.find((item) => item.id === id);
  if (node && node.status !== "ready") node.status = "failed";
}

export function applyLinks(graph: Graph, links: LinkEdge[]): void {
  graph.edges = graph.edges.filter((edge) => edge.kind !== "relates");
  const ids = new Set(graph.nodes.map((node) => node.id));
  const seen = new Set<string>();
  const count = new Map<string, number>();

  for (const link of links) {
    if (!ids.has(link.source) || !ids.has(link.target) || link.source === link.target) continue;
    const key = [link.source, link.target].sort().join("\0");
    if (seen.has(key)) continue;
    if ((count.get(link.source) ?? 0) >= 2 || (count.get(link.target) ?? 0) >= 2) continue;
    seen.add(key);
    count.set(link.source, (count.get(link.source) ?? 0) + 1);
    count.set(link.target, (count.get(link.target) ?? 0) + 1);
    graph.edges.push({
      source: link.source,
      target: link.target,
      kind: "relates",
      note: link.note.split(/\s+/).slice(0, 12).join(" "),
    });
  }
}
