import type { Graph, GraphNode } from "./types";

/** Recursive cone tree: root at the top, each folder fans into its children. */
export function layout(graph: Graph, keepPositions = false, _expanded?: Set<string>): void {
  if (!keepPositions || graph.nodes.every((node) => node.x === undefined)) {
    placeTree(graph);
  }
  nudgeRelates(graph);
  normalize(graph);
}

function placeTree(graph: Graph): void {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const children = new Map<string, string[]>();
  for (const edge of graph.edges) {
    if (edge.kind !== "contains") continue;
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    const list = children.get(edge.source) ?? [];
    list.push(edge.target);
    children.set(edge.source, list);
  }
  for (const list of children.values()) {
    list.sort((a, b) => {
      const left = byId.get(a);
      const right = byId.get(b);
      if (left?.kind !== right?.kind) return left?.kind === "folder" ? -1 : 1;
      return (left?.label ?? a).localeCompare(right?.label ?? b);
    });
  }

  const rootId = graph.rootId ?? findRoot(graph);
  const weight = new Map<string, number>();
  const weigh = (id: string): number => {
    const kids = children.get(id) ?? [];
    const total = kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + weigh(kid), 0);
    weight.set(id, total);
    return total;
  };
  weigh(rootId);

  const root = byId.get(rootId);
  if (root) {
    root.x = 0;
    root.y = 0.98;
    root.z = 0;
    root.depth = 0;
  }

  const top = children.get(rootId) ?? [];
  if (top.length === 0) return;

  const full = Math.PI * 2;
  const shares = angleShares(
    top.map((kid) => weight.get(kid) ?? 1),
    full,
  );
  let cursor = -Math.PI;
  top.forEach((kid, index) => {
    placeFan(kid, 1, cursor, shares[index], byId, children, weight);
    cursor += shares[index];
  });
}

function angleShares(weights: number[], full: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || weights.length;
  const raw = weights.map((w) => (w / sum) * full);
  const floor = Math.min(full / Math.max(weights.length, 1), 0.9);
  const boosted = raw.map((share) => Math.max(share, floor));
  const boostedSum = boosted.reduce((a, b) => a + b, 0);
  return boosted.map((share) => (share / boostedSum) * full);
}

function placeFan(
  id: string,
  depth: number,
  start: number,
  span: number,
  byId: Map<string, GraphNode>,
  children: Map<string, string[]>,
  weight: Map<string, number>,
): void {
  const node = byId.get(id);
  if (!node) return;
  const mid = start + span / 2;
  const radius = 0.55 + (depth - 1) * 0.7;
  node.x = Math.sin(mid) * radius;
  node.z = Math.cos(mid) * radius;
  node.y = 1.05 - depth * 0.52;
  node.depth = depth;

  const kids = children.get(id) ?? [];
  if (kids.length === 0) return;
  const usable = Math.max(span * 0.95, Math.min(span * 1.55, kids.length * 0.55));
  const shares = angleShares(
    kids.map((kid) => weight.get(kid) ?? 1),
    usable,
  );
  let cursor = mid - usable / 2;
  kids.forEach((kid, index) => {
    placeFan(kid, depth + 1, cursor, shares[index], byId, children, weight);
    cursor += shares[index];
  });
}

function findRoot(graph: Graph): string {
  const targets = new Set(
    graph.edges.filter((edge) => edge.kind === "contains").map((edge) => edge.target),
  );
  const roots = graph.nodes.filter((node) => !targets.has(node.id));
  return roots[0]?.id ?? graph.nodes[0]?.id ?? "";
}

function nudgeRelates(graph: Graph): void {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  for (const edge of graph.edges) {
    if (edge.kind !== "relates") continue;
    const a = byId.get(edge.source);
    const b = byId.get(edge.target);
    if (!a || !b || a.x === undefined || b.x === undefined) continue;
    const mx = ((a.x ?? 0) + (b.x ?? 0)) / 2;
    const mz = ((a.z ?? 0) + (b.z ?? 0)) / 2;
    a.x = (a.x ?? 0) * 0.92 + mx * 0.08;
    a.z = (a.z ?? 0) * 0.92 + mz * 0.08;
    b.x = (b.x ?? 0) * 0.92 + mx * 0.08;
    b.z = (b.z ?? 0) * 0.92 + mz * 0.08;
  }
}

function normalize(graph: Graph): void {
  let max = 0;
  for (const node of graph.nodes) {
    max = Math.max(max, Math.hypot(node.x ?? 0, node.y ?? 0, node.z ?? 0));
  }
  const scale = max > 0 ? 1 / max : 1;
  for (const node of graph.nodes) {
    node.x = (node.x ?? 0) * scale;
    node.y = (node.y ?? 0) * scale;
    node.z = (node.z ?? 0) * scale;
  }
}
