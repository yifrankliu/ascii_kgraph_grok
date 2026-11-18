import type { RenderGraph } from "./renderer";

export interface Hit {
  id: string;
  col: number;
  row: number;
  radius: number;
  action?: "expand" | "preview";
}

const PALETTE = ["c0", "c1", "c2", "c3", "r0", "r1", "r2", "r3"];

/**
 * 3D cone graph: {*} / [#] / (o) glyphs with [labels] underneath,
 * perspective projection, continuous ASCII spokes.
 */
export function renderScene(
  graph: RenderGraph,
  cols: number,
  rows: number,
  yaw: number,
  pitch: number,
  hoverId: string | null,
  expanded: Set<string>,
): { html: string; hits: Hit[] } {
  const chars = Array<string>(cols * rows).fill(" ");
  const colors = Array<number>(cols * rows).fill(-1);
  const depth = Array<number>(cols * rows).fill(Infinity);
  const hits: Hit[] = [];

  const visible = visibleNodes(graph, expanded);
  const seen = new Map<
    string,
    { col: number; row: number; depth: number; near: number; node: RenderGraph["nodes"][number] }
  >();

  const plot = (col: number, row: number, z: number, ch: string, color: number) => {
    const c = Math.round(col);
    const r = Math.round(row);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const index = r * cols + c;
    if (z < depth[index]) {
      depth[index] = z;
      chars[index] = ch;
      colors[index] = color;
    }
  };

  const plotOver = (col: number, row: number, z: number, ch: string, color: number) => {
    const c = Math.round(col);
    const r = Math.round(row);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return;
    const index = r * cols + c;
    depth[index] = z;
    chars[index] = ch;
    colors[index] = color >= 0 ? color : -1;
  };

  for (const node of visible) {
    if (node.x === undefined || node.y === undefined || node.z === undefined) continue;
    const point = project(node.x, node.y, node.z, cols, rows, yaw, pitch);
    seen.set(node.id, { ...point, node });
  }

  const hot = new Set<string>();
  if (hoverId) {
    hot.add(hoverId);
    for (const edge of graph.edges) {
      if (edge.source === hoverId) hot.add(edge.target);
      if (edge.target === hoverId) hot.add(edge.source);
    }
  }

  for (const edge of graph.edges) {
    if (!seen.has(edge.source) || !seen.has(edge.target)) continue;
    const a = seen.get(edge.source);
    const b = seen.get(edge.target);
    if (!a || !b) continue;
    stroke(
      a,
      b,
      edge.kind === "relates",
      !hoverId || hot.has(edge.source) || hot.has(edge.target),
      plot,
    );
  }

  const labels: {
    col: number;
    row: number;
    depth: number;
    color: number;
    label: string;
  }[] = [];

  for (const [id, point] of seen) {
    const active = !hoverId || hot.has(id);
    const color = active ? (point.node.kind === "folder" ? 7 : 6) : 4;
    const root = id === graph.rootId;
    const marker =
      point.node.kind === "folder"
        ? root
          ? "{*}"
          : "[#]"
        : point.node.status === "pending"
          ? "(.)"
          : "(o)";
    drawMarker(point.col, point.row, marker, color, root || point.node.kind === "folder", plotOver);
    hits.push({
      id,
      col: point.col,
      row: point.row,
      radius: root ? 5 : point.node.kind === "folder" ? 4.5 : 3.5,
    });
    labels.push({
      col: point.col - (point.node.label.length + 2) / 2,
      row: point.row + 1,
      depth: point.depth - 0.03,
      color: active ? 7 : 4,
      label: `[${point.node.label}]`,
    });
  }

  labels.sort((a, b) => a.depth - b.depth);
  for (const label of labels) drawLabel(chars, cols, rows, label, plotOver);

  if (hoverId) {
    const focus = seen.get(hoverId);
    if (focus) {
      const toggleId =
        focus.node.kind === "folder" ? hoverId : (focus.node.parent ?? hoverId);
      const open = expanded.has(toggleId);
      hits.push(...drawHoverMenu(focus.col, focus.row, hoverId, open, cols, rows, plotOver));
    }
  }

  return { html: paint(chars, colors, cols), hits };
}

function visibleNodes(graph: RenderGraph, expanded: Set<string>) {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  return graph.nodes.filter((node) => {
    if (node.id === graph.rootId) return true;
    let parent = node.parent;
    if (!parent) return true;
    while (parent) {
      if (!expanded.has(parent)) return false;
      if (parent === graph.rootId) return true;
      parent = byId.get(parent)?.parent;
    }
    return false;
  });
}

function project(x: number, y: number, z: number, cols: number, rows: number, yaw: number, pitch: number) {
  const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
  const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
  const x2 = x * Math.cos(yaw) + z1 * Math.sin(yaw);
  const z2 = -x * Math.sin(yaw) + z1 * Math.cos(yaw);
  const camera = 2.85 - z2;
  const persp = 2.2 / camera;
  // Use most of the stage so wide viewports aren't empty on the sides.
  const spanX = cols * 0.46;
  const spanY = rows * 0.42;
  return {
    col: (cols - 1) / 2 + x2 * persp * spanX,
    row: (rows - 1) / 2 - y1 * persp * spanY + 1,
    depth: camera,
    near: clamp((z2 + 1) / 2, 0, 1),
  };
}

function drawMarker(
  col: number,
  row: number,
  marker: string,
  color: number,
  heavy: boolean,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): void {
  const cx = Math.round(col);
  const cy = Math.round(row);
  const pad = heavy ? 2 : 1;
  for (let dy = -pad; dy <= pad; dy++) {
    for (let dx = -pad - 1; dx <= pad + 1; dx++) {
      plot(cx + dx, cy + dy, 0.003, " ", -1);
    }
  }
  if (heavy) {
    plot(cx, cy - 1, 0.0025, ".", color);
    plot(cx - 2, cy, 0.0025, ".", color);
    plot(cx + 2, cy, 0.0025, ".", color);
  }
  const left = cx - Math.floor((marker.length - 1) / 2);
  for (let i = 0; i < marker.length; i++) plot(left + i, cy, 0.002, marker[i], color);
}

function stroke(
  a: { col: number; row: number; depth: number; near: number },
  b: { col: number; row: number; depth: number; near: number },
  relates: boolean,
  active: boolean,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): void {
  const dx = b.col - a.col;
  const dy = b.row - a.row;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy)));
  const glyph = relates
    ? Math.abs(dx) > Math.abs(dy)
      ? "·"
      : ":"
    : Math.abs(dx) > Math.abs(dy) * 2
      ? "-"
      : Math.abs(dy) > Math.abs(dx) * 2
        ? "|"
        : dx * dy < 0
          ? "/"
          : "\\";
  for (let step = 1; step < steps; step++) {
    const t = step / steps;
    const c = a.col + dx * t;
    const r = a.row + dy * t;
    if (Math.hypot(c - a.col, r - a.row) < 2.2) continue;
    if (Math.hypot(c - b.col, r - b.row) < 2.2) continue;
    plot(c, r, a.depth + (b.depth - a.depth) * t, glyph, band(a.near + (b.near - a.near) * t, relates, active));
  }
}

function drawLabel(
  chars: string[],
  cols: number,
  rows: number,
  label: { col: number; row: number; depth: number; color: number; label: string },
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): void {
  const offsets = [0, 1, -1, 2, -2, 3];
  let chosen = 0;
  for (const offset of offsets) {
    const row = Math.round(label.row + offset);
    if (row < 0 || row >= rows) continue;
    let clear = true;
    for (let i = 0; i < label.label.length; i++) {
      const col = Math.round(label.col + i);
      if (col < 0 || col >= cols) {
        clear = false;
        break;
      }
      if (chars[row * cols + col] !== " ") clear = false;
    }
    if (clear) {
      chosen = offset;
      break;
    }
  }
  const row = Math.round(label.row + chosen);
  const start = Math.round(label.col);
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= label.label.length; dx++) {
      const c = start + dx;
      const r = row + dy;
      if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
      if (dy === 0 && dx >= 0 && dx < label.label.length) continue;
      const ch = chars[r * cols + c];
      if (ch === "-" || ch === "|" || ch === "/" || ch === "\\" || ch === "·" || ch === ":" || ch === ".") {
        plot(c, r, 0.0015, " ", -1);
      }
    }
  }
  for (let i = 0; i < label.label.length; i++) {
    plot(start + i, row, 0.001, label.label[i], label.color);
  }
}

function drawHoverMenu(
  col: number,
  row: number,
  nodeId: string,
  isOpen: boolean,
  cols: number,
  rows: number,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): Hit[] {
  const expandLabel = isOpen ? "[collapse]" : "[expand]";
  const previewLabel = "[preview]";
  const cx = Math.round(col);
  const cy = Math.round(row);
  const need = Math.max(expandLabel.length, previewLabel.length) + 6;
  const dir = cx + need < cols - 1 ? 1 : -1;
  const stem = cx + dir * 2;
  const tip = cx + dir * 4;
  const up = cy - 1;
  const down = cy + 2;
  const color = 3;

  plot(cx + dir, cy, 0.001, "-", color);
  plot(stem, cy, 0.001, "+", color);
  plot(stem, up, 0.001, "|", color);
  plot(stem + dir, up, 0.001, "-", color);
  plot(tip, up, 0.001, "-", color);
  plot(stem, down, 0.001, "|", color);
  plot(stem + dir, down, 0.001, "-", color);
  plot(tip, down, 0.001, "-", color);

  const expandMid = paintAction(tip, up, expandLabel, dir, color, cols, rows, plot);
  const previewMid = paintAction(tip, down, previewLabel, dir, color, cols, rows, plot);
  return [
    { id: nodeId, col: expandMid, row: up, radius: Math.max(3, expandLabel.length / 2 + 1), action: "expand" },
    { id: nodeId, col: previewMid, row: down, radius: Math.max(3, previewLabel.length / 2 + 1), action: "preview" },
  ];
}

function paintAction(
  tip: number,
  row: number,
  text: string,
  dir: number,
  color: number,
  cols: number,
  rows: number,
  plot: (col: number, row: number, z: number, ch: string, color: number) => void,
): number {
  const start = dir > 0 ? tip + 1 : tip - text.length;
  for (let i = 0; i < text.length; i++) {
    const c = start + i;
    if (c < 0 || c >= cols || row < 0 || row >= rows) continue;
    plot(c, row, 0.0005, text[i], color);
  }
  return start + text.length / 2;
}

function band(near: number, relates: boolean, active: boolean): number {
  if (relates) return active ? 5 : 4;
  const level = active ? Math.min(3, 1 + Math.round(near * 2)) : 1;
  return level;
}

function paint(chars: string[], colors: number[], cols: number): string {
  let html = "";
  let run = -2;
  for (let i = 0; i < chars.length; i++) {
    if (i > 0 && i % cols === 0) {
      if (run !== -2) html += "</span>";
      html += "\n";
      run = -2;
    }
    const color = colors[i];
    if (color !== run) {
      if (run !== -2) html += "</span>";
      html += color >= 0 ? `<span class="${PALETTE[color]}">` : "";
      run = color;
    }
    html += chars[i] === "<" ? "&lt;" : chars[i] === ">" ? "&gt;" : chars[i] === "&" ? "&amp;" : chars[i];
  }
  if (run !== -2) html += "</span>";
  return html;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
