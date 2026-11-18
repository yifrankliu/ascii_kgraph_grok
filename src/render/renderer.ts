import { renderScene, type Hit } from "./scene";

export interface RenderNode {
  id: string;
  label: string;
  kind: "folder" | "file";
  status?: "pending" | "ready" | "failed";
  parent?: string;
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

export type NodeAction = "expand" | "preview";

type RendererHandle = {
  setGraph(next: RenderGraph): void;
  setExpanded(next: Set<string>): void;
  destroy(): void;
};

const MOUNT_KEY = "__traceRenderer";

export function createRenderer(
  mount: HTMLElement,
  opts?: {
    onExpand?: (id: string) => void;
    onPreview?: (id: string) => void;
  },
): RendererHandle {
  ensureStyle();
  const prior = (mount as HTMLElement & { [MOUNT_KEY]?: RendererHandle })[MOUNT_KEY];
  prior?.destroy();
  mount.classList.add("trace-stage");
  let graph: RenderGraph = { nodes: [], edges: [] };
  let expanded = new Set<string>();
  let raf = 0;
  let last = 0;
  let yaw = 0.4;
  let pitch = 0.15;
  let cols = 80;
  let rows = 32;
  let cellW = 8;
  let cellH = 16;
  let hoverId: string | null = null;
  let menuId: string | null = null;
  let dragging = false;
  let moved = 0;
  let pointerX = 0;
  let pointerY = 0;
  let inside = false;
  let hits: Hit[] = [];
  let autoSpin = true;

  const measure = () => {
    const probe = document.createElement("span");
    probe.textContent = "M";
    probe.className = "trace-probe";
    mount.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    probe.remove();
    cellW = rect.width || 8;
    cellH = rect.height || 16;
    cols = clamp(Math.floor(mount.clientWidth / cellW), 24, 220);
    rows = clamp(Math.floor(mount.clientHeight / cellH), 12, 90);
  };

  const frame = (now: number) => {
    const dt = last ? Math.min(0.05, (now - (last || now)) / 1000) : 0.016;
    last = now;
    if (autoSpin && !dragging && !inside) yaw += dt * 0.22;
    const scene = renderScene(graph, cols, rows, yaw, pitch, menuId, expanded);
    hits = scene.hits;
    mount.innerHTML = scene.html;
    if (inside) {
      const hit = nearestHit(pointerX, pointerY);
      hoverId = hit?.id ?? null;
      if (hit) menuId = hit.id;
      else menuId = null;
    } else {
      hoverId = null;
      menuId = null;
    }
  };

  const nearestHit = (x: number, y: number): Hit | null => {
    let best: Hit | null = null;
    let bestD = Infinity;
    for (const hit of hits) {
      const distance = Math.hypot(hit.col - x, hit.row - y);
      const reach = hit.action
        ? Math.max(4, hit.radius + 1.5)
        : Math.max(5.5, hit.radius + 3.5);
      const score = distance - (hit.action ? 0.75 : 0);
      if (distance <= reach && score < bestD) {
        bestD = score;
        best = hit;
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
    autoSpin = false;
    moved += Math.abs(event.movementX) + Math.abs(event.movementY);
  });
  mount.addEventListener("pointerup", (event) => {
    cellAt(event);
    const hit = nearestHit(pointerX, pointerY);
    dragging = false;
    if (moved < 5 && hit) {
      if (hit.action === "expand") opts?.onExpand?.(hit.id);
      else if (hit.action === "preview") opts?.onPreview?.(hit.id);
    }
    window.setTimeout(() => {
      if (!dragging && !menuId) autoSpin = true;
    }, 1800);
  });
  mount.addEventListener("pointerleave", () => {
    inside = false;
    hoverId = null;
    menuId = null;
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

  const handle: RendererHandle = {
    setGraph(next: RenderGraph) {
      graph = next;
    },
    setExpanded(next: Set<string>) {
      expanded = next;
    },
    destroy() {
      cancelAnimationFrame(raf);
      observer.disconnect();
      mount.replaceChildren();
      if ((mount as HTMLElement & { [MOUNT_KEY]?: RendererHandle })[MOUNT_KEY] === handle) {
        delete (mount as HTMLElement & { [MOUNT_KEY]?: RendererHandle })[MOUNT_KEY];
      }
    },
  };
  (mount as HTMLElement & { [MOUNT_KEY]?: RendererHandle })[MOUNT_KEY] = handle;
  return handle;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureStyle(): void {
  const css = `
    .trace-stage {
      cursor: grab;
      user-select: none;
      background: #000;
      color: #f4f4f0;
      font: 14px/1.15 ui-monospace, "Cascadia Code", Consolas, monospace;
      letter-spacing: 0.02em;
    }
    .trace-probe { font: 14px/1.15 ui-monospace, "Cascadia Code", Consolas, monospace; position: absolute; visibility: hidden; }
    .trace-stage .c0 { color: #5a5a54 }
    .trace-stage .c1 { color: #a8a8a0 }
    .trace-stage .c2 { color: #e8e8e0; text-shadow: 0 0 4px rgba(255,255,255,.2) }
    .trace-stage .c3 { color: #ffffff; text-shadow: 0 0 8px rgba(255,255,255,.45) }
    .trace-stage .r0 { color: #3d7a9e }
    .trace-stage .r1 { color: #7eb8d9; text-shadow: 0 0 6px rgba(100,180,230,.35) }
    .trace-stage .r2 { color: #4f8fd4; text-shadow: 0 0 1px #000, 0 0 8px rgba(40,100,200,.5) }
    .trace-stage .r3 {
      color: #6eb0ff;
      font-weight: 600;
      text-shadow: 0 0 1px #000, 0 1px 0 #000, 0 0 10px rgba(80,150,255,.55);
    }
  `;
  const existing = document.getElementById("trace-renderer-style");
  if (existing instanceof HTMLStyleElement) {
    existing.textContent = css;
    return;
  }
  const style = document.createElement("style");
  style.id = "trace-renderer-style";
  style.textContent = css;
  document.head.appendChild(style);
}
