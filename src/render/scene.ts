import type { RenderGraph } from "./renderer";

export interface Hit {
  id: string;
  col: number;
  row: number;
}

const PALETTE = ["c0", "c1", "c2", "c3", "r0", "r1", "r2", "r3"];

export function renderScene(
  graph: RenderGraph,
  cols: number,
  rows: number,
  yaw: number,
  pitch: number,
  hoverId: string | null,
): { html: string; hits: Hit[] } {
  const chars = Array<string>(cols * rows).fill(" ");
  const colors = Array<number>(cols * rows).fill(-1);
  const depth = Array<number>(cols * rows).fill(Infinity);
  const hits: Hit[] = [];
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

  for (const node of graph.nodes) {
    if (node.x === undefined || node.y === undefined || node.z === undefined) continue;
    const point = project(node.x, node.y, node.z, cols, rows, yaw, pitch);
    seen.set(node.id, { ...point, node });
    hits.push({ id: node.id, col: point.col, row: point.row });
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
    below: boolean;
  }[] = [];

  for (const [id, point] of seen) {
    const active = !hoverId || hot.has(id);
    const color = band(point.near, false, active);
    const root = id === graph.rootId;
    const glyph =
      point.node.kind === "folder"
        ? root
          ? "{*}"
          : "[#]"
        : point.node.status === "pending"
          ? "(.)"
          : "(o)";
    const left = point.col - (glyph.length - 1) / 2;
    for (let i = 0; i < glyph.length; i++) {
      plot(left + i, point.row, 0.002, glyph[i], color);
    }
    labels.push({
      col: point.col - point.node.label.length / 2,
      row: point.row + 1,
      depth: point.depth - 0.03,
      color,
      label: point.node.label,
      below: true,
    });
  }

  labels.sort((a, b) => a.depth - b.depth);
  for (const label of labels) drawLabel(chars, cols, rows, label, plot);

  return { html: paint(chars, colors, cols), hits };
}

function project(x: number, y: number, z: number, cols: number, rows: number, yaw: number, pitch: number) {
  const y1 = y * Math.cos(pitch) - z * Math.sin(pitch);
  const z1 = y * Math.sin(pitch) + z * Math.cos(pitch);
  const x2 = x * Math.cos(yaw) + z1 * Math.sin(yaw);
  const z2 = -x * Math.sin(yaw) + z1 * Math.cos(yaw);
  const camera = 2.85 - z2;
  const persp = 2.2 / camera;
  const span = Math.min(cols, rows * 2) * 0.56;
  return {
    col: (cols - 1) / 2 + x2 * persp * span,
    row: (rows - 1) / 2 - y1 * persp * span * 0.55 + 2,
    depth: camera,
    near: clamp((z2 + 1) / 2, 0, 1),
  };
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
    plot(
      a.col + dx * t,
      a.row + dy * t,
      a.depth + (b.depth - a.depth) * t,
      glyph,
      band(a.near + (b.near - a.near) * t, relates, active),
    );
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
      if (col < 0 || col >= cols) continue;
      if (chars[row * cols + col] !== " ") clear = false;
    }
    if (clear) {
      chosen = offset;
      break;
    }
  }
  for (let i = 0; i < label.label.length; i++) {
    // Labels always win over edges so folder names stay readable.
    plot(label.col + i, label.row + chosen, 0.001, label.label[i], label.color);
  }
}

function band(near: number, relates: boolean, active: boolean): number {
  const level = active ? Math.min(3, 1 + Math.round(near * 2)) : 0;
  return (relates ? 4 : 0) + level;
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
