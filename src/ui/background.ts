import { createKoi } from "./bg-koi";
import { createMatrix } from "./bg-matrix";

const PRESETS = ["dark", "koi", "matrix"] as const;
const STORAGE_KEY = "kgraph.background";

export type BackgroundPreset = (typeof PRESETS)[number];

interface Mask {
  c0: number;
  r0: number;
  c1: number;
  r1: number;
}

interface CellGrid {
  cols: number;
  rows: number;
  aspect: number;
  plot(col: number, row: number, ch: string, color: string): void;
}

export function mountBackground(opts?: { onUserPick?: (name: BackgroundPreset) => void }): {
  setPreset(name: BackgroundPreset, persist?: boolean): void;
  current(): BackgroundPreset;
  destroy(): void;
} {
  ensureStyle();
  const host = document.createElement("pre");
  host.id = "backdrop";
  host.setAttribute("aria-hidden", "true");
  const canvas = document.createElement("canvas");
  canvas.id = "matrix-canvas";
  canvas.hidden = true;
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(host, canvas);
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });

  const grid = createGrid();
  const koi = createKoi();
  const matrix = createMatrix();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let preset: BackgroundPreset = readPreset();
  let raf = 0;
  let last = 0;
  let alive = true;
  let shown: BackgroundPreset | "" = "";
  let cell = { w: 7.2, h: 12 };
  let bits: Uint8Array | null = null;
  let roofs = new Int16Array(0);
  let bitsAt = 0;
  let matrixCell = { cols: 80, rows: 40, w: 10, h: 16, font: 16, dpr: 1 };

  const buttons = mountControls((name) => setPreset(name));

  function resize(): void {
    host.style.fontSize = "";
    cell = measure(host);
    let cols = Math.ceil(window.innerWidth / cell.w);
    let rows = Math.ceil(window.innerHeight / cell.h);
    const maxCols = 200;
    const maxRows = 72;
    if (cols > maxCols || rows > maxRows) {
      const scale = Math.max(cols / maxCols, rows / maxRows);
      host.style.fontSize = `${Math.ceil(12 * scale)}px`;
      cell = measure(host);
      cols = Math.ceil(window.innerWidth / cell.w) + 1;
      rows = Math.ceil(window.innerHeight / cell.h) + 1;
    }
    cols = clamp(cols, 24, maxCols + 2);
    rows = clamp(rows, 12, maxRows + 2);
    grid.resize(cols, rows, cell.h / cell.w);
    koi.resize(cols, rows);
    matrixCell = fitMatrix(ctx);
    matrix.resize(matrixCell.cols, matrixCell.rows);
    bits = null;
    bitsAt = 0;
    forgetStage();
    shown = "";
    paint(0);
  }

  function paint(dt: number): void {
    if (preset !== "matrix") {
      canvas.hidden = true;
      host.style.display = "";
    }
    if (preset === "dark") {
      if (shown !== "dark") {
        host.textContent = "";
        shown = "dark";
      }
      return;
    }
    if (preset === "matrix" && ctx) {
      if (shown !== "matrix") host.textContent = "";
      shown = "matrix";
      host.style.display = "none";
      canvas.hidden = false;
      matrix.draw(matrixSurface(), dt);
      matrix.blit(ctx, matrixCell.w, matrixCell.h, matrixCell.font, matrixCell.dpr, window.innerWidth, window.innerHeight);
      return;
    }
    shown = preset;
    grid.clear();
    grid.hold(graphBox(cell));
    grid.cover(null);
    koi.draw(grid, dt);
    host.innerHTML = grid.html();
  }

  function loop(now: number): void {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    if (last !== 0 && now - last < 32) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    paint(dt);
  }

  function setPreset(name: BackgroundPreset, persist = true): void {
    preset = name;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, name);
      } catch {
        /* storage unavailable */
      }
      opts?.onUserPick?.(name);
    }
    for (const button of buttons) {
      button.setAttribute("aria-pressed", button.dataset.preset === name ? "true" : "false");
    }
    shown = "";
    paint(0.016);
    kick();
  }

  function fitMatrix(context: CanvasRenderingContext2D | null): {
    cols: number;
    rows: number;
    w: number;
    h: number;
    font: number;
    dpr: number;
  } {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;
    const pixelsW = Math.max(1, Math.round(viewW * dpr));
    const pixelsH = Math.max(1, Math.round(viewH * dpr));
    if (canvas.width !== pixelsW || canvas.height !== pixelsH) {
      canvas.width = pixelsW;
      canvas.height = pixelsH;
    }
    let font = 16;
    let width = 10;
    if (context) {
      context.font = `${font}px ui-monospace, Consolas, monospace`;
      width = context.measureText("M").width || 10;
    }
    let cols = Math.ceil(viewW / width);
    let rows = Math.ceil(viewH / font);
    if (cols > 110 || rows > 42) {
      const scale = Math.max(cols / 110, rows / 42);
      font = Math.ceil(16 * scale);
      width = font * 0.62;
      if (context) {
        context.font = `${font}px ui-monospace, Consolas, monospace`;
        width = context.measureText("M").width || width;
      }
      cols = Math.ceil(viewW / width);
      rows = Math.ceil(viewH / font);
    }
    return {
      cols: clamp(cols, 24, 120),
      rows: clamp(rows, 12, 48),
      w: width,
      h: font,
      font,
      dpr,
    };
  }

  function matrixSurface(): { roof(col: number): number; blocked(col: number, row: number): boolean } {
    const count = matrixCell.cols * matrixCell.rows;
    const now = performance.now();
    if (!bits || bits.length !== count || roofs.length !== matrixCell.cols || now - bitsAt > 400) {
      if (!bits || bits.length !== count) bits = new Uint8Array(count);
      if (roofs.length !== matrixCell.cols) roofs = new Int16Array(matrixCell.cols);
      writeSolids({ w: matrixCell.w, h: matrixCell.h }, matrixCell.cols, matrixCell.rows, bits, roofs);
      bitsAt = now;
    }
    const cols = matrixCell.cols;
    const rows = matrixCell.rows;
    const solid = bits;
    const tops = roofs;
    return {
      roof(col) {
        const c = Math.round(col);
        if (c < 0 || c >= tops.length) return -1;
        return tops[c] ?? -1;
      },
      blocked(col, row) {
        const c = Math.round(col);
        const r = Math.round(row);
        if (!solid || c < 0 || r < 0 || c >= cols || r >= rows) return false;
        return solid[r * cols + c] === 1;
      },
    };
  }

  function kick(): void {
    const animate = alive && !reduce && preset !== "dark";
    if (!animate) {
      cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
      return;
    }
    if (raf) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  resize();
  setPreset(preset);
  window.addEventListener("resize", resize);

  return {
    setPreset,
    current() {
      return preset;
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      host.remove();
      canvas.remove();
      document.getElementById("bg-presets")?.remove();
    },
  };
}

function createGrid(): CellGrid & {
  resize(cols: number, rows: number, aspect: number): void;
  clear(): void;
  hold(next: Mask | null): void;
  cover(bits: Uint8Array | null, ready?: Int16Array): void;
  roof(col: number): number;
  blocked(col: number, row: number): boolean;
  box(): Mask | null;
  html(): string;
} {
  let cols = 0;
  let rows = 0;
  let aspect = 1.7;
  let mask: Mask | null = null;
  let solids: Uint8Array | null = null;
  let roofs = new Int16Array(0);
  let chars: string[] = [];
  let colors: string[] = [];
  let dirty: number[] = [];

  return {
    get cols() {
      return cols;
    },
    get rows() {
      return rows;
    },
    get aspect() {
      return aspect;
    },
    resize(nextCols, nextRows, nextAspect) {
      cols = nextCols;
      rows = nextRows;
      aspect = nextAspect || 1.7;
      chars = Array<string>(cols * rows).fill(" ");
      colors = Array<string>(cols * rows).fill("");
      dirty = [];
    },
    clear() {
      for (let i = 0; i < dirty.length; i++) {
        const index = dirty[i] ?? 0;
        chars[index] = " ";
        colors[index] = "";
      }
      dirty.length = 0;
    },
    hold(next) {
      mask = next;
    },
    cover(bits, ready) {
      solids = bits;
      if (roofs.length !== cols) roofs = new Int16Array(cols);
      if (ready && ready.length === cols) {
        roofs.set(ready);
        return;
      }
      roofs.fill(-1);
    },
    roof(col) {
      const c = Math.round(col);
      if (c < 0 || c >= roofs.length) return -1;
      return roofs[c] ?? -1;
    },
    blocked(col, row) {
      const c = Math.round(col);
      const r = Math.round(row);
      if (!solids || c < 0 || r < 0 || c >= cols || r >= rows) return false;
      return solids[r * cols + c] === 1;
    },
    box() {
      return mask;
    },
    plot(col, row, ch, color) {
      const c = Math.round(col);
      const r = Math.round(row);
      if (c < 0 || r < 0 || c >= cols || r >= rows) return;
      if (mask && c >= mask.c0 && c <= mask.c1 && r >= mask.r0 && r <= mask.r1) return;
      const index = r * cols + c;
      if (solids && solids[index] === 1) return;
      if (chars[index] === " ") dirty.push(index);
      chars[index] = ch;
      colors[index] = color;
    },
    html() {
      let html = "";
      let run = "";
      for (let i = 0; i < chars.length; i++) {
        if (i > 0 && i % cols === 0) {
          if (run) html += "</span>";
          html += "\n";
          run = "";
        }
        const color = colors[i] ?? "";
        if (color !== run) {
          if (run) html += "</span>";
          html += color ? `<span class="${color}">` : "";
          run = color;
        }
        const ch = chars[i] ?? " ";
        html += ch === "<" ? "&lt;" : ch === ">" ? "&gt;" : ch === "&" ? "&amp;" : ch;
      }
      if (run) html += "</span>";
      return html;
    },
  };
}

function graphBox(cell: { w: number; h: number }): Mask | null {
  const stage = document.querySelector("#stage");
  if (!(stage instanceof HTMLElement) || cell.w <= 0 || cell.h <= 0) return null;
  const lines = (stage.textContent ?? "").split("\n");
  let minC = Infinity;
  let minR = Infinity;
  let maxC = -1;
  let maxR = -1;
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r] ?? "";
    for (let c = 0; c < line.length; c++) {
      if (line[c] === " ") continue;
      if (c < minC) minC = c;
      if (c > maxC) maxC = c;
      if (r < minR) minR = r;
      if (r > maxR) maxR = r;
    }
  }
  if (maxC < 0) return null;
  const glyph = stageMetrics(stage);
  if (!glyph) return null;
  const pad = 2;
  const left = glyph.x + minC * glyph.w;
  const right = glyph.x + (maxC + 1) * glyph.w;
  const top = glyph.y + minR * glyph.h;
  const bottom = glyph.y + (maxR + 1) * glyph.h;
  return {
    c0: Math.floor(left / cell.w) - pad,
    r0: Math.floor(top / cell.h) - pad,
    c1: Math.ceil(right / cell.w) + pad,
    r1: Math.ceil(bottom / cell.h) + pad,
  };
}

function writeSolids(
  cell: { w: number; h: number },
  cols: number,
  rows: number,
  solids: Uint8Array,
  roofs: Int16Array,
): void {
  solids.fill(0);
  roofs.fill(-1);
  const stage = document.querySelector("#stage");
  if (!(stage instanceof HTMLElement) || cell.w <= 0 || cell.h <= 0) return;
  const glyph = stageMetrics(stage);
  if (!glyph) return;
  const lines = (stage.textContent ?? "").split("\n");
  for (let r = 0; r < lines.length; r++) {
    const line = lines[r] ?? "";
    const top = glyph.y + r * glyph.h;
    const bottom = top + glyph.h;
    const r0 = Math.max(0, Math.floor(top / cell.h));
    const r1 = Math.min(rows - 1, Math.ceil(bottom / cell.h) - 1);
    if (r1 < r0) continue;
    for (let c = 0; c < line.length; c++) {
      if (line[c] === " ") continue;
      const left = glyph.x + c * glyph.w;
      const right = left + glyph.w;
      const c0 = Math.max(0, Math.floor(left / cell.w));
      const c1 = Math.min(cols - 1, Math.ceil(right / cell.w) - 1);
      for (let br = r0; br <= r1; br++) {
        const row = br * cols;
        for (let bc = c0; bc <= c1; bc++) {
          solids[row + bc] = 1;
          if (roofs[bc] < 0) roofs[bc] = br;
        }
      }
    }
  }
}

let glyphCache: { x: number; y: number; w: number; h: number; at: number } | null = null;

function forgetStage(): void {
  glyphCache = null;
}

function stageMetrics(stage: HTMLElement): { x: number; y: number; w: number; h: number } | null {
  const now = performance.now();
  if (glyphCache && now - glyphCache.at < 500) return glyphCache;
  const next = stageCell(stage);
  if (!next) return glyphCache;
  glyphCache = { ...next, at: now };
  return glyphCache;
}

function stageCell(stage: HTMLElement): { x: number; y: number; w: number; h: number } | null {
  const style = getComputedStyle(stage);
  const probe = document.createElement("span");
  probe.textContent = "M";
  probe.style.position = "absolute";
  probe.style.visibility = "hidden";
  probe.style.fontFamily = style.fontFamily;
  probe.style.fontSize = style.fontSize;
  probe.style.lineHeight = style.lineHeight;
  probe.style.letterSpacing = style.letterSpacing;
  stage.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const box = stage.getBoundingClientRect();
  const gap = style.letterSpacing === "normal" ? 0 : Number.parseFloat(style.letterSpacing) || 0;
  return {
    x: box.left + (Number.parseFloat(style.borderLeftWidth) || 0) + (Number.parseFloat(style.paddingLeft) || 0),
    y: box.top + (Number.parseFloat(style.borderTopWidth) || 0) + (Number.parseFloat(style.paddingTop) || 0),
    w: rect.width + gap,
    h: rect.height,
  };
}

function measure(host: HTMLElement): { w: number; h: number } {
  const probe = document.createElement("span");
  probe.className = "bg-probe";
  probe.textContent = "M";
  host.appendChild(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return { w: rect.width || 7.2, h: rect.height || 12 };
}

function mountControls(onPick: (name: BackgroundPreset) => void): HTMLButtonElement[] {
  const footer = document.querySelector("footer");
  const row = document.createElement("div");
  row.id = "bg-presets";
  row.setAttribute("role", "group");
  row.setAttribute("aria-label", "Background");
  const buttons = PRESETS.map((name) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.preset = name;
    button.textContent = name;
    button.addEventListener("click", () => onPick(name));
    row.append(button);
    return button;
  });
  if (!document.getElementById("bg-presets")) footer?.prepend(row);
  return buttons;
}

function readPreset(): BackgroundPreset {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "koi" || saved === "matrix") return saved;
  } catch {
    /* storage unavailable */
  }
  return "dark";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function ensureStyle(): void {
  let style = document.getElementById("bg-style");
  if (!(style instanceof HTMLStyleElement)) {
    style = document.createElement("style");
    style.id = "bg-style";
  }
  style.textContent = `
    body { isolation: isolate; }
    #backdrop {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 0;
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      contain: strict;
      min-width: 100%;
      min-height: 100%;
      box-sizing: border-box;
      pointer-events: none;
      background: #000;
      color: #000;
      font: 12px/1 ui-monospace, Consolas, monospace;
      letter-spacing: 0;
      overflow: hidden;
      user-select: none;
      white-space: pre;
    }
    #backdrop .bg-probe { position: absolute; visibility: hidden; font: inherit; letter-spacing: inherit; }
    #matrix-canvas {
      position: fixed;
      top: 0;
      left: 0;
      z-index: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      contain: strict;
    }
    #matrix-canvas[hidden] { display: none; }
    body > header,
    body > #stage { position: relative; z-index: 1; }
    body > header { text-shadow: 0 0 3px #000; }
    body > footer {
      position: relative;
      z-index: 3;
      background: #000;
    }
    #panel { z-index: 2; }
    #friends-panel { z-index: 3; }
    #stage.trace-stage {
      width: 100%;
      background: transparent;
      text-shadow: 0 0 3px rgba(0, 0, 0, 0.85);
    }
    #backdrop .kw { background: #f4f0e6; color: #8d877c }
    #backdrop .kr { background: #de4228; color: #7a261c }
    #backdrop .kk { background: #2a2a32; color: #c8ced6 }
    #backdrop .kg { background: #eeb640; color: #7d5c1c }
    #backdrop .ko { background: #ec7c2c; color: #7c3c12 }
    #backdrop .kf { color: #ddd4c8 }
    #backdrop .kedge { color: #c9c2b6 }
    #backdrop .kgl { color: #fffaf3 }
    #backdrop .r2 { color: #b7e6f4 }
    #backdrop .r1 { color: #3d97b4 }
    #backdrop .r0 { color: #1a4d60 }
    #backdrop .m3 { color: #b6ffb6 }
    #backdrop .m2 { color: #3ee066 }
    #backdrop .m1 { color: #14943c }
    #backdrop .m0 { color: #0c5324 }
    footer #bg-presets { display: flex; gap: 0.95rem; }
    footer #bg-presets button {
      color: #9a948a;
      text-decoration: none;
      letter-spacing: 0.08em;
    }
    footer #bg-presets button[aria-pressed="true"] {
      color: #d7f3f8;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  `;
  document.head.appendChild(style);
}
