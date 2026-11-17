import { renderScene, type Hit } from "./scene";

export interface RenderNode {
  id: string;
  label: string;
  kind: "folder" | "file";
  status?: "pending" | "ready" | "failed";
  x?: number;
  y?: number;
  z?: number;
  depth?: number;
}

export interface RenderEdge {
  source: string;
  target: string;
  kind: "contains" | "relates";
}

export interface RenderGraph {
  title?: string;
  rootId?: string;
  nodes: RenderNode[];
  edges: RenderEdge[];
}

export function createRenderer(mount: HTMLElement, opts?: { onSelect?: (id: string) => void }) {
  ensureStyle();
  mount.classList.add("trace-stage");
  let graph: RenderGraph = { nodes: [], edges: [] };
  let raf = 0;
  let last = 0;
  let yaw = 0.4;
  let pitch = 0.15;
  let cols = 80;
  let rows = 32;
  let cellW = 8;
  let cellH = 16;
  let hoverId: string | null = null;
  let dragging = false;
  let moved = 0;
  let pointerX = 0;
  let pointerY = 0;
  let inside = false;
  let hits: Hit[] = [];

  const measure = () => {
    const probe = document.createElement("span");
    probe.textContent = "M";
    probe.className = "trace-probe";
    mount.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    cellW = rect.width || 8;
    cellH = rect.height || 16;
    cols = clamp(Math.floor(mount.clientWidth / cellW), 24, 140);
    rows = clamp(Math.floor(mount.clientHeight / cellH), 12, 60);
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
    last = now;
    if (!hoverId && !dragging) yaw += dt * 0.22;
    const scene = renderScene(graph, cols, rows, yaw, pitch, hoverId);
    hits = scene.hits;
    mount.innerHTML = scene.html;
    hoverId = inside ? nearest(pointerX, pointerY) : null;
  };

  const nearest = (x: number, y: number) => {
    let best: string | null = null;
    let bestD = 2.1;
    for (const hit of hits) {
      const distance = Math.hypot(hit.col - x, hit.row - y);
      if (distance < bestD) {
        bestD = distance;
        best = hit.id;
      }
    }
    return best;
  };

  const cellAt = (event: PointerEvent) => {
    const rect = mount.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / cellW;
    pointerY = (event.clientY - rect.top) / cellH;
    inside = true;
  };

  mount.addEventListener("pointerdown", (event) => {
    dragging = true;
    moved = 0;
    cellAt(event);
    mount.setPointerCapture(event.pointerId);
  });
  mount.addEventListener("pointermove", (event) => {
    const previousX = pointerX;
    const previousY = pointerY;
    cellAt(event);
    if (!dragging) return;
    yaw += (pointerX - previousX) * cellW * 0.01;
    pitch = clamp(pitch + (pointerY - previousY) * cellH * 0.01, -1.1, 1.1);
    moved += Math.abs(event.movementX) + Math.abs(event.movementY);
  });
  mount.addEventListener("pointerup", (event) => {
    cellAt(event);
    const id = nearest(pointerX, pointerY);
    dragging = false;
    if (moved < 5 && id) opts?.onSelect?.(id);
  });
  mount.addEventListener("pointerleave", () => {
    inside = false;
    hoverId = null;
    dragging = false;
  });

  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(mount);
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (last !== 0 && now - last < 32) return;
    frame(now);
  };
  raf = requestAnimationFrame(loop);

  return {
    setGraph(next: RenderGraph) {
      graph = next;
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mount.replaceChildren();
    },
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureStyle(): void {
  if (document.getElementById("trace-renderer-style")) return;
  const style = document.createElement("style");
  style.id = "trace-renderer-style";
  style.textContent = `
    .trace-stage { cursor: grab; user-select: none; text-shadow: 0 0 10px rgba(232,228,220,.28); font: 13px/1 ui-monospace, Consolas, monospace; }
    .trace-probe { font: 13px/1 ui-monospace, Consolas, monospace; position: absolute; visibility: hidden; }
    .trace-stage .c0 { color: #4c483f } .trace-stage .c1 { color: #8d877c }
    .trace-stage .c2 { color: #d8d2c6 } .trace-stage .c3 { color: #f7f3ea }
    .trace-stage .r0 { color: #3c5e68 } .trace-stage .r1 { color: #5f8f9e }
    .trace-stage .r2 { color: #8fc4d2 } .trace-stage .r3 { color: #d7f3f8 }
  `;
  document.head.appendChild(style);
}
